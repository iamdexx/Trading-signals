import type { AnalysisResponse } from '../../shared/api';
import { CandleChart } from '../components/CandleChart';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { SignalsTable } from '../components/SignalsTable';

export function Product({ id, analysis }: { id: string; analysis?: AnalysisResponse }) {
  if (!analysis) return <section className="panel">Loading {id}…</section>;
  const latest = analysis.candles.at(-2);
  const index = analysis.candles.length - 2;
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">PRODUCT DETAIL</p>
          <h1>{id}</h1>
          <span className="muted">
            Last bar closed {latest ? new Date(latest.time * 1000).toLocaleString() : '—'}
          </span>
        </div>
        <span className={`tag ${analysis.regime}`}>{analysis.regime} regime</span>
      </div>
      <section className="panel">
        <CandleChart
          candles={analysis.candles}
          overlays={{
            ema20: analysis.indicators.ema20,
            ema50: analysis.indicators.ema50,
            ema200: analysis.indicators.ema200,
          }}
        />
      </section>
      <section className="cards">
        {[
          ['RSI', analysis.indicators.rsi[index]],
          ['MACD HIST', analysis.indicators.macd[index]],
          ['ADX', analysis.indicators.adx[index]],
          ['ATR %', analysis.indicators.atrPct[index]],
        ].map(([label, value]) => (
          <div className="metric panel" key={String(label)}>
            <small>{label}</small>
            <strong>{Number(value).toFixed(3)}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Score breakdown · {analysis.score.total}/100</h2>
        <ScoreBreakdown score={analysis.score} />
      </section>
      <section className="panel">
        <h2>Signals</h2>
        <SignalsTable rows={analysis.signals} />
      </section>
      <section className="panel">
        <h2>Backtest · {analysis.backtest.trades.length} trades</h2>
        <div className="cards">
          <div className="metric">
            <small>WIN RATE</small>
            <strong>{(analysis.backtest.winRate * 100).toFixed(1)}%</strong>
          </div>
          <div className="metric">
            <small>PROFIT FACTOR</small>
            <strong>{analysis.backtest.profitFactor.toFixed(2)}</strong>
          </div>
          <div className="metric">
            <small>MAX DRAWDOWN</small>
            <strong>{analysis.backtest.maxDrawdownPct.toFixed(2)}%</strong>
          </div>
        </div>
      </section>
    </>
  );
}
