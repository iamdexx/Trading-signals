import type { ScoreBreakdown as Breakdown } from '../../core/types';

export function ScoreBreakdown({ score }: { score: Breakdown }) {
  const entries = [
    ['Trend', score.trend, 22],
    ['Pullback', score.pullback, 22],
    ['Momentum', score.momentum, 14],
    ['Volume', score.volume, 14],
    ['ADX', score.adx, 9],
    ['Regime', score.regime, 9],
    ['News', score.news, 10],
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
