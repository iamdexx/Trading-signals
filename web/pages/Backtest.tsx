import type { BacktestReport } from '../../core/types';
import { EquityChart } from '../components/EquityChart';

function metric(value: unknown, digits: number, suffix = ''): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}${suffix}` : '—';
}

export function Backtest({ report }: { report?: BacktestReport }) {
  if (!report) return <section className="panel">Loading backtest…</section>;
  const firstTime = report.equityCurve[0]?.time ?? 0;
  const lastTime = report.equityCurve.at(-1)?.time ?? firstTime;
  const sampleDays = Math.max(0, (lastTime - firstTime) / 86400);
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">HISTORY TEST</p>
          <h1>How this approach did in the past</h1>
        </div>
        <span className="tag">A guide, not a promise</span>
      </div>
      <section className="cards">
        {[
          ['TRADES', report.trades.length],
          ['WIN RATE', metric(report.winRate * 100, 1, '%')],
          ['PROFIT FACTOR', metric(report.profitFactor, 2)],
          ['EXPECTANCY (R)', metric(report.expectancyR, 3)],
          ['BIGGEST DIP', metric(report.maxDrawdownPct, 2, '%')],
          ['SHARPE', metric(report.sharpe, 2)],
        ].map(([label, value]) => (
          <div className="metric panel" key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Total value over time</h2>
        <p className="muted">
          Over the last {sampleDays.toFixed(0)} days this approach made {report.trades.length}{' '}
          trades and would have turned $10,000 into ${metric(report.equityCurve.at(-1)?.equity, 0)}.
          Biggest dip {metric(report.maxDrawdownPct, 1, '%')}. Small sample — don&apos;t rely on it.
        </p>
        <p className="muted">
          Sample: {sampleDays.toFixed(1)} days, market bullish{' '}
          {metric(report.regimeCoverage, 1, '%')} of bars
        </p>
        <EquityChart points={report.equityCurve} />
      </section>
      <section className="panel">
        <h2>Coin-by-coin details</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>COIN</th>
                <th>TRADES</th>
                <th>WIN RATE</th>
                <th>PROFIT FACTOR</th>
                <th>EXPECTANCY R</th>
                <th>NET P&amp;L $</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.perProduct ?? {}).map(([product, item]) => (
                <tr key={product}>
                  <td className="coin">{product}</td>
                  <td>{item.trades.length}</td>
                  <td>{metric(item.winRate * 100, 1, '%')}</td>
                  <td>{metric(item.profitFactor, 2)}</td>
                  <td>{metric(item.expectancyR, 3)}</td>
                  <td>${metric(item.netPnl, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
