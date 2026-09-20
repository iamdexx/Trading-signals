import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { buildRegimeMap, createEngineContext, stepProduct } from '../core/engine.js';
import { computePortfolio } from '../core/ledger.js';
import type { LedgerEntry } from '../core/ledger.js';
import { unrealizedPnl } from '../core/pnl.js';
import type { EngineState, Position, Regime, StrategyConfig } from '../core/types.js';
import type { Heartbeat, Settings } from '../shared/api.js';
import { candles as fetchCandles, products as fetchProducts, type Product } from './market.js';
import {
  clearProductError,
  equity,
  getSettings,
  insertSignal,
  latestCandleTime,
  ledgerEntries as storedLedgerEntries,
  loadCandles,
  openPosition,
  positions,
  productErrors,
  processedBar,
  saveCandles,
  saveEquity,
  savePosition,
  saveUniverse,
  setProcessedBar,
  setProductError,
  universe,
  updatePosition,
} from './db.js';
import { newsContext, syncNews } from './news.js';
import {
  analysisResponse,
  createLedgerResponse,
  ledgerResponse,
  backtestResponse,
  candlesResponse,
  diagnosticsResponse,
  healthResponse,
  newsResponse,
  newsSummaryResponse,
  portfolioResponse,
  positionsResponse,
  resetResponse,
  scanResponse,
  settingsResponse,
  signalsResponse,
  universeResponse,
} from './handlers.js';

const app = express();
app.use(cors());
app.use(express.json());

let ready = false;
let lastRefresh = 0;
let marketRegime: Regime = 'unknown';
let heartbeat: Heartbeat = {
  startedAt: 0,
  finishedAt: 0,
  durationMs: 0,
  ok: false,
  errors: ['No paper tick has completed'],
  productsLoaded: 0,
  timeframe: getSettings().timeframe,
  intervalMinutes: 60,
  nextExpectedAt: 0,
};

export function setHeartbeat(value: Heartbeat): void {
  heartbeat = value;
}

export function strategyConfig(settings: Settings): StrategyConfig {
  return {
    riskPerTrade: settings.riskPerTrade,
    startingEquity: settings.startingEquity,
    feeBps: settings.feeBps,
    slippageBps: settings.slippageBps,
    sizingMode: settings.sizingMode,
    fixedUsdPerTrade: settings.fixedUsdPerTrade,
    maxPositions: settings.maxPositions,
    maxNotionalPct: settings.maxNotionalPct,
    stopAtrMult: settings.stopAtrMult,
    targetR: settings.targetR,
    trailAtrMult: settings.trailAtrMult,
    partialEnabled: settings.partialEnabled,
    newsEnabled: settings.newsEnabled,
    newsBlockHours: settings.newsBlockHours,
  };
}

export function cacheProduct(
  productId: string,
  timeframe: string,
  required: number,
): ReturnType<typeof loadCandles> {
  return loadCandles(productId, timeframe).slice(-required);
}

async function refreshProduct(
  product: Product,
  timeframe: string,
): Promise<{ hourlyCount: number; dailyCount: number; ok: boolean }> {
  const hourly = loadCandles(product.product_id, timeframe);
  const daily = loadCandles(product.product_id, 'ONE_DAY');
  try {
    const hourlyBars = await fetchCandles(
      product.product_id,
      timeframe,
      3000,
      hourly.length >= 3000 ? latestCandleTime(product.product_id, timeframe) : 0,
      hourly.length,
    );
    saveCandles(product.product_id, timeframe, hourlyBars);
    const dailyBars = await fetchCandles(
      product.product_id,
      'ONE_DAY',
      500,
      daily.length >= 500 ? latestCandleTime(product.product_id, 'ONE_DAY') : 0,
      daily.length,
    );
    saveCandles(product.product_id, 'ONE_DAY', dailyBars);
    clearProductError(product.product_id);
    return {
      hourlyCount: loadCandles(product.product_id, timeframe).length,
      dailyCount: loadCandles(product.product_id, 'ONE_DAY').length,
      ok: true,
    };
  } catch (error) {
    setProductError(product.product_id, error instanceof Error ? error.message : String(error));
    return { hourlyCount: hourly.length, dailyCount: daily.length, ok: false };
  }
}

