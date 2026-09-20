import type {
  AnalysisResponse,
  HealthResponse,
  PortfolioResponse,
  PositionResponse,
  ScanRow,
  DiagnosticsResponse,
  NewsSummaryResponse,
  NewsArticle,
  Settings,
  UniverseProduct,
} from '../shared/api.js';
import type { BacktestReport } from '../core/types.js';
import type { Signal } from '../core/types.js';

async function request<T>(url: string, options?: Parameters<typeof fetch>[1]): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export const getHealth = () => request<HealthResponse>('/api/health');
export const getUniverse = () => request<UniverseProduct[]>('/api/universe');
export const getSignals = (limit = 50) => request<Signal[]>(`/api/signals?limit=${limit}`);
export const getPositions = () => request<PositionResponse[]>('/api/positions');
export const getPortfolio = () => request<PortfolioResponse>('/api/portfolio');
export const getScan = () => request<ScanRow[]>('/api/scan');
export const getNews = (product?: string, limit = 50) =>
  request<NewsArticle[]>(
    `/api/news?limit=${limit}${product ? `&product=${encodeURIComponent(product)}` : ''}`,
  );
export const getNewsSummary = () => request<NewsSummaryResponse>('/api/news/summary');
export const getDiagnostics = (productId: string) =>
  request<DiagnosticsResponse>(`/api/diagnostics/${productId}`);
export const getAnalysis = (productId: string) =>
  request<AnalysisResponse>(`/api/products/${productId}/analysis`);
export const getBacktest = (productId?: string) =>
  request<BacktestReport>(productId ? `/api/backtest/${productId}` : '/api/backtest');
export const getSettings = () => request<Settings>('/api/settings');
export const putSettings = (settings: Settings) =>
  request<Settings>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
export const resetPaper = () => request<Settings>('/api/paper/reset', { method: 'POST' });
