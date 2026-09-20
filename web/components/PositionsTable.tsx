import type { PositionResponse } from '../../shared/api';
import { formatPrice } from '../format';

export function PositionsTable({ rows }: { rows: PositionResponse[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>PRODUCT</th>
          <th>ENTRY</th>
          <th>CURRENT</th>
          <th>STOP</th>
          <th>TARGET</th>
          <th>UNREALIZED</th>
          <th>R</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="coin">{row.productId}</td>
            <td>${formatPrice(row.entryPrice)}</td>
            <td>${formatPrice(row.currentPrice)}</td>
            <td>${formatPrice(row.stop)}</td>
            <td>${formatPrice(row.target)}</td>
            <td className={row.unrealized >= 0 ? 'buy' : 'sell'}>
              ${row.unrealized.toFixed(2)} ({row.unrealizedPct.toFixed(2)}%)
            </td>
            <td>{row.rMultiple.toFixed(2)}R</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
