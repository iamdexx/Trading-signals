import type { Regime, Signal } from '../../core/types';
import type { ManualPositionResponse, PortfolioResponse, PositionResponse } from '../../shared/api';
import { EquityChart } from '../components/EquityChart';
import { PositionsTable } from '../components/PositionsTable';
import { SignalsTable } from '../components/SignalsTable';

interface OverviewProps {
  portfolio: PortfolioResponse;
  positions: Array<PositionResponse | ManualPositionResponse>;
  signals: Signal[];
  marketRegime: Regime;
  mode?: 'paper' | 'manual';
}

export function Overview({
  portfolio,
  positions,
  signals,
  marketRegime,
  mode = 'paper',
}: OverviewProps) {
  const manual = mode === 'manual' ? portfolio.manual : undefined;
  const paperPositions = positions.filter(
    (position): position is PositionResponse => 'status' in position,
  );
  return (
    <>
      <div className="hero">
        <div>
          <p className="eyebrow">PORTFOLIO OVERVIEW</p>
          <h1>${portfolio.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h1>
          <span className="positive">
            ● {mode === 'manual' ? 'manual portfolio' : 'paper equity'} · closed-bar evaluation
          </span>
        </div>
        <div className="metric">
          <small>REALIZED P&amp;L</small>
          <strong>${portfolio.realized.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <small>UNREALIZED P&amp;L</small>
          <strong>${portfolio.unrealized.toFixed(2)}</strong>
        </div>
        <div className="metric">
          <small>DRAWDOWN</small>
          <strong>{portfolio.drawdown.toFixed(2)}%</strong>
        </div>
      </div>
      {manual && (
        <section className="cards">
          {[
            ['CASH', manual.cash],
            ['HOLDINGS', manual.holdings.reduce((sum, holding) => sum + holding.marketValue, 0)],
            ['FEES PAID', manual.feesPaid],
            ['DEPOSITED', manual.deposits],
          ].map(([label, value]) => (
            <div className="metric panel" key={String(label)}>
              <small>{label}</small>
              <strong>${Number(value).toFixed(2)}</strong>
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        {marketRegime === 'bearish' && (
          <p className="warning">
            The BTC market regime is bearish, so this long-only strategy is standing aside and
            opening no new long setups.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Equity curve</h2>
        <EquityChart points={portfolio.curve} />
      </section>
      <section className="panel">
        <h2>Open positions</h2>
        <PositionsTable
          rows={
            mode === 'manual'
              ? (positions as ManualPositionResponse[])
              : paperPositions.filter((position) => position.status === 'open')
          }
        />
      </section>
      <section className="panel">
        {mode !== 'manual' && (
          <>
            <h2>Closed positions</h2>
            <PositionsTable
              rows={paperPositions.filter((position) => position.status === 'closed')}
            />
          </>
        )}
      </section>
      <section className="panel">
        <h2>Recent signals</h2>
        <SignalsTable rows={signals} />
      </section>
    </>
  );
}
