import { describe, expect, it } from 'vitest';
import { ema, rsi, atr, adx, macd } from './indicators.js';
import type { Candle } from './types.js';

describe('indicators', () => {
  it('matches the classic Wilder RSI sample', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35,
      44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
    ];
    const values = rsi(closes);
    expect(values[14]).toBeCloseTo(70.53, 0);
    expect(values[15]).toBeCloseTo(66.32, 0);
    expect(values[20]).toBeCloseTo(62.81, 0);
  });
  it('seeds EMA with SMA', () =>
    expect(ema([1, 2, 3, 4, 5, 6], 3)).toEqual([NaN, NaN, 2, 3, 4, 5]));
  it('produces sane ATR and ADX values', () => {
    const candles: Candle[] = Array.from({ length: 40 }, (_, i) => ({
      time: i,
      open: 10 + i,
      high: 11 + i,
      low: 9 + i,
      close: 10.5 + i,
      volume: 1,
    }));
    expect(atr(candles)[14]).toBeGreaterThan(0);
    expect(adx(candles).adx[28]).toBeGreaterThan(90);
  });
  it('MACD histogram is line minus signal', () => {
    const m = macd(Array.from({ length: 50 }, (_, i) => i + Math.sin(i)));
    expect(m.histogram[40]).toBeCloseTo(m.line[40] - m.signal[40]);
  });
});
