import { useEffect, useState } from 'react';
import type { Signal } from '../core/types';
import type {
  AnalysisResponse,
  HealthResponse,
  LedgerEntry,
  ManualPositionResponse,
  NewsArticle,
  NewsSummaryResponse,
  PortfolioResponse,
  PositionResponse,
  ScanRow,
  Settings as SettingsType,
  UniverseProduct,
} from '../shared/api';
import {
  getAnalysis,
  getBacktest,
  getHealth,
  getNews,
  getNewsSummary,
  getLedger,
  getPortfolio,
  getPositions,
  getScan,
  getSettings,
  getSignals,
  getUniverse,
  putSettings,
  resetPaper,
  staticMode,
} from './api';
import { Backtest } from './pages/Backtest';
import { Overview } from './pages/Overview';
import { Product } from './pages/Product';
import { Scanner } from './pages/Scanner';
import { Settings } from './pages/Settings';
import { News } from './pages/News';
import { Ledger } from './pages/Ledger';
import { PageErrorBoundary } from './components/PageErrorBoundary';

type Page = 'Overview' | 'Scanner' | 'Product' | 'Backtest' | 'News' | 'Ledger' | 'Settings';

function initialPage(): Page {
  const value = new URLSearchParams(window.location.search).get('page');
  return value === 'Scanner' ||
    value === 'Product' ||
    value === 'Backtest' ||
    value === 'News' ||
    value === 'Ledger' ||
    value === 'Settings'
    ? value
    : 'Overview';
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [moreOpen, setMoreOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioResponse>();
  const [positions, setPositions] = useState<Array<PositionResponse | ManualPositionResponse>>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [universe, setUniverse] = useState<UniverseProduct[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResponse>();
  const [backtest, setBacktest] = useState<Awaited<ReturnType<typeof getBacktest>>>();
  const [settings, setSettings] = useState<SettingsType>();
  const [newsSummary, setNewsSummary] = useState<NewsSummaryResponse>();
  const [globalNews, setGlobalNews] = useState<NewsArticle[]>([]);
  const [productNews, setProductNews] = useState<NewsArticle[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get('product') ?? '',
  );

  const load = async () => {
    const [
      nextHealth,
      nextPortfolio,
      nextPositions,
      nextSignals,
      nextScan,
      nextSettings,
      nextNewsSummary,
      nextNews,
      nextLedger,
      nextUniverse,
    ] = await Promise.all([
      getHealth(),
      getPortfolio(),
      getPositions(),
      getSignals(),
      getScan(),
      getSettings(),
      getNewsSummary(),
      getNews(),
      getLedger(),
      getUniverse(),
    ]);
    setHealth(nextHealth);
    setPortfolio(nextPortfolio);
    setPositions(nextPositions);
    setSignals(nextSignals);
    setScan(nextScan);
    setSelected((current) =>
      current && nextScan.some((row) => row.productId === current)
        ? current
        : (nextScan[0]?.productId ?? current),
    );
    setSettings(nextSettings);
    setNewsSummary(nextNewsSummary);
    setGlobalNews(nextNews);
    setLedger(nextLedger);
    setUniverse(nextUniverse);
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (page === 'Product' && selected) {
      void Promise.all([getAnalysis(selected), getNews(selected, 10)]).then(
        ([nextAnalysis, nextNews]) => {
          setAnalysis({ ...nextAnalysis, news: nextAnalysis.news });
          setProductNews(nextNews);
        },
      );
    }
    if (page === 'Backtest') {
      void getBacktest().then(setBacktest);
    }
  }, [page, selected]);

  const navigateProduct = (productId: string) => {
    setSelected(productId);
    setPage('Product');
  };
  const heartbeat = health?.heartbeat;
  const heartbeatAge = heartbeat ? Math.max(0, Date.now() - heartbeat.finishedAt) : Infinity;
  const heartbeatClass =
    !heartbeat || !heartbeat.ok
      ? 'stale'
      : heartbeatAge < heartbeat.intervalMinutes * 2 * 60 * 1000
        ? 'fresh'
        : heartbeatAge < heartbeat.intervalMinutes * 4 * 60 * 1000
          ? 'aging'
          : 'stale';
  const marketHealthy = health?.marketRegime === 'bullish';
  const mood = newsSummary?.fearGreed
    ? `${newsSummary.fearGreed.classification} ${newsSummary.fearGreed.value}`
    : '—';
  const updatedLabel = heartbeat
    ? `Updated ${Math.max(0, Math.floor(heartbeatAge / 60000))} min ago`
    : 'Updated —';
  const showPage = (nextPage: Page) => {
    setPage(nextPage);
    setMoreOpen(false);
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="pulse" /> COINBASE <b>SIGNALS</b>
        </div>
        <nav>
          <button
            className={page === 'Overview' ? 'active' : ''}
            onClick={() => showPage('Overview')}
          >
            Home
          </button>
          <button className={page === 'Ledger' ? 'active' : ''} onClick={() => showPage('Ledger')}>
            My Portfolio
          </button>
          <button
            className={page === 'Scanner' ? 'active' : ''}
            onClick={() => showPage('Scanner')}
          >
            Coins
          </button>
          <button className={page === 'News' ? 'active' : ''} onClick={() => showPage('News')}>
            News
          </button>
          <button className="more-button" onClick={() => setMoreOpen(!moreOpen)}>
            More ▾
          </button>
          {moreOpen && (
            <div className="more-menu">
              <button onClick={() => showPage('Settings')}>Settings</button>
              <button onClick={() => showPage('Backtest')}>History test</button>
            </div>
          )}
        </nav>
        <div className={`status-line ${heartbeatClass}`} title={heartbeat?.errors.join(' · ')}>
          <span className="status-dot" />
          {updatedLabel} · Market:{' '}
          {marketHealthy ? 'Healthy' : health?.marketRegime === 'bearish' ? 'Weak' : 'Unknown'} ·{' '}
          {mood}
        </div>
      </header>
      {health && health.errors.length > 0 && (
        <div className="warning">
          Data warning:{' '}
          {health.errors.map((error) => `${error.productId}: ${error.message}`).join(' · ')}
        </div>
      )}
      <main className="page">
        {page === 'Overview' && (
          <PageErrorBoundary page="Overview">
            {portfolio && (
              <Overview
                portfolio={portfolio}
                positions={positions}
                signals={signals}
                scan={scan}
                universe={universe}
                news={globalNews}
                newsSummary={newsSummary}
                marketRegime={health?.marketRegime ?? 'unknown'}
                mode={settings?.mode}
                onSelect={navigateProduct}
                onPortfolio={() => setPage('Ledger')}
                onCoins={() => showPage('Scanner')}
              />
            )}
          </PageErrorBoundary>
        )}
        {page === 'Scanner' && (
          <PageErrorBoundary page="Scanner">
            <Scanner rows={scan} positions={positions} onSelect={navigateProduct} />
          </PageErrorBoundary>
        )}
        {page === 'Product' && (
          <PageErrorBoundary page="Product">
            <Product
              id={selected}
              analysis={analysis}
              news={productNews}
              newsEnabled={settings?.newsEnabled}
              onLogTrade={() => setPage('Ledger')}
            />
          </PageErrorBoundary>
        )}
        {page === 'Backtest' && (
          <PageErrorBoundary page="Backtest">
            <Backtest report={backtest} />
          </PageErrorBoundary>
        )}
        {page === 'News' && (
          <PageErrorBoundary page="News">
            <News summary={newsSummary} articles={globalNews} onSelect={navigateProduct} />
          </PageErrorBoundary>
        )}
        {page === 'Ledger' && (
          <PageErrorBoundary page="Ledger">
            <Ledger
              entries={ledger}
              portfolio={portfolio?.manual}
              product={selected}
              onSelect={navigateProduct}
            />
          </PageErrorBoundary>
        )}
        {page === 'Settings' && (
          <PageErrorBoundary page="Settings">
            {settings && (
              <Settings
                settings={settings}
                staticMode={staticMode}
                onSave={async (next) => {
                  const saved = await putSettings(next);
                  setSettings(saved);
                }}
                onReset={async () => {
                  const saved = await resetPaper();
                  setSettings(saved);
                  await load();
                }}
              />
            )}
          </PageErrorBoundary>
        )}
      </main>
      <footer>
        <div>
          Signals are educational only — not financial advice. Past performance does not guarantee
          future results.
        </div>
        <div>Powered by Deaven AI</div>
      </footer>
    </div>
  );
}
