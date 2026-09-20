import { buildRegimeMap, createEngineContext, stepProduct } from './engine.js';
import { exitLegPnl } from './pnl.js';
import { scoreAt } from './strategy.js';
import type {
  BacktestReport,
  BacktestTrade,
  Candle,
  EngineState,
  PortfolioState,
  StrategyConfig,
  SignalReason,
} from './types.js';

type ReasonAccumulator = Partial<Record<SignalReason, { count: number; totalR: number }>>;

function addReason(stats: ReasonAccumulator, reason: SignalReason, r: number): void {
  const current = stats[reason] ?? { count: 0, totalR: 0 };
  current.count += 1;
  current.totalR += r;
  stats[reason] = current;
}

function finalizeReasons(stats: ReasonAccumulator): BacktestReport['exitReasons'] {
  return Object.fromEntries(
    Object.entries(stats).map(([reason, value]) => [
      reason,
      {
        count: value?.count ?? 0,
        meanR: value?.count ? value.totalR / value.count : 0,
      },
    ]),
  ) as BacktestReport['exitReasons'];
}

function combineReasons(stats: ReasonAccumulator[]): ReasonAccumulator {
  return stats.reduce<ReasonAccumulator>((combined, currentStats) => {
    for (const [reason, value] of Object.entries(currentStats)) {
      const key = reason as SignalReason;
      const current = combined[key] ?? { count: 0, totalR: 0 };
      current.count += value?.count ?? 0;
      current.totalR += value?.totalR ?? 0;
      combined[key] = current;
    }
    return combined;
  }, {});
}

function reportFromTrades(
  trades: BacktestTrade[],
  equityCurve: Array<{ time: number; equity: number }>,
  startingEquity: number,
  productId?: string,
  reasonStats: ReasonAccumulator = {},
  regimeCoverage = 0,
): BacktestReport {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = -losses.reduce((sum, trade) => sum + trade.pnl, 0);
  let peak = startingEquity;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - point.equity) / peak);
  }
  const returns = equityCurve.slice(1).map((point, index) => {
    const previous = equityCurve[index].equity;
    return previous ? (point.equity - previous) / previous : 0;
  });
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const deviation = Math.sqrt(
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1),
  );
  const finalEquity = equityCurve.at(-1)?.equity ?? startingEquity;

  return {
    productId,
    trades,
    winRate: trades.length ? wins.length / trades.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    expectancyR: trades.length
      ? trades.reduce((sum, trade) => sum + trade.r, 0) / trades.length
      : 0,
    maxDrawdownPct: maxDrawdown * 100,
    cagr: startingEquity
      ? ((finalEquity / startingEquity) ** (365 / Math.max(1, equityCurve.length / 24)) - 1) * 100
      : 0,
    sharpe: deviation ? (mean / deviation) * Math.sqrt(24 * 365) : 0,
    equityCurve,
    finalEquity,
    netPnl: finalEquity - startingEquity,
    regimeCoverage,
    exitReasons: finalizeReasons(reasonStats),
  };
}

function regimeCoverage(candles: Candle[], daily: Candle[]): number {
  const regimes = buildRegimeMap(candles, daily).slice(210);
  return regimes.length
    ? (regimes.filter((regime) => regime === 'bullish').length / regimes.length) * 100
    : 0;
}

function recordClosedTrades(
  trades: BacktestTrade[],
  events: ReturnType<typeof stepProduct>['events'],
  productId: string,
  time: number,
  reasonStats: ReasonAccumulator,
): void {
  for (const event of events) {
    if (event.type !== 'fill' || !event.position) {
      continue;
    }
    const denominator = Math.max(event.position.initialRisk * event.position.qty, 0.0000001);
    if (event.position.status === 'open' && event.legPnl !== undefined) {
      addReason(reasonStats, 'target_partial', event.legPnl / denominator);
      continue;
    }
    if (event.position.status !== 'closed' || event.pnl === undefined) {
      continue;
    }
    const reason = event.position.reason ?? 'stop';
    addReason(reasonStats, reason, event.pnl / denominator);
    trades.push({
      productId,
      entryTime: event.position.entryTime,
      exitTime: event.position.exitTime ?? time,
      entry: event.position.entryPrice,
      exit: event.position.currentPrice,
      qty: event.position.qty,
      pnl: event.pnl,
      initialRisk: event.position.initialRisk,
      r: event.pnl / denominator,
      reason,
    });
  }
}

function productCurve(
  trades: BacktestTrade[],
  startingEquity: number,
  times: number[],
): Array<{ time: number; equity: number }> {
  let equity = startingEquity;
  let tradeIndex = 0;
  return times.map((time) => {
    while (tradeIndex < trades.length && trades[tradeIndex].exitTime <= time) {
      equity += trades[tradeIndex].pnl;
      tradeIndex += 1;
    }
    return { time, equity };
  });
}

function forceClose(
  state: EngineState,
  portfolio: PortfolioState,
  productId: string,
  candle: Candle,
  config: StrategyConfig,
  trades: BacktestTrade[],
  reasonStats: ReasonAccumulator,
): void {
  const position = state.position;
  if (!position || !position.remainingQty) {
    return;
  }
  const legPnl = exitLegPnl(position.entryFill, candle.close, position.remainingQty, config);
  const pnl = position.realized + legPnl;
  addReason(reasonStats, 'trail', pnl / Math.max(position.initialRisk * position.qty, 0.0000001));
  portfolio.equity += legPnl;
  portfolio.realized += legPnl;
  trades.push({
    productId,
    entryTime: position.entryTime,
    exitTime: candle.time,
    entry: position.entryPrice,
    exit: candle.close,
    qty: position.qty,
    initialRisk: position.initialRisk,
    pnl,
    r: pnl / Math.max(position.initialRisk * position.qty, 0.0000001),
    reason: 'trail',
  });
  state.position = undefined;
}