export async function refreshUniverse(): Promise<{ products: number; failures: number }> {
  try {
    const settings = getSettings();
    const availableProducts = await fetchProducts();
    const products = availableProducts
      .sort(
        (left, right) =>
          Number(right.volume_24h) * Number(right.price) -
          Number(left.volume_24h) * Number(left.price),
      )
      .slice(0, settings.universeSize);
    const rows = [];
    let failures = 0;
    for (const product of products) {
      const history = await refreshProduct(product, settings.timeframe);
      if (!history.ok) failures += 1;
      rows.push({
        ...product,
        volume24Usd: Number(product.volume_24h) * Number(product.price),
        historyStatus:
          history.dailyCount >= 210 ? ('ready' as const) : ('insufficient_history' as const),
      });
    }
    const btc = availableProducts.find((product) => product.product_id === 'BTC-USD');
    if (btc && !products.some((product) => product.product_id === btc.product_id)) {
      await refreshProduct(btc, settings.timeframe);
    }
    saveUniverse(rows);
    try {
      await syncNews(
        rows.map((row) => ({
          product_id: row.product_id,
          price: Number(row.price),
          volume24_base: Number(row.volume_24h),
          volume24_usd: row.volume24Usd,
          price_percentage_change_24h: Number(row.price_percentage_change_24h),
          base_name: row.base_name,
          historyStatus: row.historyStatus,
        })),
      );
    } catch (error) {
      setProductError('NEWS', error instanceof Error ? error.message : String(error));
    }
    const marketCandles = cacheProduct('BTC-USD', settings.timeframe, 3000);
    const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
    marketRegime =
      marketCandles.length >= 2 && marketDaily.length >= 210
        ? (buildRegimeMap(marketCandles, marketDaily).at(-2) ?? 'unknown')
        : 'unknown';
    ready = rows.some((row) => row.historyStatus === 'ready');
    lastRefresh = Date.now();
    return { products: products.length, failures };
  } catch (error) {
    setProductError('UNIVERSE', error instanceof Error ? error.message : String(error));
    ready = false;
    return { products: 0, failures: 0 };
  }
}

function stateForProduct(productId: string): EngineState {
  const stored = openPosition(productId);
  if (!stored) {
    return {
      cooldownUntil: -Infinity,
      trendFailureBars: 0,
    };
  }
  const position: Position = {
    id: Number(stored.id),
    productId: String(stored.product),
    entryTime: Number(stored.entry_time),
    exitTime: stored.exit_time == null ? undefined : Number(stored.exit_time),
    entryPrice: Number(stored.entry),
    currentPrice: Number(stored.current),
    entryFill: Number(stored.entry_fill ?? stored.entry),
    entryFee: Number(stored.entry_fee),
    qty: Number(stored.qty),
    remainingQty: Number(stored.remaining_qty),
    stop: Number(stored.stop),
    target: Number(stored.target),
    initialRisk: Number(stored.initial_risk),
    atrAtEntry: Number(stored.atr_entry),
    highestHigh: Number(stored.highest_high),
    partialTaken: Boolean(stored.partial),
    realized: Number(stored.realized),
    status: stored.status as Position['status'],
    reason: stored.reason as Position['reason'] | undefined,
  };
  return {
    cooldownUntil: -Infinity,
    trendFailureBars: 0,
    position: {
      ...position,
      remainingQty: position.remainingQty,
      partialTaken: position.partialTaken,
      status: 'open',
    },
  };
}

