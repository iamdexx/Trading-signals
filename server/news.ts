import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import {
  assetNewsScore,
  classifyCatalysts,
  marketNewsScore,
  scoreSentiment,
  tagAssets,
} from '../core/sentiment.js';
import type { AssetNewsSummary, FearGreedPoint, NewsArticle } from '../core/types.js';
import { fearGreedHistory, newsArticles, saveFearGreed, saveNewsArticle } from './db.js';
import type { UniverseProduct } from '../shared/api.js';

const RSS_FEEDS = [
  ['coindesk', 'https://www.coindesk.com/arc/outboundfeeds/rss'],
  ['cointelegraph', 'https://cointelegraph.com/rss'],
  ['theblock', 'https://www.theblock.co/rss.xml'],
  ['decrypt', 'https://decrypt.co/feed'],
  ['newsbtc', 'https://www.newsbtc.com/feed/'],
  ['cryptoslate', 'https://cryptoslate.com/feed/'],
] as const;
const USER_AGENT = 'Coinbase-Signals/1.0 (+https://github.com/iamdexx/Trading-signals)';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });

interface TrendingAsset {
  productId: string;
  symbol: string;
  name: string;
  score: number;
}

interface NewsState {
  fearGreed?: FearGreedPoint;
  trending: TrendingAsset[];
}

let state: NewsState = { trending: [] };

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '__cdata' in value) {
    return String((value as { __cdata: unknown }).__cdata ?? '');
  }
  return '';
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function first(value: unknown): string {
  if (Array.isArray(value)) return first(value[0]);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const candidate = value as { '#text'?: unknown; '@_href'?: unknown };
    return String(candidate['#text'] ?? candidate['@_href'] ?? '');
  }
  return '';
}

function parseFeed(
  source: string,
  xml: string,
  now: number,
): Array<{
  title: string;
  summary: string;
  link: string;
  published: number;
}> {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };
  const items = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  return (Array.isArray(items) ? items : [items]).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const title = stripHtml(first(row.title));
    const summary = stripHtml(first(row.description ?? row.summary ?? row.content));
    const link = first(row.link ?? row.guid);
    const published = Date.parse(first(row.pubDate ?? row.published ?? row.updated ?? row.date));
    if (!title || !link || !Number.isFinite(published)) return [];
    if (published > now + 60 * 60 * 1000 || now - published > MAX_AGE_MS) return [];
    return [{ title, summary, link, published }];
  });
}

async function fetchText(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function articleId(link: string): string {
  return createHash('sha256').update(link).digest('hex');
}

async function fetchFearGreed(): Promise<FearGreedPoint[]> {
  const payload = JSON.parse(await fetchText('https://api.alternative.me/fng/?limit=30')) as {
    data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>;
  };
  return (payload.data ?? []).flatMap((point) => {
    const value = Number(point.value);
    const timestamp = Number(point.timestamp) * 1000;
    return Number.isFinite(value) && Number.isFinite(timestamp)
      ? [{ value, classification: point.value_classification ?? 'Unknown', timestamp }]
      : [];
  });
}

async function fetchTrending(products: UniverseProduct[]): Promise<{
  assets: TrendingAsset[];
  names: Map<string, string>;
}> {
  const [trendingText, marketsText] = await Promise.all([
    fetchText('https://api.coingecko.com/api/v3/search/trending'),
    fetchText('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1'),
  ]);
  const trending = JSON.parse(trendingText) as {
    coins?: Array<{ item?: { id?: string; symbol?: string; name?: string; score?: number } }>;
  };
  const markets = JSON.parse(marketsText) as Array<{
    symbol?: string;
    name?: string;
    total_volume?: number;
    market_cap?: number;
    price_change_percentage_24h?: number;
  }>;
  const bySymbol = new Map(markets.map((item) => [item.symbol?.toUpperCase(), item]));
  const names = new Map(
    markets.flatMap((item) =>
      item.symbol && item.name ? [[item.symbol.toUpperCase(), item.name] as const] : [],
    ),
  );
  return {
    assets: (trending.coins ?? []).flatMap((entry, index) => {
      const item = entry.item;
      if (!item?.symbol) return [];
      const match = products.find(
        (product) => product.base_name.toUpperCase() === item.symbol?.toUpperCase(),
      );
      if (!match) return [];
      const market = bySymbol.get(item.symbol.toUpperCase());
      return [
        {
          productId: match.product_id,
          symbol: item.symbol.toUpperCase(),
          name: market?.name ?? item.name ?? match.base_name,
          score: item.score ?? index,
        },
      ];
    }),
    names,
  };
}

export async function syncNews(products: UniverseProduct[]): Promise<NewsState> {
  const now = Date.now();
  let geckoNames = new Map<string, string>();
  try {
    const gecko = await fetchTrending(products);
    state.trending = gecko.assets;
    geckoNames = gecko.names;
  } catch {
    state.trending = [];
  }
  const assetDefinitions = products.map((product) => ({
    productId: product.product_id,
    symbol: product.base_name,
    name: geckoNames.get(product.base_name.toUpperCase()) ?? product.base_name,
  }));
  const feeds = await Promise.allSettled(
    RSS_FEEDS.map(
      async ([source, url]) => [source, parseFeed(source, await fetchText(url), now)] as const,
    ),
  );
  for (const result of feeds) {
    if (result.status !== 'fulfilled') continue;
    const [source, items] = result.value;
    for (const item of items) {
      const combined = `${item.title} ${item.summary}`;
      saveNewsArticle({
        id: articleId(item.link),
        source,
        title: item.title,
        summary: item.summary,
        link: item.link,
        published: item.published,
        sentiment: scoreSentiment(combined),
        catalysts: classifyCatalysts(combined),
        assets: tagAssets(combined, assetDefinitions),
      });
    }
  }
  try {
    const points = await fetchFearGreed();
    saveFearGreed(points);
    state.fearGreed = points[0];
  } catch {
    state.fearGreed = fearGreedHistory(1)[0];
  }
  return state;
}

export function currentNewsState(): NewsState {
  return { fearGreed: state.fearGreed ?? fearGreedHistory(1)[0], trending: state.trending };
}

export function productNews(productId: string, limit = 10): NewsArticle[] {
  return newsArticles(productId, limit);
}

export function allNews(limit = 100): NewsArticle[] {
  return newsArticles(undefined, limit);
}

export function newsSummary(products: UniverseProduct[]): {
  marketSentiment: number;
  fearGreed?: FearGreedPoint;
  fearGreedHistory: FearGreedPoint[];
  topPositive: AssetNewsSummary[];
  topNegative: AssetNewsSummary[];
  trending: TrendingAsset[];
} {
  const articles = allNews(500);
  const summaries = products.map((product) => assetNewsScore(articles, product.product_id));
  const fearGreed = currentNewsState().fearGreed;
  return {
    marketSentiment: Math.max(
      -100,
      Math.min(100, (marketNewsScore(articles) + (fearGreed ? fearGreed.value - 50 : 0)) / 2),
    ),
    fearGreed,
    fearGreedHistory: fearGreedHistory(30),
    topPositive: summaries
      .filter((summary) => summary.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5),
    topNegative: summaries
      .filter((summary) => summary.score < 0)
      .sort((left, right) => left.score - right.score)
      .slice(0, 5),
    trending: currentNewsState().trending,
  };
}
