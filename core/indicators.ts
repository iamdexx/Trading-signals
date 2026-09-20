import type { Candle, MacdResult, BollingerResult, AdxResult } from './types.js';

const nan = (n: number) => Array.from({ length: n }, () => Number.NaN);

export function sma(values: number[], period: number): number[] {
  const out = nan(values.length);
  if (period < 1) return out;
  let sum = 0;
  values.forEach((value, i) => {
    sum += value;
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  });
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = nan(values.length);
  if (period < 1 || values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++)
    out[i] = (values[i] - out[i - 1]) * multiplier + out[i - 1];
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = nan(values.length);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const calc = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fast),
    slowEma = ema(values, slow);
  const line = nan(values.length);
  for (let i = 0; i < values.length; i++)
    if (!Number.isNaN(fastEma[i]) && !Number.isNaN(slowEma[i])) line[i] = fastEma[i] - slowEma[i];
  const valid = line.filter(Number.isFinite);
  const validSignal = ema(valid, signalPeriod);
  const signal = nan(values.length),
    histogram = nan(values.length);
  let j = 0;
  for (let i = 0; i < line.length; i++)
    if (Number.isFinite(line[i])) {
      if (Number.isFinite(validSignal[j])) {
        signal[i] = validSignal[j];
        histogram[i] = line[i] - signal[i];
      }
      j++;
    }
  return { line, signal, histogram };
}

export function bollinger(values: number[], period = 20, deviations = 2): BollingerResult {
  const middle = sma(values, period),
    upper = nan(values.length),
    lower = nan(values.length);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1),
      mean = middle[i];
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    upper[i] = mean + deviations * std;
    lower[i] = mean - deviations * std;
  }
  return { middle, upper, lower };
}

export function atr(candles: Candle[], period = 14): number[] {
  const tr = nan(candles.length);
  candles.forEach((c, i) => {
    tr[i] =
      i === 0
        ? c.high - c.low
        : Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i - 1].close),
            Math.abs(c.low - candles[i - 1].close),
          );
  });
  const out = nan(candles.length);
  if (candles.length <= period) return out;
  let value = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = value;
  for (let i = period + 1; i < candles.length; i++) {
    value = (value * (period - 1) + tr[i]) / period;
    out[i] = value;
  }
  return out;
}

export function adx(candles: Candle[], period = 14): AdxResult {
  const n = candles.length,
    plus = nan(n),
    minus = nan(n),
    tr = nan(n);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high,
      down = candles[i - 1].low - candles[i].low;
    plus[i] = up > down && up > 0 ? up : 0;
    minus[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  }
  const smooth = (input: number[]) => {
    const out = nan(n);
    if (n <= period) return out;
    let v = input.slice(1, period + 1).reduce((a, b) => a + b, 0);
    out[period] = v;
    for (let i = period + 1; i < n; i++) {
      v = v - v / period + input[i];
      out[i] = v;
    }
    return out;
  };
  const sp = smooth(plus),
    sm = smooth(minus),
    st = smooth(tr),
    pdi = nan(n),
    mdi = nan(n),
    dx = nan(n);
  for (let i = period; i < n; i++) {
    pdi[i] = st[i] ? (100 * sp[i]) / st[i] : 0;
    mdi[i] = st[i] ? (100 * sm[i]) / st[i] : 0;
    dx[i] = pdi[i] + mdi[i] ? (100 * Math.abs(pdi[i] - mdi[i])) / (pdi[i] + mdi[i]) : 0;
  }
  const out = nan(n);
  let first = 2 * period - 1;
  if (n > first) {
    let value = dx.slice(period, first + 1).reduce((a, b) => a + b, 0) / period;
    out[first] = value;
    for (let i = first + 1; i < n; i++) {
      value = (value * (period - 1) + dx[i]) / period;
      out[i] = value;
    }
  }
  return { adx: out, plusDI: pdi, minusDI: mdi };
}

export function obv(candles: Candle[]): number[] {
  const out = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++)
    out[i] =
      out[i - 1] +
      (candles[i].close > candles[i - 1].close
        ? candles[i].volume
        : candles[i].close < candles[i - 1].close
          ? -candles[i].volume
          : 0);
  return out;
}

export function donchian(candles: Candle[], period = 20): { high: number[]; low: number[] } {
  const high = nan(candles.length),
    low = nan(candles.length);
  for (let i = period - 1; i < candles.length; i++) {
    const s = candles.slice(i - period + 1, i + 1);
    high[i] = Math.max(...s.map((c) => c.high));
    low[i] = Math.min(...s.map((c) => c.low));
  }
  return { high, low };
}

export function rollingVolumeSMA(candles: Candle[], period = 20): number[] {
  return sma(
    candles.map((c) => c.volume),
    period,
  );
}
