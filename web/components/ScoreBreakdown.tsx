import type { ScoreBreakdown as Breakdown } from '../../core/types';

export function ScoreBreakdown({ score }: { score: Breakdown }) {
  const entries = [
    ['Trend', score.trend, 25],
    ['Pullback', score.pullback, 25],
    ['Momentum', score.momentum, 15],
    ['Volume', score.volume, 15],
    ['ADX', score.adx, 10],
    ['Regime', score.regime, 10],
  ];
  return (
    <div className="score-list">
      {entries.map(([label, value, max]) => (
        <div className="score-row" key={label}>
          <span>{label}</span>
          <div className="score-bar">
            <i style={{ width: `${(Number(value) / Number(max)) * 100}%` }} />
          </div>
          <b>
            {value}/{max}
          </b>
        </div>
      ))}
    </div>
  );
}
