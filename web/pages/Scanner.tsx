import { useMemo, useState } from 'react';
import type { ScanRow } from '../../shared/api';
import { formatPrice } from '../format';

export function Scanner({
  rows,
  onSelect,
}: {
  rows: ScanRow[];
  onSelect: (productId: string) => void;
}) {
  const [descending, setDescending] = useState(true);
  const sorted = useMemo(
    () =>
      [...rows].sort((left, right) =>
        descending ? right.score - left.score : left.score - right.score,
      ),
    [descending, rows],
  );
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">MARKET SCANNER</p>
          <h1>
            Universe <span className="muted">{rows.length} assets</span>
          </h1>
        </div>
        <button className="tag button" onClick={() => setDescending(!descending)}>
          SCORE {descending ? '↓' : '↑'}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>PRODUCT</th>
            <th>PRICE</th>
            <th>USD VOLUME</th>
            <th>24H %</th>
            <th>REGIME</th>
            <th>SCORE</th>
            <th>RSI</th>
            <th>ADX</th>
            <th>ATR %</th>
            <th>NEWS</th>
            <th>TREND</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr onClick={() => onSelect(row.productId)} key={row.productId}>
              <td className="coin">{row.productId}</td>
              <td>${formatPrice(row.price)}</td>
              <td>${row.volume24Usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className={row.change24hPct >= 0 ? 'buy' : 'sell'}>
                {row.change24hPct.toFixed(2)}%
              </td>
              <td>
                <span className={`badge ${row.regime}`}>{row.regime}</span>
              </td>
              <td>{row.score}</td>
              <td>{Number.isFinite(row.rsi) ? row.rsi.toFixed(2) : '—'}</td>
              <td>{Number.isFinite(row.adx) ? row.adx.toFixed(2) : '—'}</td>
              <td>{Number.isFinite(row.atrPct) ? `${row.atrPct.toFixed(2)}%` : '—'}</td>
              <td>
                <span className={`tag ${row.newsScore >= 0 ? 'bullish' : 'bearish'}`}>
                  {row.newsScore.toFixed(0)}
                </span>
                {row.newsCount > 0 && <small className="muted"> · {row.newsCount}</small>}
              </td>
              <td>{row.trendUp ? 'UP' : '—'}</td>
              <td>
                <span className={`status ${row.status}`}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
