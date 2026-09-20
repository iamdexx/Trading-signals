import 'dotenv/config';
import { portfolioBacktest } from '../core/backtest.js';
import type { BacktestReport, Candle, StrategyConfig } from '../core/types.js';
import { candles as fetchCandles } from '../server/market.js';
import { latestCandleTime, loadCandles, saveCandles, universe } from '../server/db.js';

const TARGET_BARS = 3000;
const SLIPPAGE_BPS = 5;
const STARTING_EQUITY = 10000;

interface SweepRow {
  tf: string;
  fee: number;
  stop: number;
  partial: string;
  trades: number;
  winRate: string;
  PF: string;
  expectancyR: string;
  maxDD: string;
  netPnl: string;
  avgStopDistPct: string;
  roundTripCostPct: string;
  costAsR: string;
  stopCount: number;
  stopMeanR: string;
  trailCount: number;
  trailMeanR: string;
  trendFailCount: number;
  trendFailMeanR: string;
  regimeCount: number;
  regimeMeanR: string;
  targetPartialCount: number;
  targetPartialMeanR: string;
}

function finite(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

async function ensureTimeframe(
  productId: string,
  timeframe: string,
  targetBars: number,
): Promise<Candle[]> {
  const existing = loadCandles(productId, timeframe);
  const fetched = await fetchCandles(
    productId,
    timeframe,
    targetBars,
    existing.length >= targetBars ? latestCandleTime(productId, timeframe) : 0,
    existing.length,
  );
  saveCandles(productId, timeframe, fetched);
  return loadCandles(productId, timeframe).slice(-targetBars);
}

function config(feeBps: number, stopAtrMult: number, partialEnabled: boolean): StrategyConfig {
  return {
    riskPerTrade: 0.01,
    startingEquity: STARTING_EQUITY,
    feeBps,
    slippageBps: SLIPPAGE_BPS,
    sizingMode: 'risk_pct',
    fixedUsdPerTrade: 100,
    maxPositions: 5,
    maxNotionalPct: 0.2,
    stopAtrMult,
    targetR: 1.5,
    trailAtrMult: 3,
    partialEnabled,
  };
}

function row(
  timeframe: string,
  feeBps: number,
  stopAtrMult: number,
  partialEnabled: boolean,
  report: BacktestReport,
): SweepRow {
  const avgStopDist =
    report.trades.length > 0
      ? report.trades.reduce(
          (sum, trade) => sum + (trade.initialRisk / Math.max(trade.entry, 0.0000001)) * 100,
          0,
        ) / report.trades.length
      : 0;
  const roundTripCostPct = (2 * feeBps + 2 * SLIPPAGE_BPS) / 100;
  const reason = (name: keyof NonNullable<BacktestReport['exitReasons']>) =>
    report.exitReasons?.[name] ?? { count: 0, meanR: 0 };
  const stop = reason('stop');
  const trail = reason('trail');
  const trendFail = reason('trend_fail');
  const regime = reason('regime');
  const targetPartial = reason('target_partial');
  return {
    tf: timeframe,
    fee: feeBps,
    stop: stopAtrMult,
    partial: partialEnabled ? 'on' : 'off',
    trades: report.trades.length,
    winRate: finite(report.winRate * 100, 1) + '%',
    PF: finite(report.profitFactor, 3),
    expectancyR: finite(report.expectancyR, 3),
    maxDD: finite(report.maxDrawdownPct, 2) + '%',
    netPnl: finite(report.netPnl, 2),
    avgStopDistPct: finite(avgStopDist, 3) + '%',
    roundTripCostPct: finite(roundTripCostPct, 3) + '%',
    costAsR: finite(avgStopDist ? roundTripCostPct / avgStopDist : 0, 3),
    stopCount: stop.count,
    stopMeanR: finite(stop.meanR, 3),
    trailCount: trail.count,
    trailMeanR: finite(trail.meanR, 3),
    trendFailCount: trendFail.count,
    trendFailMeanR: finite(trendFail.meanR, 3),
    regimeCount: regime.count,
    regimeMeanR: finite(regime.meanR, 3),
    targetPartialCount: targetPartial.count,
    targetPartialMeanR: finite(targetPartial.meanR, 3),
  };
}

const products = universe().filter((product) => product.historyStatus === 'ready');
const productIds = [...new Set([...products.map((product) => product.product_id), 'BTC-USD'])];
const data: Record<string, Candle[]> = {};
const daily: Record<string, Candle[]> = {};

for (const productId of productIds) {
  try {
    data[productId] = await ensureTimeframe(productId, 'FOUR_HOUR', TARGET_BARS);
    daily[productId] = await ensureTimeframe(productId, 'ONE_DAY', 500);
    process.stdout.write(`Cached ${productId}: ${data[productId].length} FOUR_HOUR bars\n`);
  } catch (error) {
    process.stderr.write(
      `Skipping ${productId}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

const rows: SweepRow[] = [];
for (const feeBps of [60, 40, 10]) {
  for (const stopAtrMult of [2, 3]) {
    for (const partialEnabled of [true, false]) {
      const report = portfolioBacktest(data, daily, config(feeBps, stopAtrMult, partialEnabled));
      rows.push(row('FOUR_HOUR', feeBps, stopAtrMult, partialEnabled, report));
    }
  }
}

console.log('\nSweep results');
console.table(rows);

const baseline = portfolioBacktest(data, daily, config(60, 3, true));
console.log('\nBaseline 4H / 60bps / stop 3 / partial on — per product sorted by net P&L');
console.table(
  Object.values(baseline.perProduct ?? {})
    .sort((left, right) => right.netPnl - left.netPnl)
    .map((report) => ({
      product: report.productId,
      trades: report.trades.length,
      winRate: finite(report.winRate * 100, 1) + '%',
      PF: finite(report.profitFactor, 3),
      expectancyR: finite(report.expectancyR, 3),
      netPnl: finite(report.netPnl, 2),
    })),
);
