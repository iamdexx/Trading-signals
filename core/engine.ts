import { ema } from './indicators.js';
import { calculateIndicators, positionSize, scoreAt, regimeAt } from './strategy.js';
import { entryFee, entryFill, exitLegPnl } from './pnl.js';
import type {
  Candle,
  EngineContext,
  EngineEvent,
  EngineState,
  Position,
  PortfolioState,
  Signal,
  SignalReason,
} from './types.js';

export function buildRegimeMap(hourly: Candle[], daily: Candle[]): ReturnType<typeof regimeAt>[] {
  const dailyCloses = daily.map((bar) => bar.close);
  const dailyEma50 = ema(dailyCloses, 50);
  const dailyEma200 = ema(dailyCloses, 200);
  let dailyIndex = -1;

  return hourly.map((bar) => {
    while (dailyIndex + 1 < daily.length && daily[dailyIndex + 1].time + 86400 <= bar.time) {
      dailyIndex += 1;
    }
    if (dailyIndex >= 209) {
      return daily[dailyIndex].close > dailyEma200[dailyIndex] &&
        dailyEma50[dailyIndex] > dailyEma200[dailyIndex]
        ? 'bullish'
        : 'bearish';
    }
    return 'unknown';
  });
}

function makeSignal(
  productId: string,
  candle: Candle,
  reason: SignalReason,
  price: number,
  score?: number,
  components?: ReturnType<typeof scoreAt>,
): Signal {
  return {
    time: candle.time,
    productId,
    side: reason === 'trend_pullback' ? 'BUY' : 'SELL',
    price,
    reason,
    score,
    components,
  };
}

function closePosition(
  state: EngineState,
  portfolio: PortfolioState,
  position: Position,
  candle: Candle,
  rawPrice: number,
  exitTime: number,
  reason: SignalReason,
  context: EngineContext,
): EngineEvent[] {
  const legPnl = exitLegPnl(position.entryFill, rawPrice, position.remainingQty, context.config);
  const closed = {
    ...position,
    currentPrice: rawPrice,
    status: 'closed' as const,
    realized: position.realized + legPnl,
    reason,
    exitTime,
    remainingQty: 0,
  };
  portfolio.equity += legPnl;
  portfolio.realized += legPnl;
  if (reason === 'stop') {
    state.cooldownUntil = candle.time + context.barIntervalSeconds * 6;
  }
  state.position = undefined;
  return [
    {
      type: 'signal',
      signal: makeSignal(position.productId, candle, reason, rawPrice),
    },
    { type: 'fill', position: closed, pnl: closed.realized, legPnl },
  ];
}