export async function paperTick(): Promise<void> {
  const startedAt = Date.now();
  const settings = getSettings();
  heartbeat = {
    ...heartbeat,
    startedAt,
    finishedAt: 0,
    durationMs: 0,
    ok: false,
    errors: [],
    productsLoaded: 0,
    timeframe: settings.timeframe,
    nextExpectedAt: startedAt + 60 * 60 * 1000,
  };
  if (!ready) {
    heartbeat = {
      ...heartbeat,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      errors: ['Universe is not ready'],
    };
    return;
  }
  const config = strategyConfig(settings);
  const manualPortfolio =
    settings.mode === 'manual'
      ? computePortfolio(
          storedLedgerEntries(),
          Object.fromEntries(universe().map((product) => [product.product_id, product.price])),
          Date.now(),
        )
      : undefined;
  const portfolio = equity();
  const portfolioState = {
    equity: manualPortfolio?.equity ?? portfolio.value,
    realized: manualPortfolio?.realizedPnl ?? portfolio.realized,
  };
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  let unrealized = 0;

  for (const product of universe().filter((item) => item.historyStatus === 'ready')) {
    try {
      const bars = cacheProduct(product.product_id, settings.timeframe, 3000);
      const daily = cacheProduct(product.product_id, 'ONE_DAY', 500);
      const lastProcessed = processedBar(product.product_id);
      const context = createEngineContext(
        product.product_id,
        bars,
        daily,
        config,
        settings.mode === 'manual'
          ? 0
          : positions().filter((item) => item.status === 'open').length,
        portfolioState,
        marketDaily,
      );
      const news = newsContext(product.product_id, settings);
      context.newsBlocked = news.blocked;
      context.newsScore = news.score;
      let state = stateForProduct(product.product_id);
      for (let index = 210; index < bars.length - 1; index += 1) {
        if (bars[index].time <= lastProcessed) {
          continue;
        }
        const result = stepProduct(state, index, {
          ...context,
          portfolio: portfolioState,
          openPositions:
            settings.mode === 'manual'
              ? 0
              : positions().filter((item) => item.status === 'open').length,
        });
        state = result.state;
        if (settings.mode === 'manual') {
          state.position = undefined;
        }
        portfolioState.equity = result.portfolio.equity;
        portfolioState.realized = result.portfolio.realized;
        for (const event of result.events) {
          if (event.signal) {
            insertSignal(event.signal);
          }
          if (settings.mode !== 'manual' && event.type === 'fill' && event.position) {
            const storedPosition = event.position;
            if (storedPosition.status === 'open') {
              const id = savePosition(storedPosition as unknown as Record<string, unknown>);
              state.position = { ...storedPosition, id };
            } else if (storedPosition.id) {
              updatePosition(storedPosition as unknown as Record<string, unknown>);
            }
          }
          if (settings.mode !== 'manual' && event.type === 'mark' && event.position?.id) {
            updatePosition(event.position as unknown as Record<string, unknown>);
          }
        }
        setProcessedBar(product.product_id, bars[index].time);
      }
      if (state.position) {
        unrealized += unrealizedPnl(
          state.position.entryFill,
          bars.at(-2)?.close ?? state.position.currentPrice,
          state.position.remainingQty,
          config,
        );
      }
    } catch (error) {
      setProductError(product.product_id, error instanceof Error ? error.message : String(error));
    }
  }
  if (settings.mode === 'manual') {
    const latestPrices = Object.fromEntries(
      universe().map((product) => [
        product.product_id,
        cacheProduct(product.product_id, settings.timeframe, 3000).at(-2)?.close ?? product.price,
      ]),
    );
    const current = computePortfolio(storedLedgerEntries(), latestPrices, Date.now());
    unrealized = current.holdings.reduce((total, holding) => total + holding.unrealizedPnl, 0);
    saveEquity(Date.now(), current.equity, current.realizedPnl, unrealized);
  } else {
    saveEquity(Date.now(), portfolioState.equity + unrealized, portfolioState.realized, unrealized);
  }
  heartbeat = {
    ...heartbeat,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    ok: true,
    errors: productErrors().map((error) => `${error.productId}: ${error.message}`),
    productsLoaded: universe().filter((product) => product.historyStatus === 'ready').length,
    nextExpectedAt: Date.now() + 60 * 60 * 1000,
  };
}

