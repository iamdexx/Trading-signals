import type { AnalysisResponse, NewsArticle } from '../../shared/api';
import { CandleChart } from '../components/CandleChart';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { SignalsTable } from '../components/SignalsTable';

function sentimentLabel(score: number): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  return score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL';
}

function number(value: unknown, digits: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function Product({
  id,
  analysis,
  news,
  newsEnabled,
  onLogTrade,
}: {
  id: string;
  analysis?: AnalysisResponse;
  news: NewsArticle[];
  newsEnabled?: boolean;
  onLogTrade?: () => void;
}) {
  if (!analysis) return <section className="panel">Loading {id}…</section>;
  const latest = analysis.candles.at(-2);
  const index = analysis.candles.length - 2;
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">COIN DETAIL</p>
          <h1>{id}</h1>
          <span className="muted">
            Last bar closed {latest ? new Date(latest.time * 1000).toLocaleString() : '—'}
          </span>
        </div>
        <span className={`tag ${analysis.regime}`}>
          Market trend:{' '}
          {analysis.regime === 'bullish'
            ? 'Healthy'
            : analysis.regime === 'bearish'
              ? 'Weak'
              : 'Unknown'}
        </span>
        <button className="primary" onClick={onLogTrade}>
          Log trade
        </button>
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
          ['Momentum (RSI)', analysis.indicators.rsi[index]],
          ['Momentum (MACD)', analysis.indicators.macd[index]],
          ['Trend strength (ADX)', analysis.indicators.adx[index]],
          ['Volatility (ATR)', analysis.indicators.atrPct[index]],
        ].map(([label, value]) => (
          <div className="metric panel" key={String(label)}>
            <small>{label}</small>
            <strong>{Number(value).toFixed(3)}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Why this recommendation · {number(analysis.score.total, 1)}/100</h2>
        <ScoreBreakdown score={analysis.score} newsEnabled={newsEnabled} />
      </section>
      <section className="panel">
        <h2>News about this coin · {number(analysis.news.score, 1)}</h2>
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
                  {number(article.sentiment * 100, 0)}
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
        <h2>Recent calls</h2>
        <SignalsTable rows={analysis.signals} />
      </section>
      <section className="panel">
        <h2>History test · {analysis.backtest.trades.length} trades</h2>
        <div className="cards">
          <div className="metric">
            <small>WIN RATE</small>
            <strong>{number(analysis.backtest.winRate * 100, 1)}%</strong>
          </div>
          <div className="metric">
            <small>PROFIT FACTOR</small>
            <strong>{number(analysis.backtest.profitFactor, 2)}</strong>
          </div>
          <div className="metric">
            <small>BIGGEST DIP</small>
            <strong>{number(analysis.backtest.maxDrawdownPct, 2)}%</strong>
          </div>
        </div>
      </section>
    </>
  );
}
