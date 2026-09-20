import { backtestProduct, portfolioBacktest } from '../core/backtest.js';
import { createEngineContext } from '../core/engine.js';
import { assetNewsScore } from '../core/sentiment.js';
import type { Regime, StrategyConfig } from '../core/types.js';
import type {
  AnalysisResponse,
  DiagnosticsResponse,
  HealthResponse,
  Heartbeat,
  ScanRow,
  Settings,
} from '../shared/api.js';
import {
  db,
  equity,
  getSettings,
  openPosition,
  positions,
  productErrors,
  resetPaper,
  saveSettings,
  signals,
  universe,
} from './db.js';
import { allNews, currentNewsState, newsContext, newsSummary, productNews } from './news.js';
import { calculateIndicators, scoreAt } from '../core/strategy.js';

export interface HandlerContext {
  cacheProduct: (
    productId: string,
    timeframe: string,
    required: number,
  ) => ReturnType<typeof import('./db.js').loadCandles>;
  ready: () => boolean;
  lastRefresh: () => number;
  marketRegime: () => Regime;
  heartbeat: () => Heartbeat;
  strategyConfig: (settings: Settings) => StrategyConfig;
}

function healthResponse(context: HandlerContext): HealthResponse {
  return {
    ok: productErrors().every((error) => error.productId !== 'UNIVERSE'),
    ready: context.ready(),
    lastRefresh: context.lastRefresh(),
    productsLoaded: universe().filter((product) => product.historyStatus === 'ready').length,
    errors: productErrors(),
    marketRegime: context.marketRegime(),
    fearGreed: currentNewsState().fearGreed,
    heartbeat: context.heartbeat(),
  };
}

function universeResponse() {
  return universe();
}

function signalsResponse(limit = 50) {
  return signals(limit);
}

function newsResponse(productId?: string, limit = 50) {
  return productId ? productNews(productId, limit) : allNews(limit);
}

function newsSummaryResponse() {
  return newsSummary(universe());
}

function positionsResponse() {
  return positions();
}

function portfolioResponse() {
  const latest = equity();
  const settings = getSettings();
  const curve = db.prepare('SELECT time,value AS equity FROM equity ORDER BY time').all();
  return {
    equity: latest.value,
    realized: latest.realized,
    unrealized: latest.unrealized,
    drawdown: 0,
    curve,
    startDate: settings.startDate,
  };
}

function candlesResponse(context: HandlerContext, productId: string, timeframe?: string) {
  const settings = getSettings();
  return context.cacheProduct(productId, timeframe ?? settings.timeframe, 3000);
}

function analysisResponse(
  context: HandlerContext,
  productId: string,
): AnalysisResponse | { error: string } {
  const settings = getSettings();
  const candles = context.cacheProduct(productId, settings.timeframe, 3000);
  const daily = context.cacheProduct(productId, 'ONE_DAY', 500);
  const marketDaily = context.cacheProduct('BTC-USD', 'ONE_DAY', 500);
  const newsContextValue = newsContext(productId, settings);
  const news = settings.newsEnabled
    ? assetNewsScore(allNews(5000), productId)
    : { productId, score: 0, count: 0, catalysts: [] };
  if (candles.length < 3) {
    return { error: `No cached ${settings.timeframe} data is available for ${productId}` };
  }
  const indicators = calculateIndicators(candles);
  const index = candles.length - 2;
  const engineContext = createEngineContext(
    productId,
    candles,
    daily,
    context.strategyConfig(settings),
    0,
    undefined,
    marketDaily,
  );
  const regime = engineContext.dailyRegimes[index];
  const score = scoreAt(
    index,
    candles,
    indicators,
    regime,
    newsContextValue.score,
    settings.newsEnabled,
  );
  return {
    product: productId,
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
    news,
    signals: signals(500).filter((signal) => signal.productId === productId),
    position: openPosition(productId) as unknown as AnalysisResponse['position'],
    backtest: backtestProduct(
      productId,
      candles,
      daily,
      context.strategyConfig(settings),
      marketDaily,
    ),
  };
}

