import type { Regime, Signal } from '../../core/types';
import type {
  ManualPositionResponse,
  NewsArticle,
  NewsSummaryResponse,
  PortfolioResponse,
  PositionResponse,
  ScanRow,
} from '../../shared/api';
import { EquityChart } from '../components/EquityChart';
import { SignalsTable } from '../components/SignalsTable';
import { formatPrice } from '../format';

interface OverviewProps {
  portfolio: PortfolioResponse;
  positions: Array<PositionResponse | ManualPositionResponse>;
  signals: Signal[];
  scan: ScanRow[];
  news: NewsArticle[];
  newsSummary?: NewsSummaryResponse;
  marketRegime: Regime;
  mode?: 'paper' | 'manual';
  onSelect: (productId: string) => void;
  onPortfolio: () => void;
}

function heldIds(positions: Array<PositionResponse | ManualPositionResponse>): Set<string> {
  return new Set(
    positions
      .filter((position) => 'quantity' in position || position.status === 'open')
      .map((position) => position.productId),
  );
}

function recommendation(row: ScanRow, held: boolean, marketRegime: Regime) {
  if (held && (row.regime === 'bearish' || !row.trendUp || row.status === 'blocked_by_news')) {
    return {
      word: 'SELL',
      className: 'sell',
      reason:
        row.status === 'blocked_by_news'
          ? `News is bad for ${row.productId} — consider selling`
          : 'You hold this and the trend has turned down — consider selling',
    };
  }
  if (!held && row.status === 'signal' && row.regime !== 'bearish' && marketRegime !== 'bearish') {
    return {
      word: 'BUY',
      className: 'buy',
      reason: row.trendUp
        ? 'Uptrend and it just dipped — a good entry'
        : 'A strong setup is forming',
    };
  }
  return {
    word: 'WAIT',
    className: 'muted',
    reason:
      marketRegime === 'bearish'
        ? 'Market is weak right now — better to wait'
        : row.status === 'blocked_by_news'
          ? 'Recent bad news means it is safer to wait'
          : 'No clear signal yet — keep watching',
  };
}

function strength(score: number) {
  if (score >= 75) return 'Strong';
  if (score >= 50) return 'OK';
  return 'Weak';
}

export function Overview({
  portfolio,
  positions,
  signals,
  scan,
  news,
  newsSummary,
  marketRegime,
  mode = 'paper',
  onSelect,
  onPortfolio,
}: OverviewProps) {
  const held = heldIds(positions);
  const watchlist = [...scan]
    .sort((left, right) => right.score - left.score)
    .filter((row, index, rows) => index < 8 || held.has(row.productId) || rows.length <= 8);
  const manual = mode === 'manual' ? portfolio.manual : undefined;
  const holdingsValue =
    manual?.holdings.reduce((sum, holding) => sum + holding.marketValue, 0) ?? portfolio.unrealized;
  const gain = portfolio.realized + portfolio.unrealized;
  const fearGreed = newsSummary?.fearGreed;

  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">HOME</p>
          <h1>What to do now</h1>
          <p className="muted">Simple guidance from the latest market data.</p>
        </div>
      </div>
      <section className="action-grid">
        {watchlist.map((row) => {
          const action = recommendation(row, held.has(row.productId), marketRegime);
          return (
            <button
              className="action-card"
              key={row.productId}
              onClick={() => onSelect(row.productId)}
            >
              <div className="action-top">
                <span className={`action-word ${action.className}`}>{action.word}</span>
                <span className="coin">{row.productId}</span>
                <strong>${formatPrice(row.price)}</strong>
              </div>
              <p>{action.reason}</p>
              <div className="strength-label">
                <span>Signal strength</span>
                <b>{strength(row.score)}</b>
              </div>
              <div className="strength-bar">
                <i style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
              </div>
            </button>
          );
        })}
        {!watchlist.length && <div className="panel muted">Waiting for coin data…</div>}
      </section>

      <section className="panel money-panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">YOUR MONEY</p>
            <h2>Total value</h2>
          </div>
          <div className="settings-actions">
            <button className="primary" onClick={onPortfolio}>
              Add money
            </button>
            <button className="primary" onClick={onPortfolio}>
              Log a trade
            </button>
          </div>
        </div>
        <div className="cards">
          {[
            ['Cash', manual?.cash ?? portfolio.equity - portfolio.unrealized],
            ['Coins value', holdingsValue],
            ['Total', portfolio.equity],
            ['Gain/loss since start', gain],
          ].map(([label, value]) => (
            <div className="metric" key={String(label)}>
              <small>
                {label}{' '}
                <span className="info" title="This is calculated from your latest saved data.">
                  ⓘ
                </span>
              </small>
              <strong
                className={
                  label === 'Gain/loss since start' ? (Number(value) >= 0 ? 'buy' : 'sell') : ''
                }
              >
                ${Number(value).toFixed(2)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel mood-panel">
        <p className="eyebrow">MARKET MOOD</p>
        <div className="mood-summary">
          <div>
            <h2>
              {fearGreed?.classification ?? 'Unknown'} {fearGreed ? fearGreed.value : ''}
            </h2>
            <p className="muted">
              Fear &amp; Greed shows whether people are feeling worried or confident.
            </p>
          </div>
          <strong className={marketRegime === 'bearish' ? 'sell' : 'buy'}>
            {marketRegime === 'bearish'
              ? 'Weak'
              : marketRegime === 'bullish'
                ? 'Healthy'
                : 'Unknown'}
          </strong>
        </div>
        <div className="headline-list">
          {news.slice(0, 3).map((article) => (
            <a href={article.link} target="_blank" rel="noreferrer" key={article.id}>
              {article.title}
            </a>
          ))}
          {!news.length && <span className="muted">No recent headlines.</span>}
        </div>
      </section>

      <section className="panel">
        <h2>Value over time</h2>
        <EquityChart points={portfolio.curve} />
      </section>
      <section className="panel">
        <h2>Recent calls</h2>
        <SignalsTable rows={signals} onSelect={onSelect} />
      </section>
    </>
  );
}
