import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { backtestProduct, portfolioBacktest } from '../core/backtest.js';
import { buildRegimeMap, createEngineContext, stepProduct } from '../core/engine.js';
import { unrealizedPnl } from '../core/pnl.js';
import type { EngineState, Position, Regime, StrategyConfig } from '../core/types.js';
import type {
  AnalysisResponse,
  DiagnosticsResponse,
  HealthResponse,
  ScanRow,
  Settings,
} from '../shared/api.js';
import { candles as fetchCandles, products as fetchProducts, type Product } from './market.js';
import {
  clearProductError,
  db,
  equity,
  getSettings,
  insertSignal,
  latestCandleTime,
  loadCandles,
  openPosition,
  positions,
  productErrors,
  processedBar,
  resetPaper,
  saveCandles,
  saveEquity,
  savePosition,
  saveSettings,
  saveUniverse,
  setProcessedBar,
  setProductError,
  signals,
  universe,
  updatePosition,
} from './db.js';
import { calculateIndicators, scoreAt } from '../core/strategy.js';

const app = express();
app.use(cors());
app.use(express.json());

let ready = false;
let lastRefresh = 0;
let marketRegime: Regime = 'unknown';

function strategyConfig(settings: Settings): StrategyConfig {
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
  };
}

function cacheProduct(
  productId: string,
  timeframe: string,
  required: number,
): ReturnType<typeof loadCandles> {
  return loadCandles(productId, timeframe).slice(-required);
}

async function refreshProduct(
  product: Product,
  timeframe: string,
): Promise<{ hourlyCount: number; dailyCount: number }> {
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
    };
  } catch (error) {
    setProductError(product.product_id, error instanceof Error ? error.message : String(error));
    return { hourlyCount: hourly.length, dailyCount: daily.length };
  }
}

