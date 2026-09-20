import { describe, expect, it } from 'vitest';
import { buildRegimeMap, stepProduct } from './engine.js';
import type { Candle, EngineContext, EngineState, Indicators, Position } from './types.js';

const config = {
  riskPerTrade: 0.01,
  startingEquity: 10000,
  feeBps: 0,
  slippageBps: 0,
  maxPositions: 5,
  stopAtrMult: 2,
  targetR: 1.5,
  trailAtrMult: 3,
  partialEnabled: true,
};

function context(
  candles: Candle[],
  ema50: number[],
  openPositions = 0,
  dailyRegime: 'bullish' | 'unknown' = 'bullish',
  marketRegime: 'bullish' | 'bearish' = 'bullish',
): EngineContext {
  const blank = Array.from({ length: candles.length }, () => 1);
  const indicators = {
    sma20: blank,
    ema20: blank,
    ema50,
    ema200: blank,
    rsi: blank.map(() => 60),
    macd: { line: blank, signal: blank.map(() => 0), histogram: blank },
    bollinger: { middle: blank, upper: blank, lower: blank },
    atr: blank,
    adx: { adx: blank.map(() => 30), plusDI: blank, minusDI: blank },
    obv: blank,
    donchian: { high: blank, low: blank },
    volumeSma: blank,
  } satisfies Indicators;
  return {
    productId: 'TEST-USD',
    candles,
    dailyCandles: [],
    indicators,
    dailyRegimes: candles.map(() => dailyRegime),
    marketRegimes: candles.map(() => marketRegime),
    config,
    openPositions,
    portfolio: { equity: 10000, realized: 0 },
    barIntervalSeconds: 3600,
  };
}

function entryContext(
  dailyRegime: 'bullish' | 'unknown',
  marketRegime: 'bullish' | 'bearish',
): { candles: Candle[]; context: EngineContext } {
  const candles = Array.from({ length: 212 }, (_, index) => ({
    time: index * 3600,
    open: 100,
    high: index === 210 ? 111 : 100,
    low: index === 209 ? 90 : 99,
    close: index === 210 ? 110 : 100,
    volume: 1,
  }));
  const contextValue = context(
    candles,
    candles.map(() => 100),
    0,
    dailyRegime,
    marketRegime,
  );
  contextValue.indicators.rsi[209] = 40;
  contextValue.indicators.rsi[210] = 60;
  contextValue.indicators.macd.histogram[209] = -1;
  contextValue.indicators.macd.histogram[210] = 1;
  contextValue.indicators.macd.line[210] = 1;
  contextValue.indicators.macd.signal[210] = 0;
  contextValue.indicators.atr[210] = 1;
  contextValue.indicators.volumeSma[210] = 1;
  return { candles, context: contextValue };
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    productId: 'TEST-USD',
    entryTime: 0,
    entryPrice: 100,
    currentPrice: 100,
    entryFill: 100,
    entryFee: 0,
    qty: 10,
    remainingQty: 10,
    stop: 98,
    target: 103,
    initialRisk: 2,
    atrAtEntry: 1,
    highestHigh: 100,
    partialTaken: false,
    status: 'open',
    realized: 0,
    ...overrides,
  };
}

describe('unified engine exits', () => {
  it('fills a hard stop at the stop price', () => {
    const candles = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 3600, open: 100, high: 100, low: 97, close: 98, volume: 1 },
    ];
    const state: EngineState = {
      cooldownUntil: -Infinity,
      trendFailureBars: 0,
      position: position(),
    };
    const result = stepProduct(state, 1, context(candles, [100, 99]));
    expect(result.events.some((event) => event.signal?.reason === 'stop')).toBe(true);
    expect(result.state.position).toBeUndefined();
  });

  it('takes partial target then trails the remainder', () => {
    const candles = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 3600, open: 100, high: 103, low: 102, close: 103, volume: 1 },
      { time: 7200, open: 103, high: 104, low: 100, close: 101, volume: 1 },
    ];
    const state: EngineState = {
      cooldownUntil: -Infinity,
      trendFailureBars: 0,
      position: position({ stop: 90 }),
    };
    const afterTarget = stepProduct(state, 1, context(candles, [100, 100, 100]));
    expect(afterTarget.state.position?.partialTaken).toBe(true);
    const afterTrail = stepProduct(afterTarget.state, 2, context(candles, [100, 100, 100]));
    expect(afterTrail.events.some((event) => event.signal?.reason === 'trail')).toBe(true);
  });

  it('exits after two consecutive closes below EMA50', () => {
    const candles = [
      { time: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { time: 3600, open: 99, high: 99, low: 99, close: 98, volume: 1 },
      { time: 7200, open: 98, high: 98, low: 96, close: 97, volume: 1 },
      { time: 10800, open: 97, high: 98, low: 96, close: 97, volume: 1 },
    ];
    const state: EngineState = {
      cooldownUntil: -Infinity,
      trendFailureBars: 0,
      position: position({ stop: 90 }),
    };
    const first = stepProduct(state, 1, context(candles, [100, 99, 99]));
    const second = stepProduct(first.state, 2, context(candles, [100, 99, 99]));
    expect(second.events.some((event) => event.signal?.reason === 'trend_fail')).toBe(true);
  });

  it('blocks a bullish product when the market regime is bearish', () => {
    const { context: bearishMarketContext } = entryContext('bullish', 'bearish');
    const result = stepProduct(
      { cooldownUntil: -Infinity, trendFailureBars: 0 },
      210,
      bearishMarketContext,
    );
    expect(result.state.position).toBeUndefined();
    expect(result.events).toHaveLength(0);
  });

  it('blocks entries when daily history is insufficient', () => {
    const { context: insufficientContext } = entryContext('unknown', 'bullish');
    const result = stepProduct(
      { cooldownUntil: -Infinity, trendFailureBars: 0 },
      210,
      insufficientContext,
    );
    expect(result.state.position).toBeUndefined();
    expect(result.events).toHaveLength(0);
  });
});

describe('daily regime mapping', () => {
  it('does not use later daily bars for an earlier hourly bar', () => {
    const daily = Array.from({ length: 220 }, (_, index) => ({
      time: index * 86400,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 10,
    }));
    const hourly = [
      {
        time: 220 * 86400,
        open: 320,
        high: 321,
        low: 319,
        close: 320,
        volume: 1,
      },
    ];
    const before = buildRegimeMap(hourly, daily)[0];
    const after = buildRegimeMap(hourly, [
      ...daily,
      {
        time: 220 * 86400,
        open: 1,
        high: 2,
        low: 0,
        close: 1,
        volume: 10,
      },
    ])[0];
    expect(after).toBe(before);
  });
});
