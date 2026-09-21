import type { ManualPositionResponse, PositionResponse } from '../../shared/api';
import { formatPrice } from '../format';

export function PositionsTable({
  rows,
  onSelect,
}: {
  rows: Array<PositionResponse | ManualPositionResponse>;
  onSelect?: (productId: string) => void;
}) {
  const manual = rows.length > 0 && 'quantity' in rows[0];
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>COIN</th>
            <th>{manual ? 'QTY' : 'ENTRY PRICE'}</th>
            <th>PRICE NOW</th>
            <th>{manual ? 'AVERAGE COST' : 'SAFETY EXIT PRICE'}</th>
            <th>{manual ? 'COINS VALUE' : 'PROFIT TARGET'}</th>
            <th>OPEN GAIN/LOSS</th>
            <th>{manual ? 'WHAT TO DO' : 'RESULT'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={'quantity' in row ? row.productId : row.id}
              onClick={() => onSelect?.(row.productId)}
            >
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
    </div>
  );
}
