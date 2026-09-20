import type {
  AssetNewsSummary,
  Catalyst,
  FearGreedPoint,
  NewsArticle,
  ScoreBreakdown,
} from './types.js';

const positiveWords: Record<string, number> = {
  approve: 1.2,
  approved: 1.4,
  adoption: 1.1,
  bullish: 1.2,
  gains: 0.8,
  grant: 0.9,
  granted: 0.9,
  grants: 0.9,
  growth: 0.9,
  launch: 0.6,
  list: 1.1,
  listed: 1.1,
  listing: 1.2,
  partnership: 1.3,
  rally: 1.1,
  recover: 0.8,
  surge: 1.3,
  upgrade: 1.0,
  win: 1.1,
};

const negativeWords: Record<string, number> = {
  bankruptcy: -1.8,
  crash: -1.4,
  delist: -1.4,
  exploit: -2,
  exploited: -2,
  fraud: -1.8,
  hack: -2,
  hacked: -2,
  lawsuit: -1.2,
  liquidation: -1.5,
  loss: -0.8,
  negative: -0.7,
  scam: -1.8,
  selloff: -1.2,
  unlock: -0.5,
  weak: -0.7,
};

const intensifiers: Record<string, number> = {
  extremely: 1.5,
  sharply: 1.4,
  strongly: 1.4,
  very: 1.3,
};

const negations = new Set(['no', 'not', 'never', 'without', "isn't", "wasn't", "won't"]);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

export function scoreSentiment(text: string): number {
  const words = tokens(text);
  let total = 0;
  let matched = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const value = positiveWords[word] ?? negativeWords[word];
    if (value === undefined) {
      continue;
    }
    let adjusted = value;
    const previous = words.slice(Math.max(0, index - 3), index);
    if (previous.some((item) => negations.has(item))) {
      adjusted *= -1;
    }
    const intensifier = previous.at(-1);
    if (intensifier && intensifiers[intensifier]) {
      adjusted *= intensifiers[intensifier];
    }
    total += adjusted;
    matched += 1;
  }
  if (
    /\b(sec|regulator|regulatory)\b.*\b(drop|drops|dropped|dismiss|dismissed|settle|settled|win|wins)\b.*\blawsuit\b/i.test(
      text,
    )
  ) {
    total += 2;
    matched += 1;
  }
  return matched ? Math.max(-1, Math.min(1, total / Math.max(1, matched * 1.5))) : 0;
}

export function classifyCatalysts(text: string): Catalyst[] {
  const lower = text.toLowerCase();
  const catalysts = new Set<Catalyst>();
  if (/\b(list|lists|listed|listing|launch(?:es|ed)?)\b/.test(lower)) {
    catalysts.add('listing');
  }
  if (/\b(delist|delists|delisted|delisting)\b/.test(lower)) {
    catalysts.add('delisting');
  }
  if (/\b(upgrade|upgraded|upgrade(?:s|d)?)\b/.test(lower)) {
    catalysts.add('upgrade');
  }
  if (/\b(partnership|partnered|collaboration|integrat(?:es|ed|ion))\b/.test(lower)) {
    catalysts.add('partnership');
  }
  if (/\betfs?\b|\bspot fund\b|\bexchange[- ]traded fund\b/.test(lower)) {
    catalysts.add('etf');
  }
  if (/\b(sec|regulation|regulator|regulatory|lawsuit|sued|court)\b/.test(lower)) {
    if (
      /\b(sec|regulator|regulatory)\b/.test(lower) &&
      /\b(approve|approves|approved|grant|grants|granted|clear|clears|cleared|drop|drops|dropped|dismiss|dismissed|settle|settled|win|wins)\b/.test(
        lower,
      )
    ) {
      catalysts.add('regulation_positive');
    } else if (/\blawsuit|sued|court\b/.test(lower)) {
      catalysts.add('lawsuit');
      catalysts.add('regulation_negative');
    } else {
      catalysts.add('regulation_negative');
    }
  }
  if (/\b(hack|hacked|exploit|exploited|breach|stolen)\b/.test(lower)) {
    catalysts.add('hack');
  }
  if (/\blawsuit|sued|litigation\b/.test(lower) && !catalysts.has('regulation_positive')) {
    catalysts.add('lawsuit');
  }
  if (/\b(unlock|unlocked|token release)\b/.test(lower)) {
    catalysts.add('unlock');
  }
  if (
    /\b(fed|rates?|cpi|inflation|etf|sec|regulation|hack|exploit|bankruptcy|delist|listing)\b/.test(
      lower,
    )
  ) {
    catalysts.add('macro');
  }
  return [...catalysts];
}

