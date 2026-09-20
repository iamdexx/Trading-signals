import type { Signal } from '../../core/types';
import { formatPrice } from '../format';

export function SignalsTable({
  rows,
  onSelect,
}: {
  rows: Signal[];
  onSelect?: (productId: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>WHEN</th>
            <th>COIN</th>
            <th>CALL</th>
            <th>PRICE</th>
            <th>WHY</th>
            <th>STRENGTH</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${row.productId}-${row.time}-${index}`}
              onClick={() => onSelect?.(row.productId)}
            >
              <td>{new Date(row.time * 1000).toLocaleString()}</td>
              <td className="coin">{row.productId}</td>
              <td className={row.side === 'BUY' ? 'buy' : 'sell'}>{row.side}</td>
              <td>${formatPrice(row.price)}</td>
              <td>{row.reason}</td>
              <td>{row.score?.toFixed(0) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
