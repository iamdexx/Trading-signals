import {
  adx,
  atr,
  bollinger,
  donchian,
  ema,
  macd,
  obv,
  rsi,
  rollingVolumeSMA,
} from './indicators.js';
import type {
  Candle,
  Indicators,
  Regime,
  ScoreBreakdown,
  Signal,
  StrategyConfig,
} from './types.js';

export function calculateIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((candle) => candle.close);
  return {
    sma20: rollingVolumeSMA(candles),
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi: rsi(closes),
    macd: macd(closes),
    bollinger: bollinger(closes),
    atr: atr(candles),
    adx: adx(candles),
    obv: obv(candles),
    donchian: donchian(candles),
    volumeSma: rollingVolumeSMA(candles),
  };
}

export function regimeAt(candles: Candle[], daily: Candle[], index: number): Regime {
  if (daily.length >= 210) {
    const closes = daily.map((candle) => candle.close);
    const dailyEma50 = ema(closes, 50);
    const dailyEma200 = ema(closes, 200);
    let day = daily.length - 1;
    while (day >= 0 && daily[day].time + 86400 > candles[index].time) {
      day -= 1;
    }
    if (day < 0) {
      return 'unknown';
    }
    return daily[day].close > dailyEma200[day] && dailyEma50[day] > dailyEma200[day]
      ? 'bullish'
      : 'bearish';
  }
  return 'unknown';
}

export function scoreAt(
  index: number,
  candles: Candle[],
  indicators: Indicators,
  regime: Regime,
): ScoreBreakdown {
  const trend =
    indicators.ema20[index] > indicators.ema50[index] &&
    candles[index].close > indicators.ema50[index]
      ? 25
      : 0;
  const start = Math.max(0, index - 8);
  const recentPullback =
    indicators.rsi.slice(start, index).some((value) => value < 50) ||
    candles
      .slice(start, index)
      .some((candle, offset) => candle.low <= indicators.ema20[start + offset]);
  const trigger =
    (indicators.rsi[index - 1] <= 50 && indicators.rsi[index] > 50) ||
    (indicators.macd.histogram[index - 1] < 0 && indicators.macd.histogram[index] > 0) ||
    (candles[index].close >
      Math.max(...candles.slice(Math.max(0, index - 3), index).map((bar) => bar.high)) &&
      indicators.rsi[index] > 50);
  const pullback = recentPullback && trigger ? 25 : 0;
  const momentum = indicators.macd.line[index] > indicators.macd.signal[index] ? 15 : 0;
  const volume = candles[index].volume >= indicators.volumeSma[index] * 0.8 ? 15 : 0;
  const adxScore = indicators.adx.adx[index] >= 18 ? 10 : 0;
  const regimeScore = regime === 'bullish' ? 10 : 0;

  return {
    trend,
    pullback,
    momentum,
    volume,
    adx: adxScore,
    regime: regimeScore,
    total: trend + pullback + momentum + volume + adxScore + regimeScore,
  };
}

export function generateSignals(
  productId: string,
  candles: Candle[],
  daily: Candle[] = [],
): Signal[] {
  const indicators = calculateIndicators(candles);
  const signals: Signal[] = [];
  for (let index = 210; index < candles.length - 1; index += 1) {
    const regime = regimeAt(candles, daily, index);
    const score = scoreAt(index, candles, indicators, regime);
    const hardConditions =
      score.trend > 0 &&
      score.pullback > 0 &&
      score.momentum > 0 &&
      score.volume > 0 &&
      score.adx > 0 &&
      regime === 'bullish' &&
      indicators.atr[index] / candles[index].close >= 0.003 &&
      indicators.atr[index] / candles[index].close <= 0.08;
    if (hardConditions) {
      signals.push({
        time: candles[index].time,
        productId,
        side: 'BUY',
        price: candles[index + 1].open,
        reason: 'trend_pullback',
        score: score.total,
        components: score,
      });
    }
  }
  return signals;
}

export function positionSize(
  equity: number,
  entry: number,
  stop: number,
  config: StrategyConfig,
): number {
  const maxNotional = equity * (config.maxNotionalPct ?? 0.2);
  const requested =
    config.sizingMode === 'fixed_usd'
      ? (config.fixedUsdPerTrade ?? equity * config.riskPerTrade) / entry
      : (equity * config.riskPerTrade) / Math.max(entry - stop, entry * 0.0001);
  return Math.min(requested, maxNotional / entry);
}

export function fillPrice(price: number, side: 'BUY' | 'SELL', slippageBps: number): number {
  const direction = side === 'BUY' ? 1 : -1;
  return price * (1 + (direction * slippageBps) / 10000);
}

export function fee(notional: number, feeBps: number): number {
  return (notional * feeBps) / 10000;
}

export function tradePnl(
  entry: number,
  exit: number,
  quantity: number,
  config: StrategyConfig,
): number {
  const buy = fillPrice(entry, 'BUY', config.slippageBps);
  const sell = fillPrice(exit, 'SELL', config.slippageBps);
  return (
    (sell - buy) * quantity -
    fee(buy * quantity, config.feeBps) -
    fee(sell * quantity, config.feeBps)
  );
}
