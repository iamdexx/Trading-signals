import type { AnalysisResponse, NewsArticle } from '../../shared/api';
import { CandleChart } from '../components/CandleChart';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { SignalsTable } from '../components/SignalsTable';

function sentimentLabel(score: number): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  return score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL';
}

export function Product({
  id,
  analysis,
  news,
  newsEnabled,
}: {
  id: string;
  analysis?: AnalysisResponse;
  news: NewsArticle[];
  newsEnabled?: boolean;
}) {
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
        <h2>Score breakdown · {analysis.score.total.toFixed(1)}/100</h2>
        <ScoreBreakdown score={analysis.score} newsEnabled={newsEnabled} />
      </section>
      <section className="panel">
        <h2>Asset news · {analysis.news.score.toFixed(1)}</h2>
        <div className="news-feed">
          {news.slice(0, 10).map((article) => (
            <article className="news-item" key={article.id}>
              <div className="news-meta">
                <span>{article.source}</span>
                <span>{new Date(article.published).toLocaleString()}</span>
                <span
                  className={
                    sentimentLabel(article.sentiment) === 'POSITIVE'
                      ? 'buy'
                      : sentimentLabel(article.sentiment) === 'NEGATIVE'
                        ? 'sell'
                        : 'muted'
                  }
                >
                  {sentimentLabel(article.sentiment) === 'POSITIVE' ? '+' : ''}
                  {(article.sentiment * 100).toFixed(0)}
                  {' · '}
                  {sentimentLabel(article.sentiment)}
                </span>
              </div>
              <a href={article.link} target="_blank" rel="noreferrer">
                {article.title}
              </a>
              <div className="chip-list">
                {article.catalysts.map((catalyst) => (
                  <span className="tag" key={catalyst}>
                    {catalyst}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {!news.length && <span className="muted">No recent asset headlines.</span>}
        </div>
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
