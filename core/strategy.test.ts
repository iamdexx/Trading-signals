import { describe, expect, it } from 'vitest';
import { fillPrice, tradePnl, generateSignals } from './strategy.js';
import type { Candle } from './types.js';

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
});
