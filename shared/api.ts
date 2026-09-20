import type {
  BacktestReport,
  Candle,
  AssetNewsSummary,
  FearGreedPoint,
  NewsArticle,
  Position,
  Regime,
  ScoreBreakdown,
  Signal,
} from '../core/types.js';

export interface UniverseProduct {
  product_id: string;
  price: number;
  volume24_base: number;
  volume24_usd: number;
  price_percentage_change_24h: number;
  base_name: string;
  historyStatus: 'ready' | 'insufficient_history';
  lastError?: string;
}

export interface HealthResponse {
  ok: boolean;
  ready: boolean;
  lastRefresh: number;
  productsLoaded: number;
  errors: Array<{ productId: string; message: string }>;
  marketRegime: Regime;
  fearGreed?: FearGreedPoint;
}

export interface PortfolioResponse {
  equity: number;
  realized: number;
  unrealized: number;
  drawdown: number;
  curve: Array<{ time: number; equity: number }>;
  startDate: number;
}

export interface AnalysisResponse {
  product: string;
  candles: Candle[];
  indicators: {
    ema20: number[];
    ema50: number[];
    ema200: number[];
    rsi: number[];
    macd: number[];
    adx: number[];
    atrPct: number[];
  };
  regime: Regime;
  score: ScoreBreakdown;
  signals: Signal[];
  position?: Position;
  backtest: BacktestReport;
  news: AssetNewsSummary;
}

export interface ScanRow {
  productId: string;
  price: number;
  change24hPct: number;
  regime: Regime;
  marketRegime: Regime;
  score: number;
  components: ScoreBreakdown;
  rsi: number;
  adx: number;
  atrPct: number;
  trendUp: boolean;
  status: 'signal' | 'in_position' | 'setup' | 'none' | 'insufficient_history' | 'blocked_by_news';
  volume24Usd: number;
  lastError?: string;
  newsScore: number;
  newsCount: number;
  catalysts: string[];
  blockedByNews: boolean;
}

export interface DiagnosticsResponse {
  productId: string;
  bars: number;
  conditions: {
    trend: number;
    pullback: number;
    trigger: number;
    momentum: number;
    volume: number;
    volatility: number;
    adx: number;
    regime: number;
    all: number;
  };
}

export interface Settings {
  startingEquity: number;
  sizingMode: 'risk_pct' | 'fixed_usd';
  riskPerTrade: number;
  fixedUsdPerTrade: number;
  maxPositions: number;
  maxNotionalPct: number;
  stopAtrMult: number;
  targetR: number;
  trailAtrMult: number;
  partialEnabled: boolean;
  newsEnabled: boolean;
  newsBlockHours: number;
  feeBps: number;
  slippageBps: number;
  universeSize: number;
  timeframe: string;
  startDate: number;
}

export interface PositionResponse extends Position {
  unrealized: number;
  unrealizedPct: number;
  rMultiple: number;
}

export interface NewsSummaryResponse {
  marketSentiment: number;
  fearGreed?: FearGreedPoint;
  fearGreedHistory: FearGreedPoint[];
  topPositive: AssetNewsSummary[];
  topNegative: AssetNewsSummary[];
  trending: Array<{ productId: string; symbol: string; name: string; score: number }>;
}

export type { AssetNewsSummary, FearGreedPoint, NewsArticle };
