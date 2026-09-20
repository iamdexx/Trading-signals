export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MacdResult {
  line: number[];
  signal: number[];
  histogram: number[];
}

export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

export interface AdxResult {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

export interface Indicators {
  sma20: number[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  rsi: number[];
  macd: MacdResult;
  bollinger: BollingerResult;
  atr: number[];
  adx: AdxResult;
  obv: number[];
  donchian: { high: number[]; low: number[] };
  volumeSma: number[];
}

export type Regime = 'bullish' | 'bearish' | 'unknown';
export type SignalSide = 'BUY' | 'SELL';
export type Catalyst =
  | 'listing'
  | 'delisting'
  | 'upgrade'
  | 'partnership'
  | 'etf'
  | 'regulation_positive'
  | 'regulation_negative'
  | 'hack'
  | 'lawsuit'
  | 'unlock'
  | 'macro';
export type SignalReason =
  'trend_pullback' | 'stop' | 'target_partial' | 'trail' | 'trend_fail' | 'regime';

export interface StrategyConfig {
  riskPerTrade: number;
  startingEquity: number;
  feeBps: number;
  slippageBps: number;
  sizingMode?: 'risk_pct' | 'fixed_usd';
  fixedUsdPerTrade?: number;
  maxPositions?: number;
  maxNotionalPct?: number;
  newsEnabled?: boolean;
  newsBlockHours?: number;
  stopAtrMult: number;
  targetR: number;
  trailAtrMult: number;
  partialEnabled: boolean;
}

export interface ScoreBreakdown {
  trend: number;
  pullback: number;
  momentum: number;
  volume: number;
  adx: number;
  regime: number;
  news: number;
  total: number;
}

export interface Signal {
  time: number;
  productId: string;
  side: SignalSide;
  price: number;
  reason: SignalReason;
  score?: number;
  components?: ScoreBreakdown;
}

export interface NewsArticle {
  id: string;
  source: string;
  title: string;
  summary: string;
  link: string;
  published: number;
  sentiment: number;
  catalysts: Catalyst[];
  assets: string[];
}

export interface AssetNewsSummary {
  productId: string;
  score: number;
  count: number;
  catalysts: Catalyst[];
}

export interface FearGreedPoint {
  value: number;
  classification: string;
  timestamp: number;
}

export interface Position {
  id?: number;
  productId: string;
  entryTime: number;
  entryPrice: number;
  currentPrice: number;
  entryFill: number;
  entryFee: number;
  qty: number;
  remainingQty: number;
  stop: number;
  target: number;
  initialRisk: number;
  atrAtEntry: number;
  highestHigh: number;
  partialTaken: boolean;
  status: 'open' | 'closed';
  realized: number;
  reason?: SignalReason;
  exitTime?: number;
}

export interface EngineState {
  position?: Position;
  cooldownUntil: number;
  trendFailureBars: number;
}

export interface PortfolioState {
  equity: number;
  realized: number;
}

export interface EngineContext {
  productId: string;
  candles: Candle[];
  dailyCandles: Candle[];
  indicators: Indicators;
  dailyRegimes: Regime[];
  marketRegimes: Regime[];
  config: StrategyConfig;
  openPositions: number;
  portfolio: PortfolioState;
  barIntervalSeconds: number;
  newsBlocked?: boolean;
  newsScore?: number;
}

export interface EngineEvent {
  type: 'signal' | 'fill' | 'mark';
  signal?: Signal;
  position?: Position;
  pnl?: number;
  legPnl?: number;
}

export interface BacktestTrade {
  productId: string;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  qty: number;
  initialRisk: number;
  pnl: number;
  r: number;
  reason: SignalReason;
}

export interface BacktestReport {
  productId?: string;
  trades: BacktestTrade[];
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownPct: number;
  cagr: number;
  sharpe: number;
  equityCurve: Array<{ time: number; equity: number }>;
  finalEquity: number;
  netPnl: number;
  regimeCoverage: number;
  perProduct?: Record<string, BacktestReport>;
  exitReasons?: Partial<Record<SignalReason, { count: number; meanR: number }>>;
}