async function refreshUniverse(): Promise<void> {
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
    for (const product of products) {
      const history = await refreshProduct(product, settings.timeframe);
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
    const marketCandles = cacheProduct('BTC-USD', settings.timeframe, 3000);
    const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
    marketRegime =
      marketCandles.length >= 2 && marketDaily.length >= 210
        ? (buildRegimeMap(marketCandles, marketDaily).at(-2) ?? 'unknown')
        : 'unknown';
    ready = rows.some((row) => row.historyStatus === 'ready');
    lastRefresh = Date.now();
  } catch (error) {
    setProductError('UNIVERSE', error instanceof Error ? error.message : String(error));
    ready = false;
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
  const position = stored as unknown as Position;
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

async function paperTick(): Promise<void> {
  if (!ready) {
    return;
  }
  const settings = getSettings();
  const config = strategyConfig(settings);
  const portfolio = equity();
  const portfolioState = { equity: portfolio.value, realized: portfolio.realized };
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
        positions().filter((item) => item.status === 'open').length,
        portfolioState,
        marketDaily,
      );
      let state = stateForProduct(product.product_id);
      for (let index = 210; index < bars.length - 1; index += 1) {
        if (bars[index].time <= lastProcessed) {
          continue;
        }
        const result = stepProduct(state, index, {
          ...context,
          portfolio: portfolioState,
          openPositions: positions().filter((item) => item.status === 'open').length,
        });
        state = result.state;
        portfolioState.equity = result.portfolio.equity;
        portfolioState.realized = result.portfolio.realized;
        for (const event of result.events) {
          if (event.signal) {
            insertSignal(event.signal);
          }
          if (event.type === 'fill' && event.position) {
            const storedPosition = event.position;
            if (storedPosition.status === 'open') {
              const id = savePosition(storedPosition as unknown as Record<string, unknown>);
              state.position = { ...storedPosition, id };
            } else if (storedPosition.id) {
              updatePosition(storedPosition as unknown as Record<string, unknown>);
            }
          }
          if (event.type === 'mark' && event.position?.id) {
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
  saveEquity(Date.now(), portfolioState.equity + unrealized, portfolioState.realized, unrealized);
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
  ];
  for (const field of numericFields) {
    const value = input[field];
    if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
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
  if (
    input.sizingMode !== undefined &&
    input.sizingMode !== 'risk_pct' &&
    input.sizingMode !== 'fixed_usd'
  ) {
    return 'sizingMode is invalid';
  }
  return undefined;
}

app.get('/api/health', (_request, response) => {
  const health: HealthResponse = {
    ok: productErrors().every((error) => error.productId !== 'UNIVERSE'),
    ready,
    lastRefresh,
    productsLoaded: universe().filter((product) => product.historyStatus === 'ready').length,
    errors: productErrors(),
    marketRegime,
  };
  response.json(health);
});

app.get('/api/universe', (_request, response) => {
  response.json(universe());
});

app.get('/api/signals', (request, response) => {
  const limit = Number(request.query.limit ?? 50);
  response.json(signals(limit));
});

app.get('/api/positions', (_request, response) => {
  response.json(positions());
});

app.get('/api/portfolio', (_request, response) => {
  const latest = equity();
  const settings = getSettings();
  const curve = db.prepare('SELECT time,value AS equity FROM equity ORDER BY time').all();
  response.json({
    equity: latest.value,
    realized: latest.realized,
    unrealized: latest.unrealized,
    drawdown: 0,
    curve,
    startDate: settings.startDate,
  });
});

app.get('/api/products/:id/candles', (request, response) => {
  const settings = getSettings();
  const timeframe = String(request.query.tf ?? settings.timeframe);
  response.json(cacheProduct(request.params.id, timeframe, 3000));
});

app.get('/api/products/:id/analysis', (request, response) => {
  const settings = getSettings();
  const candles = cacheProduct(request.params.id, settings.timeframe, 3000);
  const daily = cacheProduct(request.params.id, 'ONE_DAY', 500);
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  if (candles.length < 3) {
    response.status(404).json({
      error: `No cached ${settings.timeframe} data is available for ${request.params.id}`,
    });
    return;
  }
  const indicators = calculateIndicators(candles);
  const index = candles.length - 2;
  const context = createEngineContext(
    request.params.id,
    candles,
    daily,
    strategyConfig(settings),
    0,
    undefined,
    marketDaily,
  );
  const regime = context.dailyRegimes[index];
  const score = scoreAt(index, candles, indicators, regime);
  const result: AnalysisResponse = {
    product: request.params.id,
    candles,
    indicators: {
      ema20: indicators.ema20,
      ema50: indicators.ema50,
      ema200: indicators.ema200,
      rsi: indicators.rsi,
      macd: indicators.macd.histogram,
      adx: indicators.adx.adx,
      atrPct: indicators.atr.map((value, itemIndex) => (value / candles[itemIndex].close) * 100),
    },
    regime,
    score,
    signals: signals(500).filter((signal) => signal.productId === request.params.id),
    position: openPosition(request.params.id) as unknown as AnalysisResponse['position'],
    backtest: backtestProduct(
      request.params.id,
      candles,
      daily,
      strategyConfig(settings),
      marketDaily,
    ),
  };
  response.json(result);
});

app.get('/api/scan', (_request, response) => {
  const settings = getSettings();
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  const rows: ScanRow[] = universe().map((product) => {
    if (product.historyStatus === 'insufficient_history') {
      return {
        productId: product.product_id,
        price: product.price,
        change24hPct: product.price_percentage_change_24h,
        regime: 'unknown',
        marketRegime,
        score: 0,
        components: { trend: 0, pullback: 0, momentum: 0, volume: 0, adx: 0, regime: 0, total: 0 },
        rsi: NaN,
        adx: NaN,
        atrPct: NaN,
        trendUp: false,
        status: 'insufficient_history',
        volume24Usd: product.volume24_usd,
      };
    }
    const candles = cacheProduct(product.product_id, settings.timeframe, 3000);
    const daily = cacheProduct(product.product_id, 'ONE_DAY', 500);
    const indicators = calculateIndicators(candles);
    const index = candles.length - 2;
    const context = createEngineContext(
      product.product_id,
      candles,
      daily,
      strategyConfig(settings),
      0,
      undefined,
      marketDaily,
    );
    const regime = context.dailyRegimes[index];
    const currentMarketRegime = context.marketRegimes[index];
    const components = scoreAt(index, candles, indicators, regime);
    const trendUp =
      indicators.ema20[index] > indicators.ema50[index] &&
      candles[index].close > indicators.ema50[index];
    const signal = components.total === 100 && currentMarketRegime === 'bullish';
    const setup =
      trendUp &&
      regime === 'bullish' &&
      currentMarketRegime === 'bullish' &&
      components.pullback > 0;
    const inPosition = Boolean(openPosition(product.product_id));
    return {
      productId: product.product_id,
      price: candles[index].close,
      change24hPct: product.price_percentage_change_24h,
      regime,
      marketRegime: currentMarketRegime,
      score: components.total,
      components,
      rsi: indicators.rsi[index],
      adx: indicators.adx.adx[index],
      atrPct: (indicators.atr[index] / candles[index].close) * 100,
      trendUp,
      status: inPosition ? 'in_position' : signal ? 'signal' : setup ? 'setup' : 'none',
      volume24Usd: product.volume24_usd,
      lastError: productErrors().find((error) => error.productId === product.product_id)?.message,
    };
  });
  response.json(rows);
});

app.get('/api/diagnostics/:id', (request, response) => {
  const productId = request.params.id;
  const settings = getSettings();
  const candles = cacheProduct(productId, settings.timeframe, 3000);
  const daily = cacheProduct(productId, 'ONE_DAY', 500);
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  if (candles.length < 210) {
    response.status(404).json({ error: 'insufficient history' });
    return;
  }
  const indicators = calculateIndicators(candles);
  const context = createEngineContext(
    productId,
    candles,
    daily,
    strategyConfig(settings),
    0,
    undefined,
    marketDaily,
  );
  const conditions: DiagnosticsResponse['conditions'] = {
    trend: 0,
    pullback: 0,
    trigger: 0,
    momentum: 0,
    volume: 0,
    volatility: 0,
    adx: 0,
    regime: 0,
    all: 0,
  };
  for (let index = 210; index < candles.length; index += 1) {
    const start = Math.max(0, index - 8);
    const pullback =
      indicators.rsi.slice(start, index).some((value) => value < 50) ||
      candles
        .slice(start, index)
        .some((bar, offset) => bar.low <= indicators.ema20[start + offset]);
    const previousHigh = Math.max(
      ...candles.slice(Math.max(0, index - 3), index).map((bar) => bar.high),
    );
    const trigger =
      (indicators.rsi[index - 1] <= 50 && indicators.rsi[index] > 50) ||
      (indicators.macd.histogram[index - 1] < 0 && indicators.macd.histogram[index] > 0) ||
      (candles[index].close > previousHigh && indicators.rsi[index] > 50);
    const values = {
      trend:
        indicators.ema20[index] > indicators.ema50[index] &&
        candles[index].close > indicators.ema50[index],
      pullback,
      trigger,
      momentum: indicators.macd.line[index] > indicators.macd.signal[index],
      volume: candles[index].volume >= indicators.volumeSma[index] * 0.8,
      volatility:
        indicators.atr[index] / candles[index].close >= 0.003 &&
        indicators.atr[index] / candles[index].close <= 0.08,
      adx: indicators.adx.adx[index] >= 18,
      regime:
        context.dailyRegimes[index] === 'bullish' && context.marketRegimes[index] === 'bullish',
    };
    for (const [key, passed] of Object.entries(values) as Array<
      [keyof Omit<DiagnosticsResponse['conditions'], 'all'>, boolean]
    >) {
      if (passed) {
        conditions[key] += 1;
      }
    }
    if (Object.values(values).every(Boolean)) {
      conditions.all += 1;
    }
  }
  response.json({ productId, bars: candles.length - 210, conditions });
});

app.get('/api/backtest/:id', (request, response) => {
  const settings = getSettings();
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  response.json(
    backtestProduct(
      request.params.id,
      cacheProduct(request.params.id, settings.timeframe, 3000),
      cacheProduct(request.params.id, 'ONE_DAY', 500),
      strategyConfig(settings),
      marketDaily,
    ),
  );
});

app.get('/api/backtest', (_request, response) => {
  const settings = getSettings();
  const data: Record<string, ReturnType<typeof loadCandles>> = {};
  const daily: Record<string, ReturnType<typeof loadCandles>> = {};
  for (const product of universe().filter((item) => item.historyStatus === 'ready')) {
    data[product.product_id] = cacheProduct(product.product_id, settings.timeframe, 3000);
    daily[product.product_id] = cacheProduct(product.product_id, 'ONE_DAY', 500);
  }
  const marketCandles = cacheProduct('BTC-USD', settings.timeframe, 3000);
  const marketDaily = cacheProduct('BTC-USD', 'ONE_DAY', 500);
  if (marketCandles.length >= 210 && marketDaily.length >= 210) {
    data['BTC-USD'] ??= marketCandles;
    daily['BTC-USD'] ??= marketDaily;
  }
  response.json(portfolioBacktest(data, daily, strategyConfig(settings), marketDaily));
});

app.get('/api/settings', (_request, response) => {
  response.json(getSettings());
});

app.put('/api/settings', (request, response) => {
  const error = validateSettings(request.body as Partial<Settings>);
  if (error) {
    response.status(400).json({ error });
    return;
  }
  response.json(saveSettings(request.body as Partial<Settings>));
});

app.post('/api/paper/reset', (_request, response) => {
  resetPaper();
  response.json(getSettings());
});

const staticDirectory = path.resolve('web/dist');
app.use(express.static(staticDirectory));
app.get('*', (_request, response) => {
  response.sendFile(path.join(staticDirectory, 'index.html'));
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  void refreshUniverse();
  setInterval(() => void refreshUniverse(), 60 * 60 * 1000);
  setInterval(() => void paperTick(), 5 * 60 * 1000);
});

export default app;