function validateSettings(input: Partial<Settings>): string | undefined {
  const numericFields: Array<keyof Settings> = [
    'startingEquity',
    'riskPerTrade',
    'fixedUsdPerTrade',
    'maxPositions',
    'maxNotionalPct',
    'feeBps',
    'slippageBps',
    'universeSize',
    'stopAtrMult',
    'targetR',
    'trailAtrMult',
    'newsBlockHours',
  ];
  for (const field of numericFields) {
    const value = input[field];
    if (
      value !== undefined &&
      (typeof value !== 'number' || (field === 'startingEquity' ? value < 0 : value <= 0))
    ) {
      return `${field} must be positive`;
    }
  }
  if (input.riskPerTrade !== undefined && input.riskPerTrade > 0.1) {
    return 'riskPerTrade must be at most 0.1';
  }
  if (input.maxPositions !== undefined && (input.maxPositions < 1 || input.maxPositions > 20)) {
    return 'maxPositions must be between 1 and 20';
  }
  if (input.partialEnabled !== undefined && typeof input.partialEnabled !== 'boolean') {
    return 'partialEnabled must be boolean';
  }
  if (input.newsEnabled !== undefined && typeof input.newsEnabled !== 'boolean') {
    return 'newsEnabled must be boolean';
  }
  if (input.mode !== undefined && input.mode !== 'paper' && input.mode !== 'manual') {
    return 'mode is invalid';
  }
  if (
    input.sizingMode !== undefined &&
    input.sizingMode !== 'risk_pct' &&
    input.sizingMode !== 'fixed_usd'
  ) {
    return 'sizingMode is invalid';
  }
  return undefined;
}

export const handlerContext = {
  cacheProduct,
  ready: () => ready,
  lastRefresh: () => lastRefresh,
  marketRegime: () => marketRegime,
  heartbeat: () => heartbeat,
  strategyConfig,
};

app.get('/api/health', (_request, response) => response.json(healthResponse(handlerContext)));
app.get('/api/universe', (_request, response) => response.json(universeResponse()));
app.get('/api/signals', (request, response) =>
  response.json(signalsResponse(Number(request.query.limit ?? 50))),
);
app.get('/api/news', (request, response) => {
  const productId = typeof request.query.product === 'string' ? request.query.product : undefined;
  const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 50)));
  response.json(newsResponse(productId, limit));
});
app.get('/api/news/summary', (_request, response) => response.json(newsSummaryResponse()));
app.get('/api/positions', (_request, response) => response.json(positionsResponse(handlerContext)));
app.get('/api/portfolio', (_request, response) => response.json(portfolioResponse()));
app.get('/api/ledger', (_request, response) => response.json(ledgerResponse()));
app.post('/api/ledger', (request, response) => {
  const result = createLedgerResponse({
    ...(request.body as Record<string, unknown>),
    source: 'api',
  } as LedgerEntry);
  if ('error' in result) {
    response.status(400).json(result);
    return;
  }
  response.status(201).json(result);
});
app.get('/api/products/:id/candles', (request, response) =>
  response.json(
    candlesResponse(
      handlerContext,
      request.params.id,
      typeof request.query.tf === 'string' ? request.query.tf : undefined,
    ),
  ),
);
app.get('/api/products/:id/analysis', (request, response) => {
  const result = analysisResponse(handlerContext, request.params.id);
  if ('error' in result) {
    response.status(404).json(result);
    return;
  }
  response.json(result);
});
app.get('/api/scan', (_request, response) => response.json(scanResponse(handlerContext)));
app.get('/api/diagnostics/:id', (request, response) => {
  const result = diagnosticsResponse(handlerContext, request.params.id);
  if ('error' in result) {
    response.status(404).json(result);
    return;
  }
  response.json(result);
});
app.get('/api/backtest/:id', (request, response) =>
  response.json(backtestResponse(handlerContext, request.params.id)),
);
app.get('/api/backtest', (_request, response) => response.json(backtestResponse(handlerContext)));

app.get('/api/settings', (_request, response) => {
  response.json(settingsResponse());
});

app.put('/api/settings', (request, response) => {
  const error = validateSettings(request.body as Partial<Settings>);
  if (error) {
    response.status(400).json({ error });
    return;
  }
  response.json(settingsResponse(request.body as Partial<Settings>));
});

app.post('/api/paper/reset', (_request, response) => {
  response.json(resetResponse());
});

const staticDirectory = path.resolve('web/dist');
app.use(express.static(staticDirectory));
app.get('*', (_request, response) => {
  response.sendFile(path.join(staticDirectory, 'index.html'));
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.RUN_SERVER !== 'false') {
  app.listen(port, () => {
    void refreshUniverse();
    setInterval(() => void refreshUniverse(), 60 * 60 * 1000);
    setInterval(() => void syncNews(universe()), 10 * 60 * 1000);
    setInterval(() => void paperTick(), 5 * 60 * 1000);
  });
}

export default app;
