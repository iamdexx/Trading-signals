import { useMemo, useState } from 'react';
import type { NewsArticle, NewsSummaryResponse } from '../../shared/api';

function age(timestamp: number): string {
  const hours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  return hours < 1 ? 'under 1h' : `${Math.floor(hours)}h ago`;
}

function sentimentLabel(score: number): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  return score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL';
}

export function News({
  summary,
  articles,
  onSelect,
}: {
  summary?: NewsSummaryResponse;
  articles: NewsArticle[];
  onSelect: (productId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(
    () => (filter ? articles.filter((article) => article.assets.includes(filter)) : articles),
    [articles, filter],
  );
  const latestFearGreed = summary?.fearGreed;
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">NEWS</p>
          <h1>Good news, bad news, and everything between</h1>
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">All coins</option>
          {[...new Set(articles.flatMap((article) => article.assets))].map((asset) => (
            <option value={asset} key={asset}>
              {asset}
            </option>
          ))}
        </select>
      </div>
      <section className="cards">
        <div className="metric panel sentiment-card">
          <small>MARKET MOOD</small>
          <strong className={summary && summary.marketSentiment >= 0 ? 'buy' : 'sell'}>
            {summary ? summary.marketSentiment.toFixed(0) : '—'}
          </strong>
          <span className="muted">A simple view of recent headlines and Fear &amp; Greed.</span>
        </div>
        <div className="metric panel">
          <small>FEAR &amp; GREED</small>
          <strong>{latestFearGreed?.value ?? '—'}</strong>
          <span className="muted">{latestFearGreed?.classification ?? 'Loading'}</span>
          <div className="fear-gauge">
            <i style={{ width: `${latestFearGreed?.value ?? 0}%` }} />
          </div>
        </div>
        <div className="metric panel">
          <small>7-DAY TREND</small>
          <div className="fg-trend">
            {(summary?.fearGreedHistory ?? [])
              .slice(0, 7)
              .reverse()
              .map((point) => (
                <i
                  key={point.timestamp}
                  title={`${point.value} · ${point.classification}`}
                  style={{ height: `${Math.max(8, point.value)}%` }}
                />
              ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Coins people are talking about</h2>
        <div className="chip-list">
          {(summary?.trending ?? []).map((asset) => (
            <button
              className="asset-chip"
              key={asset.productId}
              onClick={() => onSelect(asset.productId)}
            >
              {asset.symbol} <span>{asset.name}</span>
            </button>
          ))}
          {!summary?.trending.length && (
            <span className="muted">No trending assets available.</span>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>Latest headlines</h2>
          <span className="muted">{filtered.length} articles</span>
        </div>
        <div className="news-feed">
          {filtered.map((article) => (
            <article className="news-item" key={article.id}>
              <div className="news-meta">
                <span>{article.source}</span>
                <span>{age(article.published)}</span>
                <span
                  className={
                    sentimentLabel(article.sentiment) === 'POSITIVE'
                      ? 'buy'
                      : sentimentLabel(article.sentiment) === 'NEGATIVE'
                        ? 'sell'
                        : 'muted'
                  }
                >
                  {sentimentLabel(article.sentiment) === 'POSITIVE'
                    ? 'GOOD NEWS'
                    : sentimentLabel(article.sentiment) === 'NEGATIVE'
                      ? 'BAD NEWS'
                      : 'NEUTRAL'}
                </span>
              </div>
              <a href={article.link} target="_blank" rel="noreferrer">
                {article.title}
              </a>
              <p>{article.summary}</p>
              <div className="chip-list">
                {article.catalysts.map((catalyst) => (
                  <span className="tag" key={catalyst}>
                    {catalyst}
                  </span>
                ))}
                {article.assets.map((asset) => (
                  <button className="asset-chip" key={asset} onClick={() => onSelect(asset)}>
                    {asset}
                  </button>
                ))}
              </div>
            </article>
          ))}
          {!filtered.length && <span className="muted">Waiting for live headlines…</span>}
        </div>
      </section>
    </>
  );
}
