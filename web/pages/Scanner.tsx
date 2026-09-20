import { useMemo, useState } from 'react';
import type { ManualPositionResponse, PositionResponse, ScanRow } from '../../shared/api';
import { formatPrice } from '../format';

function whatToDo(row: ScanRow, held: boolean): { label: string; className: string } {
  if (held && (row.regime === 'bearish' || !row.trendUp || row.status === 'blocked_by_news')) {
    return { label: 'SELL', className: 'sell' };
  }
  if (!held && row.status === 'signal' && row.regime !== 'bearish') {
    return { label: 'BUY', className: 'buy' };
  }
  return { label: 'WAIT', className: 'muted' };
}

function strength(score: number) {
  return score >= 75 ? 'Strong' : score >= 50 ? 'OK' : 'Weak';
}

export function Scanner({
  rows,
  positions,
  onSelect,
}: {
  rows: ScanRow[];
  positions: Array<PositionResponse | ManualPositionResponse>;
  onSelect: (productId: string) => void;
}) {
  const [details, setDetails] = useState(false);
  const held = useMemo(
    () =>
      new Set(
        positions
          .filter((position) => 'quantity' in position || position.status === 'open')
          .map((position) => position.productId),
      ),
    [positions],
  );
  const sorted = useMemo(() => [...rows].sort((left, right) => right.score - left.score), [rows]);
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">COINS</p>
          <h1>
            Coins <span className="muted">{rows.length} to watch</span>
          </h1>
          <p className="muted">Tap a coin to see its chart and plain-English details.</p>
        </div>
        <button className="tag button" onClick={() => setDetails(!details)}>
          {details ? 'Hide details' : 'Show details'}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>COIN</th>
              <th>PRICE</th>
              <th>WHAT TO DO</th>
              <th>STRENGTH</th>
              <th>TREND</th>
              <th>24H CHANGE</th>
              {details && (
                <>
                  <th>TRADING ACTIVITY</th>
                  <th>NEWS</th>
                  <th>STATUS</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const action = whatToDo(row, held.has(row.productId));
              return (
                <tr onClick={() => onSelect(row.productId)} key={row.productId}>
                  <td className="coin">{row.productId}</td>
                  <td>${formatPrice(row.price)}</td>
                  <td className={action.className}>{action.label}</td>
                  <td>
                    <span className="strength-inline">
                      <i style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
                    </span>{' '}
                    {strength(row.score)}
                  </td>
                  <td>{row.trendUp ? 'Uptrend' : 'Downtrend'}</td>
                  <td className={row.change24hPct >= 0 ? 'buy' : 'sell'}>
                    {row.change24hPct.toFixed(2)}%
                  </td>
                  {details && (
                    <>
                      <td>
                        {row.volume24Usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className={row.newsScore >= 0 ? 'buy' : 'sell'}>
                        {row.newsScore.toFixed(1)}
                      </td>
                      <td>{row.status}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
