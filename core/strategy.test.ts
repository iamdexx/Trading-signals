import { describe, expect, it } from 'vitest';
import { calculateIndicators, fillPrice, tradePnl, generateSignals, scoreAt } from './strategy.js';
import type { Candle, Indicators } from './types.js';

const bars = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 0.2 + Math.sin(i / 5);
    return { time: i, open: close - 0.1, high: close + 1, low: close - 1, close, volume: 1000 + i };
  });
describe('strategy', () => {
  it('charges hand-computed fees and slippage', () => {
    const cfg = {
      riskPerTrade: 0.01,
      startingEquity: 10000,
      feeBps: 60,
      slippageBps: 5,
      stopAtrMult: 2,
      targetR: 1.5,
      trailAtrMult: 3,
      partialEnabled: true,
    };
    const buy = fillPrice(100, 'BUY', 5),
      sell = fillPrice(110, 'SELL', 5);
    expect(tradePnl(100, 110, 1, cfg)).toBeCloseTo(sell - buy - buy * 0.006 - sell * 0.006, 8);
  });
  it('does not alter past signals when future bars change', () => {
    const a = bars(260),
      b = bars(260);
    b[259].close *= 4;
    b[259].high *= 4;
    const sa = generateSignals('X', a),
      sb = generateSignals('X', b);
    expect(sa.filter((x) => x.time < 258)).toEqual(sb.filter((x) => x.time < 258));
  });

  it('uses technical-only and live-news score weights', () => {
    const candles = bars(5).map((candle, index) => ({
      ...candle,
      close: index === 3 ? 120 : 100,
      high: index === 3 ? 121 : 101,
    }));
    const indicators = {
      ...calculateIndicators(candles),
      ema20: [110, 110, 110, 110, 110],
      ema50: [100, 100, 100, 100, 100],
      rsi: [40, 40, 50, 60, 60],
      macd: {
        line: [2, 2, 2, 2, 2],
        signal: [1, 1, 1, 1, 1],
        histogram: [-1, -1, -1, 1, 1],
      },
      volumeSma: [100, 100, 100, 100, 100],
      adx: { adx: [20, 20, 20, 20, 20], plusDI: [], minusDI: [] },
    } as unknown as Indicators;
    const technical = scoreAt(3, candles, indicators, 'bullish', 100, false);
    const live = scoreAt(3, candles, indicators, 'bullish', 100, true);
    expect(technical).toMatchObject({
      trend: 25,
      pullback: 25,
      momentum: 15,
      volume: 15,
      adx: 10,
      regime: 10,
      news: 0,
      total: 100,
    });
    expect(live).toMatchObject({
      trend: 22,
      pullback: 22,
      momentum: 14,
      volume: 14,
      adx: 9,
      regime: 9,
      news: 10,
      total: 100,
    });
  });
});
