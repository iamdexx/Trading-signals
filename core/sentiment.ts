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
  approval: 1.3,
  adoption: 1.1,
  'adopt*': 1.1,
  accumulate: 0.9,
  ath: 1.2,
  beat: 0.9,
  beats: 1,
  breakthrough: 1.2,
  bullish: 1.2,
  buyback: 1,
  'clear*': 1.1,
  climb: 0.8,
  confidence: 0.7,
  confirmed: 0.8,
  'expand*': 0.9,
  funding: 0.9,
  gains: 0.8,
  grant: 0.9,
  granted: 0.9,
  grants: 0.9,
  growth: 0.9,
  high: 0.7,
  'inflow*': 1,
  'integrat*': 0.9,
  institutional: 1,
  jump: 0.8,
  launch: 0.6,
  list: 1.1,
  listed: 1.1,
  listing: 1.2,
  mainnet: 1,
  milestone: 1,
  'outperform*': 1,
  partnership: 1.3,
  rally: 1.1,
  record: 0.9,
  'recover*': 0.8,
  'rise*': 0.8,
  'secure*': 0.9,
  soar: 1.2,
  spike: 1,
  strength: 0.7,
  success: 0.8,
  surge: 1.3,
  upgrade: 1.0,
  win: 1.1,
  strong: 0.9,
  support: 0.6,
  tokenization: 0.8,
  grows: 0.8,
  holding: 0.5,
  integration: 0.9,
  'jump*': 0.8,
  liquidity: 0.5,
  optimize: 0.6,
  positive: 0.7,
  raised: 0.9,
  raises: 0.9,
  rebound: 0.9,
  recovery: 0.8,
  scale: 0.7,
  secures: 1,
  outperform: 1,
  upgraded: 1,
  bullishness: 1,
  breakout: 1.1,
};

const negativeWords: Record<string, number> = {
  'ban*': -1.3,
  bearish: -1.2,
  bankruptcy: -1.8,
  charged: -1.2,
  crash: -1.4,
  disastrous: -1.5,
  default: -1.5,
  'delay*': -0.9,
  denied: -1.2,
  delist: -1.4,
  downgrade: -1.1,
  'drain*': -1.6,
  exploit: -2,
  exploited: -2,
  fear: -0.8,
  'fine*': -1,
  freeze: -1.2,
  fraud: -1.8,
  hack: -2,
  hacked: -2,
  'halt*': -1.2,
  insolvent: -1.8,
  lawsuit: -1.2,
  liquidation: -1.5,
  loss: -0.8,
  negative: -0.7,
  'outflow*': -1,
  'plunge*': -1.3,
  postpone: -0.9,
  'reject*': -1.2,
  risk: -0.7,
  rug: -1.8,
  scam: -1.8,
  sell: -0.5,
  'sell-off': -1.2,
  selloff: -1.2,
  slump: -1.1,
  'tumble*': -1,
  unlock: -0.5,
  warning: -0.8,
  weak: -0.7,
  'withdraw*': -1,
  collapse: -1.5,
  concern: -0.7,
  crackdown: -1.1,
  decline: -0.8,
  exploitative: -1.4,
  exposure: -0.5,
  failed: -1.1,
  failure: -1.1,
  frozen: -1.2,
  losses: -1,
  manipulation: -1.2,
  outflows: -1,
  penalty: -1,
  probe: -1,
  recession: -1,
  reject: -1.2,
  rejected: -1.2,
  shutdown: -1.3,
  stolen: -1.7,
  suspect: -0.7,
  threat: -0.8,
  uncertainty: -0.7,
  vulnerability: -1.2,
  bankrupt: -1.8,
  'exploit*': -2,
  'hack*': -2,
  postponed: -0.9,
  withdrawal: -1,
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

function lexiconValue(word: string): number | undefined {
  const exact = positiveWords[word] ?? negativeWords[word];
  if (exact !== undefined) return exact;
  const stem = Object.keys(positiveWords)
    .concat(Object.keys(negativeWords))
    .find((candidate) => candidate.endsWith('*') && word.startsWith(candidate.slice(0, -1)));
  return stem ? (positiveWords[stem] ?? negativeWords[stem]) : undefined;
}

export function scoreSentiment(text: string): number {
  const words = tokens(text);
  let total = 0;
  let matched = 0;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const value = lexiconValue(word);
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
  if (!matched) return 0;
  const score = Math.max(-1, Math.min(1, total / Math.max(1, matched * 1.5)));
  return Math.abs(score) < 0.15 ? 0 : score;
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
