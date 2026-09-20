import { useEffect, useState } from 'react';
import type { Signal } from '../core/types';
import type {
  AnalysisResponse,
  HealthResponse,
  PortfolioResponse,
  PositionResponse,
  ScanRow,
  Settings as SettingsType,
} from '../shared/api';
import {
  getAnalysis,
  getBacktest,
  getHealth,
  getPortfolio,
  getPositions,
  getScan,
  getSettings,
  getSignals,
  putSettings,
  resetPaper,
} from './api';
import { Backtest } from './pages/Backtest';
import { Overview } from './pages/Overview';
import { Product } from './pages/Product';
import { Scanner } from './pages/Scanner';
import { Settings } from './pages/Settings';
import { PageErrorBoundary } from './components/PageErrorBoundary';

type Page = 'Overview' | 'Scanner' | 'Product' | 'Backtest' | 'Settings';

function initialPage(): Page {
  const value = new URLSearchParams(window.location.search).get('page');
  return value === 'Scanner' || value === 'Product' || value === 'Backtest' || value === 'Settings'
    ? value
    : 'Overview';
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [health, setHealth] = useState<HealthResponse>();
  const [portfolio, setPortfolio] = useState<PortfolioResponse>();
  const [positions, setPositions] = useState<PositionResponse[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResponse>();
  const [backtest, setBacktest] = useState<Awaited<ReturnType<typeof getBacktest>>>();
  const [settings, setSettings] = useState<SettingsType>();
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get('product') ?? '',
  );

  const load = async () => {
    const [nextHealth, nextPortfolio, nextPositions, nextSignals, nextScan, nextSettings] =
      await Promise.all([
        getHealth(),
        getPortfolio(),
        getPositions(),
        getSignals(),
        getScan(),
        getSettings(),
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
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (page === 'Product' && selected) {
      void getAnalysis(selected).then(setAnalysis);
    }
    if (page === 'Backtest') {
      void getBacktest().then(setBacktest);
    }
  }, [page, selected]);

  const navigateProduct = (productId: string) => {
    setSelected(productId);
    setPage('Product');
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="pulse" /> COINBASE <b>SIGNALS</b>
        </div>
        <nav>
          {(['Overview', 'Scanner', 'Product', 'Backtest', 'Settings'] as Page[]).map((item) => (
            <button
              className={page === item ? 'active' : ''}
              key={item}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <span className="live">● PAPER MODE · {settings?.timeframe ?? '—'}</span>
        <span className={`market-badge ${health?.marketRegime ?? 'unknown'}`}>
          MARKET:{' '}
          {health?.marketRegime === 'bullish'
            ? 'BULLISH'
            : health?.marketRegime === 'bearish'
              ? 'BEARISH — standing aside, no long setups'
              : 'UNKNOWN'}
        </span>
      </header>
      {health && health.errors.length > 0 && (
        <div className="warning">
          Data warning:{' '}
          {health.errors.map((error) => `${error.productId}: ${error.message}`).join(' · ')}
        </div>
      )}
      <main>
        {page === 'Overview' && (
          <PageErrorBoundary page="Overview">
            {portfolio && (
              <Overview
                portfolio={portfolio}
                positions={positions}
                signals={signals}
                marketRegime={health?.marketRegime ?? 'unknown'}
              />
            )}
          </PageErrorBoundary>
        )}
        {page === 'Scanner' && (
          <PageErrorBoundary page="Scanner">
            <Scanner rows={scan} onSelect={navigateProduct} />
          </PageErrorBoundary>
        )}
        {page === 'Product' && (
          <PageErrorBoundary page="Product">
            <Product id={selected} analysis={analysis} />
          </PageErrorBoundary>
        )}
        {page === 'Backtest' && (
          <PageErrorBoundary page="Backtest">
            <Backtest report={backtest} />
          </PageErrorBoundary>
        )}
        {page === 'Settings' && (
          <PageErrorBoundary page="Settings">
            {settings && (
              <Settings
                settings={settings}
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
