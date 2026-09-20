import type { Candle } from '../core/types.js';

const API = 'https://api.coinbase.com/api/v3/brokerage/market';
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface Product {
  product_id: string;
  price: string;
  volume_24h: string;
  price_percentage_change_24h: string;
  base_name: string;
  quote_currency_id: string;
  status: string;
  trading_disabled: boolean;
}

interface CandleResponse {
  candles: Array<{
    start: string;
    low: string;
    high: string;
    open: string;
    close: string;
    volume: string;
  }>;
}

async function request<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as T;
      }
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Coinbase returned ${response.status}`);
      }
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }
    await wait(300 * 2 ** attempt);
  }
  throw new Error('Coinbase request failed after retries');
}

export async function products(): Promise<Product[]> {
  const response = await request<{ products: Product[] }>(`${API}/products?product_type=SPOT`);
  const stable = /^(USDT|USDC|DAI|PYUSD|EURC|TUSD|USDP|GUSD|FDUSD|USD)$/i;
  return response.products.filter(
    (product) =>
      product.quote_currency_id === 'USD' &&
      product.product_id.endsWith('-USD') &&
      product.status === 'online' &&
      !product.trading_disabled &&
      !stable.test(product.base_name) &&
      Math.abs(Number(product.price) - 1) > 0.02,
  );
}

function intervalFor(granularity: string): number {
  if (granularity === 'ONE_DAY') {
    return 86400;
  }
  if (granularity === 'FOUR_HOUR') {
    return 14400;
  }
  return 3600;
}

function parseCandles(response: CandleResponse): Candle[] {
  return response.candles.map((candle) => ({
    time: Number(candle.start),
    low: Number(candle.low),
    high: Number(candle.high),
    open: Number(candle.open),
    close: Number(candle.close),
    volume: Number(candle.volume),
  }));
}

export async function candles(
  product: string,
  granularity: string,
  count: number,
  latestCached = 0,
  existingCount = 0,
): Promise<Candle[]> {
  const interval = intervalFor(granularity);
  const now = Math.floor(Date.now() / 1000);
  const result: Candle[] = [];
  const incremental = latestCached > 0 && existingCount >= count;
  let end = now - (now % interval);

  while (result.length < count) {
    const start = incremental
      ? Math.max(latestCached + interval, end - interval * 349)
      : Math.max(0, end - interval * 349);
    if (start >= end) {
      break;
    }
    const response = await request<CandleResponse>(
      `${API}/products/${encodeURIComponent(
        product,
      )}/candles?start=${start}&end=${end}&granularity=${granularity}`,
    );
    const page = parseCandles(response);
    if (!page.length) {
      break;
    }
    result.push(...page);
    end = start - interval;
    await wait(150);
    if (incremental) {
      break;
    }
  }

  return [...new Map(result.map((candle) => [candle.time, candle])).values()]
    .sort((left, right) => left.time - right.time)
    .slice(-count);
}
