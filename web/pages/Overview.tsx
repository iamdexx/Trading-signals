import type { Regime, Signal } from '../../core/types';
import type {
  ManualPositionResponse,
  NewsArticle,
  NewsSummaryResponse,
  PortfolioResponse,
  PositionResponse,
  ScanRow,
  UniverseProduct,
} from '../../shared/api';
import { EquityChart } from '../components/EquityChart';
import { SignalsTable } from '../components/SignalsTable';
import { formatPrice } from '../format';

interface OverviewProps {
  portfolio: PortfolioResponse;
  positions: Array<PositionResponse | ManualPositionResponse>;
  signals: Signal[];
  scan: ScanRow[];
  universe: UniverseProduct[];
  news: NewsArticle[];
  newsSummary?: NewsSummaryResponse;
  marketRegime: Regime;
  mode?: 'paper' | 'manual';
  onSelect: (productId: string) => void;
  onPortfolio: () => void;
  onCoins: () => void;
}

function heldIds(positions: Array<PositionResponse | ManualPositionResponse>): Set<string> {
  return new Set(
    positions
      .filter((position) => 'quantity' in position || position.status === 'open')
      .map((position) => position.productId),
  );
}

function recommendation(
  row: ScanRow,
  held: boolean,
  marketRegime: Regime,
  position?: PositionResponse | ManualPositionResponse,
) {
  if (held && (row.regime === 'bearish' || !row.trendUp)) {
    return {
      word: 'SELL',
      className: 'sell',
      reason:
        position && 'stop' in position && row.price <= position.stop
          ? 'Fell below the safety exit price — consider selling'
          : 'Trend turned down — consider selling',
    };
  }
  if (held) {
    return {
      word: 'WAIT',
      className: 'muted',
      reason: 'You own this — trend still healthy, hold',
    };
  }
  const strong = row.score >= 75;
  const blockedReason = row.catalysts[0]
    ? `Bad news for this coin (${row.catalysts[0]}) — stay away`
    : 'Bad news for this coin — stay away';
  let reason: string | undefined;
  if (row.blockedByNews) reason = blockedReason;
  else if (row.status === 'insufficient_history') reason = 'Too new to judge';
  else if (row.marketRegime === 'bearish')
    reason = 'Whole market is weak right now — better to wait';
  else if (!row.trendUp) reason = 'Not in an uptrend yet';
  else if (row.components.pullback <= 0) reason = 'Price is stretched — wait for a dip';
  else if (row.status === 'setup') reason = 'Dipped — waiting for the bounce to confirm';
  else if (row.components.volume <= 0) reason = 'Trading activity is low';
  else if (row.components.adx <= 0) reason = 'Trend is too weak to trust';
  if (!held && row.status === 'signal' && row.regime !== 'bearish' && marketRegime !== 'bearish') {
    return {
      word: 'BUY',
      className: 'buy',
      reason: row.trendUp
        ? 'Uptrend, healthy dip and a confirmed bounce — good entry'
        : 'Uptrend, healthy dip and a confirmed bounce — good entry',
    };
  }
  return {
    word: 'WAIT',
    className: 'muted',
    reason: reason
      ? strong
        ? `Almost there — ${reason}`
        : reason
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
  universe,
  news,
  newsSummary,
  marketRegime,
  mode = 'paper',
  onSelect,
  onPortfolio,
  onCoins,
}: OverviewProps) {
  const held = heldIds(positions);
  const watchlist = [...scan]
    .sort((left, right) => right.score - left.score)
    .filter((row, index, rows) => index < 6 || held.has(row.productId) || rows.length <= 6);
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
          const position = positions.find((item) => item.productId === row.productId);
          const action = recommendation(row, held.has(row.productId), marketRegime, position);
          return (
            <button
              className="action-card"
              key={row.productId}
              onClick={() => onSelect(row.productId)}
            >
              <div className="action-first">
                <span className={`action-word ${action.className}`}>{action.word}</span>
                <strong>${formatPrice(row.price)}</strong>
              </div>
              <div className="coin-name">
                {universe.find((product) => product.product_id === row.productId)?.base_name ??
                  row.productId.replace(/-USD$/, '')}{' '}
                · {row.productId.replace(/-USD$/, '')}
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
      {scan.length > watchlist.length && (
        <button className="see-all" onClick={onCoins}>
          See all coins
        </button>
      )}

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
