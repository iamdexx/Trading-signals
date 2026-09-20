import type { ScoreBreakdown as Breakdown } from '../../core/types';

export function ScoreBreakdown({
  score,
  newsEnabled,
}: {
  score: Breakdown;
  newsEnabled?: boolean;
}) {
  const technicalOnly = newsEnabled === false || score.trend === 25 || score.pullback === 25;
  const entries = [
    ['Trend', score.trend, technicalOnly ? 25 : 22],
    ['Pullback', score.pullback, technicalOnly ? 25 : 22],
    ['Momentum', score.momentum, technicalOnly ? 15 : 14],
    ['Volume', score.volume, technicalOnly ? 15 : 14],
    ['ADX', score.adx, technicalOnly ? 10 : 9],
    ['Regime', score.regime, technicalOnly ? 10 : 9],
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
            {Number(value).toFixed(1)}/{max}
          </b>
        </div>
      ))}
    </div>
  );
}