function scanResponse(context: HandlerContext): ScanRow[] {
  const settings = getSettings();
  const marketDaily = context.cacheProduct('BTC-USD', 'ONE_DAY', 500);
  const articles = allNews(5000);
  return universe().map((product) => {
    if (product.historyStatus === 'insufficient_history') {
      return {
        productId: product.product_id,
        price: product.price,
        change24hPct: product.price_percentage_change_24h,
        regime: 'unknown',
        marketRegime: context.marketRegime(),
        score: 0,
        components: {
          trend: 0,
          pullback: 0,
          momentum: 0,
          volume: 0,
          adx: 0,
          regime: 0,
          news: 0,
          total: 0,
        },
        rsi: NaN,
        adx: NaN,
        atrPct: NaN,
        trendUp: false,
        status: 'insufficient_history',
        volume24Usd: product.volume24_usd,
        newsScore: 0,
        newsCount: 0,
        catalysts: [],
        blockedByNews: false,
      };
    }
    const candles = context.cacheProduct(product.product_id, settings.timeframe, 3000);
    const daily = context.cacheProduct(product.product_id, 'ONE_DAY', 500);
    const indicators = calculateIndicators(candles);
    const index = candles.length - 2;
    const engineContext = createEngineContext(
      product.product_id,
      candles,
      daily,
      context.strategyConfig(settings),
      0,
      undefined,
      marketDaily,
    );
    const regime = engineContext.dailyRegimes[index];
    const currentMarketRegime = engineContext.marketRegimes[index];
    const newsContextValue = newsContext(product.product_id, settings);
    const news = {
      score: newsContextValue.score,
      count: settings.newsEnabled
        ? articles.filter((article) => article.assets.includes(product.product_id)).length
        : 0,
      catalysts: newsContextValue.catalysts,
    };
    const components = scoreAt(
      index,
      candles,
      indicators,
      regime,
      newsContextValue.score,
      settings.newsEnabled,
    );
    const trendUp =
      indicators.ema20[index] > indicators.ema50[index] &&
      candles[index].close > indicators.ema50[index];
    const blockedByNews = newsContextValue.blocked;
    const signal =
      components.trend > 0 &&
      components.pullback > 0 &&
      components.momentum > 0 &&
      components.volume > 0 &&
      components.adx > 0 &&
      regime === 'bullish' &&
      currentMarketRegime === 'bullish' &&
      !blockedByNews;
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
      status: inPosition
        ? 'in_position'
        : blockedByNews
          ? 'blocked_by_news'
          : signal
            ? 'signal'
            : setup
              ? 'setup'
              : 'none',
      volume24Usd: product.volume24_usd,
      lastError: productErrors().find((error) => error.productId === product.product_id)?.message,
      newsScore: news.score,
      newsCount: news.count,
      catalysts: news.catalysts,
      blockedByNews,
    };
  });
}

function diagnosticsResponse(
  context: HandlerContext,
  productId: string,
): DiagnosticsResponse | { error: string } {
  const settings = getSettings();
  const candles = context.cacheProduct(productId, settings.timeframe, 3000);
  const daily = context.cacheProduct(productId, 'ONE_DAY', 500);
  const marketDaily = context.cacheProduct('BTC-USD', 'ONE_DAY', 500);
  if (candles.length < 210) return { error: 'insufficient history' };
  const indicators = calculateIndicators(candles);
  const engineContext = createEngineContext(
    productId,
    candles,
    daily,
    context.strategyConfig(settings),
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
        engineContext.dailyRegimes[index] === 'bullish' &&
        engineContext.marketRegimes[index] === 'bullish',
    };
    for (const [key, passed] of Object.entries(values) as Array<
      [keyof Omit<DiagnosticsResponse['conditions'], 'all'>, boolean]
    >) {
      if (passed) conditions[key] += 1;
    }
    if (Object.values(values).every(Boolean)) conditions.all += 1;
  }
  return { productId, bars: candles.length - 210, conditions };
}

function backtestResponse(context: HandlerContext, productId?: string) {
  const settings = getSettings();
  const marketDaily = context.cacheProduct('BTC-USD', 'ONE_DAY', 500);
  if (productId) {
    return backtestProduct(
      productId,
      context.cacheProduct(productId, settings.timeframe, 3000),
      context.cacheProduct(productId, 'ONE_DAY', 500),
      context.strategyConfig(settings),
      marketDaily,
    );
  }
  const data: Record<string, ReturnType<typeof context.cacheProduct>> = {};
  const daily: Record<string, ReturnType<typeof context.cacheProduct>> = {};
  for (const product of universe().filter((item) => item.historyStatus === 'ready')) {
    data[product.product_id] = context.cacheProduct(product.product_id, settings.timeframe, 3000);
    daily[product.product_id] = context.cacheProduct(product.product_id, 'ONE_DAY', 500);
  }
  const marketCandles = context.cacheProduct('BTC-USD', settings.timeframe, 3000);
  if (marketCandles.length >= 210 && marketDaily.length >= 210) {
    data['BTC-USD'] ??= marketCandles;
    daily['BTC-USD'] ??= marketDaily;
  }
  return portfolioBacktest(data, daily, context.strategyConfig(settings), marketDaily);
}

function settingsResponse(input?: Partial<Settings>) {
  return input ? saveSettings(input) : getSettings();
}

function resetResponse() {
  resetPaper();
  return getSettings();
}

export {
  analysisResponse,
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
};
