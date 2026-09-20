import type { ManualPositionResponse, PositionResponse } from '../../shared/api';
import { formatPrice } from '../format';

export function PositionsTable({
  rows,
}: {
  rows: Array<PositionResponse | ManualPositionResponse>;
}) {
  const manual = rows.length > 0 && 'quantity' in rows[0];
  return (
    <table>
      <thead>
        <tr>
          <th>PRODUCT</th>
          <th>{manual ? 'QTY' : 'ENTRY'}</th>
          <th>CURRENT</th>
          <th>{manual ? 'AVG COST' : 'STOP'}</th>
          <th>{manual ? 'VALUE' : 'TARGET'}</th>
          <th>UNREALIZED</th>
          <th>{manual ? 'SIGNAL' : 'R'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={'quantity' in row ? row.productId : row.id}>
            <td className="coin">{row.productId}</td>
            {'quantity' in row ? (
              <>
                <td>{row.quantity.toFixed(8)}</td>
                <td>${formatPrice(row.currentPrice)}</td>
                <td>${formatPrice(row.avgCost)}</td>
                <td>${row.marketValue.toFixed(2)}</td>
              </>
            ) : (
              <>
                <td>${formatPrice(row.entryPrice)}</td>
                <td>${formatPrice(row.currentPrice)}</td>
                <td>${formatPrice(row.stop)}</td>
                <td>${formatPrice(row.target)}</td>
              </>
            )}
            <td
              className={
                ('quantity' in row ? row.unrealizedPnl : row.unrealized) >= 0 ? 'buy' : 'sell'
              }
            >
              ${('quantity' in row ? row.unrealizedPnl : row.unrealized).toFixed(2)} (
              {('quantity' in row ? row.unrealizedPct : row.unrealizedPct).toFixed(2)}%)
            </td>
            <td>
              {'quantity' in row
                ? row.signal
                  ? `${row.signal.status} · ${row.signal.score.toFixed(1)}`
                  : '—'
                : `${row.rMultiple.toFixed(2)}R`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
