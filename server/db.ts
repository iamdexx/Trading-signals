import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { exitLegPnl } from '../core/pnl.js';
import type { Candle, Catalyst, FearGreedPoint, NewsArticle, Signal } from '../core/types.js';
import type { PositionResponse, Settings, UniverseProduct } from '../shared/api.js';

fs.mkdirSync(path.resolve('data'), { recursive: true });
export const db = new Database(path.resolve('data/signals.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS candles (
    product TEXT NOT NULL,
    tf TEXT NOT NULL,
    time INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (product, tf, time)
  );
  CREATE TABLE IF NOT EXISTS universe (
    product TEXT PRIMARY KEY,
    price REAL NOT NULL,
    volume24 REAL NOT NULL DEFAULT 0,
    volume24_base REAL NOT NULL,
    volume24_usd REAL NOT NULL,
    change24 REAL NOT NULL DEFAULT 0,
    base TEXT NOT NULL,
    history_status TEXT NOT NULL DEFAULT 'ready',
    updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product TEXT NOT NULL,
    time INTEGER NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    reason TEXT NOT NULL,
    score REAL,
    components TEXT NOT NULL,
    UNIQUE(product, time, side, reason)
  );
  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product TEXT NOT NULL,
    entry_time INTEGER NOT NULL,
    exit_time INTEGER,
    entry REAL NOT NULL,
    entry_fill REAL NOT NULL DEFAULT 0,
    entry_fee REAL NOT NULL DEFAULT 0,
    current REAL NOT NULL,
    qty REAL NOT NULL,
    remaining_qty REAL NOT NULL,
    stop REAL NOT NULL,
    target REAL NOT NULL,
    initial_risk REAL NOT NULL,
    atr_entry REAL NOT NULL,
    highest_high REAL NOT NULL,
    partial INTEGER NOT NULL DEFAULT 0,
    realized REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    reason TEXT
  );
  CREATE TABLE IF NOT EXISTS equity (
    time INTEGER PRIMARY KEY,
    value REAL NOT NULL,
    realized REAL NOT NULL,
    unrealized REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_errors (
    product TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS processed_bars (
    product TEXT PRIMARY KEY,
    time INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    link TEXT NOT NULL,
    published INTEGER NOT NULL,
    sentiment REAL NOT NULL,
    catalysts TEXT NOT NULL,
    assets TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS news_published_idx ON news(published DESC);
  CREATE TABLE IF NOT EXISTS fear_greed (
    timestamp INTEGER PRIMARY KEY,
    value INTEGER NOT NULL,
    classification TEXT NOT NULL
  );
`);

try {
  db.exec('ALTER TABLE universe ADD COLUMN change24 REAL NOT NULL DEFAULT 0');
} catch {
  // Existing databases already have the migration.
}
try {
  db.exec('ALTER TABLE universe ADD COLUMN volume24_base REAL NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE universe ADD COLUMN volume24_usd REAL NOT NULL DEFAULT 0');
  db.exec("ALTER TABLE universe ADD COLUMN history_status TEXT NOT NULL DEFAULT 'ready'");
} catch {
  // Existing databases already have the migration.
}
try {
  db.exec('ALTER TABLE positions ADD COLUMN entry_fill REAL NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE positions ADD COLUMN entry_fee REAL NOT NULL DEFAULT 0');
} catch {
  // Existing databases already have the migration.
}

export function saveCandles(product: string, timeframe: string, candles: Candle[]): void {
  const insert = db.prepare('INSERT OR REPLACE INTO candles VALUES (?,?,?,?,?,?,?,?)');
  const transaction = db.transaction((rows: Candle[]) => {
    for (const candle of rows) {
      insert.run(
        product,
        timeframe,
        candle.time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    }
  });
  transaction(candles);
}

export function loadCandles(product: string, timeframe: string): Candle[] {
  return db
    .prepare(
      'SELECT time,open,high,low,close,volume FROM candles WHERE product=? AND tf=? ORDER BY time',
    )
    .all(product, timeframe) as Candle[];
}

export function latestCandleTime(product: string, timeframe: string): number {
  const row = db
    .prepare('SELECT MAX(time) as time FROM candles WHERE product=? AND tf=?')
    .get(product, timeframe) as { time?: number };
  return row.time ?? 0;
}

export function saveUniverse(
  rows: Array<{
    product_id: string;
    price: string;
    volume_24h: string;
    volume24Usd: number;
    price_percentage_change_24h: string;
    base_name: string;
    historyStatus?: UniverseProduct['historyStatus'];
  }>,
): void {
  const statement = db.prepare(
    `INSERT OR REPLACE INTO universe(
      product,price,volume24,volume24_base,volume24_usd,change24,base,history_status,updated
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  db.prepare('DELETE FROM universe').run();
  for (const row of rows) {
    statement.run(
      row.product_id,
      Number(row.price),
      Number(row.volume_24h),
      Number(row.volume_24h),
      row.volume24Usd,
      Number(row.price_percentage_change_24h),
      row.base_name,
      row.historyStatus ?? 'ready',
      Date.now(),
    );
  }
}

export function universe(): UniverseProduct[] {
  return db
    .prepare(
      `SELECT product as product_id,price,volume24_base,volume24_usd,
        change24 as price_percentage_change_24h,base as base_name,history_status as historyStatus
       FROM universe ORDER BY volume24_usd DESC`,
    )
    .all() as UniverseProduct[];
}

export function setProductError(product: string, message: string): void {
  db.prepare('INSERT OR REPLACE INTO product_errors(product,message,updated) VALUES (?,?,?)').run(
    product,
    message,
    Date.now(),
  );
}

export function clearProductError(product: string): void {
  db.prepare('DELETE FROM product_errors WHERE product=?').run(product);
}

export function productErrors(): Array<{ productId: string; message: string }> {
  return db.prepare('SELECT product as productId,message FROM product_errors').all() as Array<{
    productId: string;
    message: string;
  }>;
}

export function saveNewsArticle(article: NewsArticle): void {
  const existing = db
    .prepare('SELECT id FROM news WHERE link=? OR title=? LIMIT 1')
    .get(article.link, article.title) as { id?: string } | undefined;
  if (existing) {
    return;
  }
  db.prepare(
    `INSERT OR IGNORE INTO news(
      id,source,title,summary,link,published,sentiment,catalysts,assets
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    article.id,
    article.source,
    article.title,
    article.summary,
    article.link,
    article.published,
    article.sentiment,
    JSON.stringify(article.catalysts),
    JSON.stringify(article.assets),
  );
}

export function newsArticles(productId?: string, limit = 100): NewsArticle[] {
  const rows = db
    .prepare(
      productId
        ? 'SELECT * FROM news WHERE assets LIKE ? ORDER BY published DESC LIMIT ?'
        : 'SELECT * FROM news ORDER BY published DESC LIMIT ?',
    )
    .all(...(productId ? [`%"${productId}"%`, limit] : [limit])) as Array<{
    id: string;
    source: string;
    title: string;
    summary: string;
    link: string;
    published: number;
    sentiment: number;
    catalysts: string;
    assets: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    title: row.title,
    summary: row.summary,
    link: row.link,
    published: row.published,
    sentiment: row.sentiment,
    catalysts: JSON.parse(row.catalysts) as Catalyst[],
    assets: JSON.parse(row.assets) as string[],
  }));
}

export function blockingArticles(productId: string, sinceMs: number): NewsArticle[] {
  const rows = db
    .prepare('SELECT * FROM news WHERE published >= ? AND assets LIKE ? ORDER BY published DESC')
    .all(sinceMs, `%"${productId}"%`) as Array<{
    id: string;
    source: string;
    title: string;
    summary: string;
    link: string;
    published: number;
    sentiment: number;
    catalysts: string;
    assets: string;
  }>;
  return rows
    .map((row) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      summary: row.summary,
      link: row.link,
      published: row.published,
      sentiment: row.sentiment,
      catalysts: JSON.parse(row.catalysts) as Catalyst[],
      assets: JSON.parse(row.assets) as string[],
    }))
    .filter((article) => isBlockingArticle(article, sinceMs));
}

export function isBlockingArticle(
  article: Pick<NewsArticle, 'published' | 'catalysts'>,
  sinceMs: number,
): boolean {
  const blocking = new Set<Catalyst>(['hack', 'delisting', 'lawsuit']);
  return (
    article.published >= sinceMs && article.catalysts.some((catalyst) => blocking.has(catalyst))
  );
}

export function saveFearGreed(points: FearGreedPoint[]): void {
  const statement = db.prepare(
    'INSERT OR REPLACE INTO fear_greed(timestamp,value,classification) VALUES (?,?,?)',
  );
  const transaction = db.transaction((rows: FearGreedPoint[]) => {
    for (const point of rows) {
      statement.run(point.timestamp, point.value, point.classification);
    }
  });
  transaction(points);
}

export function fearGreedHistory(limit = 30): FearGreedPoint[] {
  return db
    .prepare(
      'SELECT value,classification,timestamp FROM fear_greed ORDER BY timestamp DESC LIMIT ?',
    )
    .all(limit) as FearGreedPoint[];
}

export function insertSignal(signal: {
  productId: string;
  time: number;
  side: string;
  price: number;
  reason: string;
  score?: number;
  components?: unknown;
}): void {
  db.prepare(
    'INSERT OR IGNORE INTO signals(product,time,side,price,reason,score,components) VALUES (?,?,?,?,?,?,?)',
  ).run(
    signal.productId,
    signal.time,
    signal.side,
    signal.price,
    signal.reason,
    signal.score ?? null,
    JSON.stringify(signal.components ?? {}),
  );
}

export function signals(limit = 50): Signal[] {
  const rows = db
    .prepare('SELECT * FROM signals ORDER BY time DESC,id DESC LIMIT ?')
    .all(limit) as Array<{
    product: string;
    time: number;
    side: Signal['side'];
    price: number;
    reason: Signal['reason'];
    score?: number;
    components: string;
  }>;
  return rows.map((row) => ({
    productId: row.product,
    time: row.time,
    side: row.side,
    price: row.price,
    reason: row.reason,
    score: row.score,
    components: JSON.parse(row.components) as Signal['components'],
  }));
}

export function positions(): PositionResponse[] {
  const rows = db
    .prepare(
      `
      SELECT * FROM positions ORDER BY status, entry_time DESC
`,
    )
    .all() as Array<{
    id: number;
    product: string;
    entry_time: number;
    exit_time?: number;
    entry: number;
    entry_fill: number;
    entry_fee: number;
    current: number;
    qty: number;
    remaining_qty: number;
    stop: number;
    target: number;
    initial_risk: number;
    atr_entry: number;
    highest_high: number;
    partial: number;
    realized: number;
    status: 'open' | 'closed';
    reason?: PositionResponse['reason'];
  }>;
  const settings = getSettings();
  const pnlConfig = {
    riskPerTrade: settings.riskPerTrade,
    startingEquity: settings.startingEquity,
    feeBps: settings.feeBps,
    slippageBps: settings.slippageBps,
    stopAtrMult: settings.stopAtrMult,
    targetR: settings.targetR,
    trailAtrMult: settings.trailAtrMult,
    partialEnabled: settings.partialEnabled,
  };
  return rows.map((row) => ({
    id: row.id,
    productId: row.product,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    entryPrice: row.entry,
    entryFill: row.entry_fill || row.entry,
    entryFee: row.entry_fee,
    currentPrice: row.current,
    qty: row.qty,
    remainingQty: row.remaining_qty,
    stop: row.stop,
    target: row.target,
    initialRisk: row.initial_risk,
    atrAtEntry: row.atr_entry,
    highestHigh: row.highest_high,
    partialTaken: Boolean(row.partial),
    realized: row.realized,
    status: row.status,
    reason: row.reason,
    unrealized:
      row.status === 'open'
        ? row.realized +
          exitLegPnl(row.entry_fill || row.entry, row.current, row.remaining_qty, pnlConfig)
        : row.realized,
    unrealizedPct:
      ((row.status === 'open'
        ? row.realized +
          exitLegPnl(row.entry_fill || row.entry, row.current, row.remaining_qty, pnlConfig)
        : row.realized) /
        Math.max((row.entry_fill || row.entry) * row.qty, 0.0000001)) *
      100,
    rMultiple:
      (row.status === 'open'
        ? row.realized +
          exitLegPnl(row.entry_fill || row.entry, row.current, row.remaining_qty, pnlConfig)
        : row.realized) / Math.max(row.initial_risk * row.qty, 0.0000001),
  }));
}

export function openPosition(product: string): Record<string, unknown> | undefined {
  return db
    .prepare("SELECT * FROM positions WHERE product=? AND status='open' LIMIT 1")
    .get(product) as Record<string, unknown> | undefined;
}

export function savePosition(position: Record<string, unknown>): number {
  const result = db
    .prepare(
      `
      INSERT INTO positions(
        product,entry_time,entry,entry_fill,entry_fee,current,qty,remaining_qty,stop,target,
        initial_risk,atr_entry,highest_high,partial,realized,status,reason
      ) VALUES (@productId,@entryTime,@entryPrice,@entryFill,@entryFee,@currentPrice,@qty,@remainingQty,
        @stop,@target,@initialRisk,@atrAtEntry,@highestHigh,@partialTaken,
        @realized,@status,@reason)
    `,
    )
    .run(position);
  return Number(result.lastInsertRowid);
}

export function updatePosition(position: Record<string, unknown>): void {
  db.prepare(
    `
    UPDATE positions SET current=@currentPrice,remaining_qty=@remainingQty,
      stop=@stop,target=@target,highest_high=@highestHigh,partial=@partialTaken,
      realized=@realized,status=@status,exit_time=@exitTime,reason=@reason
    WHERE id=@id
  `,
  ).run(position);
}

export function saveEquity(
  time: number,
  value: number,
  realized: number,
  unrealized: number,
): void {
  db.prepare('INSERT OR REPLACE INTO equity(time,value,realized,unrealized) VALUES (?,?,?,?)').run(
    time,
    value,
    realized,
    unrealized,
  );
}

export function equity(): {
  value: number;
  realized: number;
  unrealized: number;
  time: number;
} {
  return (
    (db.prepare('SELECT * FROM equity ORDER BY time DESC LIMIT 1').get() as {
      value: number;
      realized: number;
      unrealized: number;
      time: number;
    }) ?? { value: 10000, realized: 0, unrealized: 0, time: 0 }
  );
}

const defaultSettings: Settings = {
  startingEquity: Number(process.env.STARTING_EQUITY ?? 10000),
  sizingMode: 'risk_pct',
  riskPerTrade: Number(process.env.RISK_PER_TRADE ?? 0.01),
  fixedUsdPerTrade: 100,
  maxPositions: 5,
  maxNotionalPct: 0.2,
  stopAtrMult: Number(process.env.STOP_ATR_MULT ?? 3),
  targetR: Number(process.env.TARGET_R ?? 1.5),
  trailAtrMult: Number(process.env.TRAIL_ATR_MULT ?? 3),
  partialEnabled: process.env.PARTIAL_ENABLED !== 'false',
  newsEnabled: process.env.NEWS_ENABLED !== 'false',
  newsBlockHours: Number(process.env.NEWS_BLOCK_HOURS ?? 48),
  feeBps: Number(process.env.FEE_BPS ?? 60),
  slippageBps: Number(process.env.SLIPPAGE_BPS ?? 5),
  universeSize: Number(process.env.UNIVERSE_SIZE ?? 30),
  timeframe: process.env.TIMEFRAME ?? 'FOUR_HOUR',
  startDate: Date.now(),
};

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key,value FROM settings').all() as Array<{
    key: keyof Settings;
    value: string;
  }>;
  const settings = { ...defaultSettings };
  for (const row of rows) {
    const defaultValue = settings[row.key];
    settings[row.key] =
      typeof defaultValue === 'number' ? (Number(row.value) as never) : (row.value as never);
    if (typeof defaultValue === 'boolean') {
      settings[row.key] = (row.value === 'true') as never;
    }
  }
  return settings;
}

export function saveSettings(input: Partial<Settings>): Settings {
  const settings = { ...getSettings(), ...input };
  const statement = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)');
  for (const [key, value] of Object.entries(settings)) {
    statement.run(key, String(value));
  }
  return settings;
}

export function processedBar(product: string): number {
  const row = db.prepare('SELECT time FROM processed_bars WHERE product=?').get(product) as
    { time?: number } | undefined;
  return row?.time ?? 0;
}

export function setProcessedBar(product: string, time: number): void {
  db.prepare('INSERT OR REPLACE INTO processed_bars(product,time) VALUES (?,?)').run(product, time);
}

export function resetPaper(): void {
  db.exec(
    'DELETE FROM positions; DELETE FROM signals; DELETE FROM equity; DELETE FROM processed_bars;',
  );
  const settings = getSettings();
  saveEquity(Date.now(), settings.startingEquity, 0, 0);
  const latestClosed = db.prepare(
    `SELECT product, MAX(time) AS time
     FROM candles
     WHERE tf=? AND time < ?
     GROUP BY product`,
  );
  const insert = db.prepare('INSERT OR REPLACE INTO processed_bars(product,time) VALUES (?,?)');
  const now = Math.floor(Date.now() / 1000);
  const interval = settings.timeframe === 'ONE_DAY' ? 86400 : 3600;
  const rows = latestClosed.all(settings.timeframe, now - (now % interval)) as Array<{
    product: string;
    time: number;
  }>;
  for (const row of rows) {
    insert.run(row.product, row.time);
  }
}