export function stepProduct(
  state: EngineState,
  index: number,
  context: EngineContext,
): { state: EngineState; portfolio: PortfolioState; events: EngineEvent[] } {
  const nextState: EngineState = {
    ...state,
    position: state.position ? { ...state.position } : undefined,
  };
  const portfolio = { ...context.portfolio };
  const candle = context.candles[index];
  const events: EngineEvent[] = [];
  if (!candle) {
    return { state: nextState, portfolio, events };
  }

  const indicators = context.indicators;
  const regime =
    context.dailyRegimes[index] ?? regimeAt(context.candles, context.dailyCandles, index);
  const marketRegime = context.marketRegimes[index] ?? 'unknown';
  if (nextState.position) {
    const position = nextState.position;
    position.currentPrice = candle.close;
    position.highestHigh = Math.max(position.highestHigh, candle.high);

    if (context.config.partialEnabled && !position.partialTaken && candle.high >= position.target) {
      const partialQty = position.remainingQty * 0.5;
      const partialPnl = exitLegPnl(
        position.entryFill,
        position.target,
        partialQty,
        context.config,
      );
      position.remainingQty -= partialQty;
      position.partialTaken = true;
      position.stop = position.entryPrice;
      position.realized += partialPnl;
      portfolio.equity += partialPnl;
      portfolio.realized += partialPnl;
      events.push({
        type: 'signal',
        signal: makeSignal(context.productId, candle, 'target_partial', position.target),
      });
      events.push({ type: 'fill', position: { ...position }, legPnl: partialPnl });
    }

    const trail =
      position.partialTaken || !context.config.partialEnabled
        ? position.highestHigh - context.config.trailAtrMult * indicators.atr[index]
        : position.stop;
    if (candle.low <= trail) {
      const rawExit = candle.open < trail ? candle.open : trail;
      events.push(
        ...closePosition(
          nextState,
          portfolio,
          position,
          candle,
          rawExit,
          candle.time,
          position.partialTaken ? 'trail' : 'stop',
          context,
        ),
      );
      return { state: nextState, portfolio, events };
    }

    const wasBelow = index > 0 && context.candles[index - 1].close < indicators.ema50[index - 1];
    nextState.trendFailureBars = wasBelow && candle.close < indicators.ema50[index] ? 2 : 0;
    const nextBar = context.candles[index + 1];
    if (nextState.trendFailureBars >= 2 && nextBar) {
      events.push(
        ...closePosition(
          nextState,
          portfolio,
          position,
          candle,
          nextBar.open,
          nextBar.time,
          'trend_fail',
          context,
        ),
      );
      return { state: nextState, portfolio, events };
    }
    if ((regime === 'bearish' || marketRegime === 'bearish') && nextBar) {
      events.push(
        ...closePosition(
          nextState,
          portfolio,
          position,
          candle,
          nextBar.open,
          nextBar.time,
          'regime',
          context,
        ),
      );
      return { state: nextState, portfolio, events };
    }
    events.push({ type: 'mark', position: { ...position } });
    return { state: nextState, portfolio, events };
  }

  const nextBar = context.candles[index + 1];
  if (!nextBar || candle.time < nextState.cooldownUntil) {
    return { state: nextState, portfolio, events };
  }
  const score = scoreAt(index, context.candles, indicators, regime, context.newsScore);
  const start = Math.max(0, index - 8);
  const recentPullback =
    indicators.rsi.slice(start, index).some((value) => value < 50) ||
    context.candles
      .slice(start, index)
      .some((item, offset) => item.low <= indicators.ema20[start + offset]);
  const previousHigh = Math.max(
    ...context.candles.slice(Math.max(0, index - 3), index).map((bar) => bar.high),
  );
  const trigger =
    (indicators.rsi[index - 1] <= 50 && indicators.rsi[index] > 50) ||
    (indicators.macd.histogram[index - 1] < 0 && indicators.macd.histogram[index] > 0) ||
    (candle.close > previousHigh && indicators.rsi[index] > 50);
  const hardConditions =
    score.trend > 0 &&
    recentPullback &&
    trigger &&
    score.momentum > 0 &&
    score.volume > 0 &&
    score.adx > 0 &&
    regime === 'bullish' &&
    marketRegime === 'bullish' &&
    !context.newsBlocked &&
    indicators.atr[index] / candle.close >= 0.003 &&
    indicators.atr[index] / candle.close <= 0.08;
  if (!hardConditions || context.openPositions >= (context.config.maxPositions ?? 5)) {
    return { state: nextState, portfolio, events };
  }

  const entry = entryFill(nextBar.open, context.config);
  const stop = entry - context.config.stopAtrMult * indicators.atr[index];
  const quantity = positionSize(portfolio.equity, entry, stop, context.config);
  const initialEntryFee = entryFee(nextBar.open, quantity, context.config);
  const position: Position = {
    productId: context.productId,
    entryTime: nextBar.time,
    entryPrice: entry,
    currentPrice: entry,
    entryFill: entry,
    entryFee: initialEntryFee,
    qty: quantity,
    remainingQty: quantity,
    stop,
    target: entry + context.config.targetR * (entry - stop),
    initialRisk: entry - stop,
    atrAtEntry: indicators.atr[index],
    highestHigh: entry,
    partialTaken: false,
    status: 'open',
    realized: -initialEntryFee,
  };
  portfolio.equity -= initialEntryFee;
  portfolio.realized -= initialEntryFee;
  nextState.position = position;
  events.push({
    type: 'signal',
    signal: makeSignal(context.productId, candle, 'trend_pullback', entry, score.total, score),
  });
  events.push({ type: 'fill', position });
  return { state: nextState, portfolio, events };
}

export function createEngineContext(
  productId: string,
  candles: Candle[],
  dailyCandles: Candle[],
  config: EngineContext['config'],
  openPositions = 0,
  portfolio: PortfolioState = {
    equity: config.startingEquity,
    realized: 0,
  },
  marketDailyCandles = dailyCandles,
): EngineContext {
  return {
    productId,
    candles,
    dailyCandles,
    indicators: calculateIndicators(candles),
    dailyRegimes: buildRegimeMap(candles, dailyCandles),
    marketRegimes: buildRegimeMap(candles, marketDailyCandles),
    config,
    openPositions,
    portfolio,
    barIntervalSeconds: candles[1] ? candles[1].time - candles[0].time : 3600,
  };
}