export function tagAssets(
  text: string,
  assets: Array<{ productId: string; symbol: string; name?: string }>,
): string[] {
  const tagged = new Set<string>();
  const lower = text.toLowerCase();
  const ambiguous = new Set(['SUI', 'ENA', 'NEAR', 'PUMP', 'USELESS', 'LIGHTER']);
  for (const asset of assets) {
    const symbol = asset.symbol.toUpperCase();
    const symbolPattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const fullName = asset.name?.trim();
    const namePattern = fullName
      ? new RegExp(`\\b${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      : undefined;
    const symbolMatch = ambiguous.has(symbol) ? symbolPattern.test(text) : symbolPattern.test(text);
    if (symbolMatch || namePattern?.test(lower)) {
      tagged.add(asset.productId);
    }
  }
  return [...tagged];
}

export function sourceWeight(source: string): number {
  return (
    {
      coindesk: 1,
      cointelegraph: 0.9,
      theblock: 1,
      decrypt: 0.85,
      newsbtc: 0.75,
      cryptoslate: 0.8,
    }[source.toLowerCase()] ?? 0.7
  );
}

export function assetNewsScore(
  articles: NewsArticle[],
  productId: string,
  now = Date.now(),
): AssetNewsSummary {
  const cutoff = now - 72 * 60 * 60 * 1000;
  const matching = articles.filter(
    (article) => article.published >= cutoff && article.assets.includes(productId),
  );
  let weighted = 0;
  let weights = 0;
  const catalystSet = new Set<Catalyst>();
  for (const article of matching) {
    const decay = 2 ** (-(now - article.published) / (24 * 60 * 60 * 1000));
    const weight = decay * sourceWeight(article.source);
    weighted += article.sentiment * weight;
    weights += weight;
    article.catalysts.forEach((catalyst) => catalystSet.add(catalyst));
  }
  return {
    productId,
    score: weights ? Math.max(-100, Math.min(100, (weighted / weights) * 100)) : 0,
    count: matching.length,
    catalysts: [...catalystSet],
  };
}

export function marketNewsScore(articles: NewsArticle[], now = Date.now()): number {
  const cutoff = now - 72 * 60 * 60 * 1000;
  const marketArticles = articles.filter(
    (article) =>
      (article.assets.length === 0 || article.catalysts.includes('macro')) &&
      article.published >= cutoff,
  );
  let weighted = 0;
  let weights = 0;
  for (const article of marketArticles) {
    const decay = 2 ** (-(now - article.published) / (24 * 60 * 60 * 1000));
    const weight = decay * sourceWeight(article.source);
    weighted += article.sentiment * weight;
    weights += weight;
  }
  return weights ? Math.max(-100, Math.min(100, (weighted / weights) * 100)) : 0;
}

export function newsScoreComponent(score: number): number {
  return Math.max(0, Math.min(10, ((score + 100) / 200) * 10));
}

export function fearGreedSentiment(point?: FearGreedPoint): number {
  return point ? (point.value - 50) * 2 : 0;
}

export function newsBreakdown(
  newsScore: number,
  base: Omit<ScoreBreakdown, 'news'>,
): ScoreBreakdown {
  const news = newsScoreComponent(newsScore);
  return { ...base, news, total: base.total + news };
}
