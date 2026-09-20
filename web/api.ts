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

const snapshotBase = String(import.meta.env.VITE_SNAPSHOT_BASE ?? '').replace(/\/$/, '');

function snapshotUrl(url: string): { url: string; slice?: number } {
  const parsed = new URL(url, window.location.origin);
  const pathname = parsed.pathname;
  const query = parsed.searchParams;
  let target: string;
  let slice: number | undefined;
  if (pathname === '/api/news') {
    const product = query.get('product');
    target = product ? `/api/products/${encodeURIComponent(product)}/news.json` : '/api/news.json';
  } else if (pathname === '/api/news/summary') {
    target = '/api/news-summary.json';
  } else if (pathname === '/api/signals') {
    target = '/api/signals.json';
    slice = Number(query.get('limit') ?? 50);
  } else if (pathname === '/api/backtest') {
    target = '/api/backtest.json';
  } else if (/^\/api\/backtest\/[^/]+$/.test(pathname)) {
    target = `${pathname}.json`;
  } else if (/^\/api\/products\/[^/]+\/analysis$/.test(pathname)) {
    target = `${pathname}.json`;
  } else if (/^\/api\/products\/[^/]+\/news$/.test(pathname)) {
    target = `${pathname}.json`;
    slice = Number(query.get('limit') ?? 50);
  } else {
    target = `${pathname}.json`;
  }
  const cacheBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  return { url: `${snapshotBase}${target}?t=${cacheBucket}`, slice };
}

async function request<T>(url: string, options?: Parameters<typeof fetch>[1]): Promise<T> {
  const isStatic = Boolean(snapshotBase);
  if (isStatic && options?.method && options.method !== 'GET') {
    throw new Error('This static dashboard is read-only.');
  }
  const resolved = isStatic ? snapshotUrl(url) : { url };
  const response = await fetch(resolved.url, options);
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as T;
  if (resolved.slice !== undefined && Array.isArray(body)) {
    return body.slice(0, resolved.slice) as T;
  }
  return body;
}

export const staticMode = Boolean(snapshotBase);
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
