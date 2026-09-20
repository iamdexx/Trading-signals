import type { Regime, Signal } from '../../core/types';
import type { PortfolioResponse, PositionResponse } from '../../shared/api';
import { EquityChart } from '../components/EquityChart';
import { PositionsTable } from '../components/PositionsTable';
import { SignalsTable } from '../components/SignalsTable';

interface OverviewProps {
  portfolio: PortfolioResponse;
  positions: PositionResponse[];
  signals: Signal[];
  marketRegime: Regime;
}

export function Overview({ portfolio, positions, signals, marketRegime }: OverviewProps) {
  return (
    <>
      <div className="hero">
        <div>
          <p className="eyebrow">PORTFOLIO OVERVIEW</p>
          <h1>${portfolio.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h1>
          <span className="positive">● paper equity · closed-bar evaluation</span>
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
        <PositionsTable rows={positions.filter((position) => position.status === 'open')} />
      </section>
      <section className="panel">
        <h2>Closed positions</h2>
        <PositionsTable rows={positions.filter((position) => position.status === 'closed')} />
      </section>
      <section className="panel">
        <h2>Recent signals</h2>
        <SignalsTable rows={signals} />
      </section>
    </>
  );
}