export function backtestProduct(
  productId: string,
  candles: Candle[],
  daily: Candle[],
  config: StrategyConfig,
  marketDaily = daily,
): BacktestReport {
  const portfolio: PortfolioState = { equity: config.startingEquity, realized: 0 };
  const context = createEngineContext(productId, candles, daily, config, 0, portfolio, marketDaily);
  const state: EngineState = { cooldownUntil: -Infinity, trendFailureBars: 0 };
  const trades: BacktestTrade[] = [];
  const reasonStats: ReasonAccumulator = {};
  const equityCurve: Array<{ time: number; equity: number }> = [];

  for (let index = 210; index < candles.length; index += 1) {
    const result = stepProduct(state, index, {
      ...context,
      portfolio,
      openPositions: state.position ? 1 : 0,
    });
    Object.assign(state, result.state);
    portfolio.equity = result.portfolio.equity;
    portfolio.realized = result.portfolio.realized;
    recordClosedTrades(trades, result.events, productId, candles[index].time, reasonStats);
    equityCurve.push({ time: candles[index].time, equity: portfolio.equity });
  }
  forceClose(state, portfolio, productId, candles.at(-1) as Candle, config, trades, reasonStats);
  if (equityCurve.length) {
    equityCurve[equityCurve.length - 1] = {
      time: equityCurve.at(-1)?.time ?? candles.at(-1)?.time ?? 0,
      equity: portfolio.equity,
    };
  }
  return reportFromTrades(
    trades,
    equityCurve,
    config.startingEquity,
    productId,
    reasonStats,
    regimeCoverage(candles, marketDaily),
  );
}

export function portfolioBacktest(
  data: Record<string, Candle[]>,
  daily: Record<string, Candle[]>,
  config: StrategyConfig,
  marketDaily?: Candle[],
): BacktestReport {
  const portfolio: PortfolioState = { equity: config.startingEquity, realized: 0 };
  const marketCandles =
    data['BTC-USD'] ??
    Object.values(data).sort((left, right) => right.length - left.length)[0] ??
    [];
  const marketDailyCandles =
    marketDaily ??
    daily['BTC-USD'] ??
    Object.values(daily).sort((left, right) => right.length - left.length)[0] ??
    [];
  const products = Object.entries(data).map(([productId, candles]) => ({
    productId,
    candles,
    context: createEngineContext(
      productId,
      candles,
      daily[productId] ?? [],
      config,
      0,
      portfolio,
      marketDailyCandles,
    ),
    state: { cooldownUntil: -Infinity, trendFailureBars: 0 } as EngineState,
    trades: [] as BacktestTrade[],
    reasonStats: {} as ReasonAccumulator,
  }));
  const times = [
    ...new Set(products.flatMap((product) => product.candles.slice(210).map((bar) => bar.time))),
  ].sort((a, b) => a - b);
  const equityCurve: Array<{ time: number; equity: number }> = [];

  for (const time of times) {
    const candidates = products
      .map((product) => {
        const index = product.candles.findIndex((bar) => bar.time === time);
        if (index < 210) {
          return undefined;
        }
        const score = scoreAt(
          index,
          product.candles,
          product.context.indicators,
          product.context.dailyRegimes[index],
        );
        return { product, index, score: score.total };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort(
        (left, right) =>
          right.score - left.score || left.product.productId.localeCompare(right.product.productId),
      );

    for (const candidate of candidates) {
      const active = products.filter((product) => product.state.position).length;
      const result = stepProduct(candidate.product.state, candidate.index, {
        ...candidate.product.context,
        portfolio,
        openPositions: active,
      });
      Object.assign(candidate.product.state, result.state);
      portfolio.equity = result.portfolio.equity;
      portfolio.realized = result.portfolio.realized;
      recordClosedTrades(
        candidate.product.trades,
        result.events,
        candidate.product.productId,
        time,
        candidate.product.reasonStats,
      );
    }
    equityCurve.push({ time, equity: portfolio.equity });
  }

  const finalCandleByProduct = new Map(
    products.map((product) => [product.productId, product.candles.at(-1) as Candle]),
  );
  for (const product of products) {
    forceClose(
      product.state,
      portfolio,
      product.productId,
      finalCandleByProduct.get(product.productId) as Candle,
      config,
      product.trades,
      product.reasonStats,
    );
  }
  if (equityCurve.length) {
    equityCurve[equityCurve.length - 1] = {
      time: equityCurve.at(-1)?.time ?? 0,
      equity: portfolio.equity,
    };
  }

  const trades = products
    .flatMap((product) => product.trades)
    .sort((a, b) => a.exitTime - b.exitTime);
  const perProduct: Record<string, BacktestReport> = {};
  for (const product of products) {
    const productTrades = product.trades.sort((a, b) => a.exitTime - b.exitTime);
    perProduct[product.productId] = reportFromTrades(
      productTrades,
      productCurve(productTrades, config.startingEquity, times),
      config.startingEquity,
      product.productId,
      product.reasonStats,
      regimeCoverage(product.candles, marketDailyCandles),
    );
  }
  return {
    ...reportFromTrades(
      trades,
      equityCurve,
      config.startingEquity,
      undefined,
      combineReasons(products.map((product) => product.reasonStats)),
      regimeCoverage(marketCandles, marketDailyCandles),
    ),
    perProduct,
  };
}
