import 'dotenv/config';
import { candles as fetchCandles } from './market.js';
import { backtestProduct } from '../core/backtest.js';
const id = process.argv.includes('--product')
  ? process.argv[process.argv.indexOf('--product') + 1]
  : 'BTC-USD';
const timeframe = process.env.TIMEFRAME ?? 'FOUR_HOUR';
const rows = await fetchCandles(id, timeframe, 3000);
const daily = await fetchCandles(id, 'ONE_DAY', 500);
const marketDaily = id === 'BTC-USD' ? daily : await fetchCandles('BTC-USD', 'ONE_DAY', 500);
const report = backtestProduct(
  id,
  rows,
  daily,
  {
    riskPerTrade: Number(process.env.RISK_PER_TRADE ?? 0.01),
    startingEquity: Number(process.env.STARTING_EQUITY ?? 10000),
    feeBps: Number(process.env.FEE_BPS ?? 60),
    slippageBps: Number(process.env.SLIPPAGE_BPS ?? 5),
    stopAtrMult: Number(process.env.STOP_ATR_MULT ?? 3),
    targetR: Number(process.env.TARGET_R ?? 1.5),
    trailAtrMult: Number(process.env.TRAIL_ATR_MULT ?? 3),
    partialEnabled: process.env.PARTIAL_ENABLED !== 'false',
  },
  marketDaily,
);
console.table({
  product: id,
  trades: report.trades.length,
  winRate: `${(report.winRate * 100).toFixed(2)}%`,
  avgWin: report.avgWin.toFixed(2),
  avgLoss: report.avgLoss.toFixed(2),
  profitFactor: report.profitFactor.toFixed(2),
  expectancyR: report.expectancyR.toFixed(3),
  maxDrawdown: `${report.maxDrawdownPct.toFixed(2)}%`,
  cagr: `${report.cagr.toFixed(2)}%`,
  sharpe: report.sharpe.toFixed(2),
  finalEquity: report.finalEquity.toFixed(2),
});
