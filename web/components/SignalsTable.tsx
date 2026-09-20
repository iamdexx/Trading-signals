import type { Signal } from '../../core/types';
import { formatPrice } from '../format';

export function SignalsTable({ rows }: { rows: Signal[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>TIME</th>
            <th>PRODUCT</th>
            <th>SIDE</th>
            <th>PRICE</th>
            <th>REASON</th>
            <th>SCORE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.productId}-${row.time}-${index}`}>
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
