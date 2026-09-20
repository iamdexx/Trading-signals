export type LedgerEntryType = 'deposit' | 'withdrawal' | 'buy' | 'sell';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  productId?: string;
  quantity?: number;
  price?: number;
  feeUsd: number;
  timestamp: number;
  note?: string;
  source: 'issue' | 'api';
  ref?: string;
}

export interface LedgerHolding {
  productId: string;
  quantity: number;
  avgCost: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
}

export interface LedgerPortfolio {
  cash: number;
  holdings: LedgerHolding[];
  realizedPnl: number;
  feesPaid: number;
  deposits: number;
  withdrawals: number;
  equity: number;
}

function amount(entry: LedgerEntry): number {
  return entry.price ?? 0;
}

export function validateEntry(entry: LedgerEntry, entries: LedgerEntry[] = []): string | null {
  if (typeof entry.id !== 'string' || !entry.id.trim()) return 'id is required';
  if (!['deposit', 'withdrawal', 'buy', 'sell'].includes(entry.type)) {
    return 'type is invalid';
  }
  if (!Number.isFinite(entry.timestamp) || entry.timestamp <= 0) {
    return 'timestamp must be positive';
  }
  if (!Number.isFinite(entry.feeUsd) || entry.feeUsd < 0) {
    return 'feeUsd must be non-negative';
  }
  if (entry.type === 'deposit' || entry.type === 'withdrawal') {
    if (!Number.isFinite(amount(entry)) || amount(entry) <= 0) {
      return 'price must be positive for cash entries';
    }
    return null;
  }
  if (typeof entry.productId !== 'string' || !entry.productId.trim()) {
    return 'productId is required for trades';
  }
  if (!Number.isFinite(entry.quantity) || (entry.quantity ?? 0) <= 0) {
    return 'quantity must be positive';
  }
  if (!Number.isFinite(entry.price) || (entry.price ?? 0) <= 0) {
    return 'price must be positive';
  }
  if (entry.type === 'sell') {
    const held =
      computePortfolio(
        entries.filter((item) => item.timestamp <= entry.timestamp),
        {},
        entry.timestamp,
      ).holdings.find((holding) => holding.productId === entry.productId)?.quantity ?? 0;
    if ((entry.quantity ?? 0) > held + 1e-12) {
      return `cannot sell ${entry.quantity} ${entry.productId}; only ${held} held`;
    }
  }
  return null;
}

export function ledgerWarnings(entry: LedgerEntry, knownProducts: Iterable<string>): string[] {
  if (!entry.productId) return [];
  const known = new Set(knownProducts);
  return known.has(entry.productId)
    ? []
    : [`${entry.productId} is not currently in the Coinbase universe`];
}

export function computePortfolio(
  entries: LedgerEntry[],
  prices: Record<string, number>,
  now: number,
): LedgerPortfolio {
  const holdings = new Map<string, { quantity: number; cost: number }>();
  let cash = 0;
  let realizedPnl = 0;
  let feesPaid = 0;
  let deposits = 0;
  let withdrawals = 0;

  const applicable = [...entries]
    .filter((entry) => entry.timestamp <= now)
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  for (const entry of applicable) {
    const fee = entry.feeUsd;
    feesPaid += fee;
    if (entry.type === 'deposit') {
      deposits += amount(entry);
      cash += amount(entry) - fee;
      continue;
    }
    if (entry.type === 'withdrawal') {
      withdrawals += amount(entry);
      cash -= amount(entry) + fee;
      continue;
    }
    const productId = entry.productId as string;
    const quantity = entry.quantity as number;
    const book = holdings.get(productId) ?? { quantity: 0, cost: 0 };
    if (entry.type === 'buy') {
      book.quantity += quantity;
      book.cost += quantity * (entry.price as number) + fee;
      cash -= quantity * (entry.price as number) + fee;
    } else {
      const averageCost = book.quantity > 0 ? book.cost / book.quantity : 0;
      const costBasis = averageCost * quantity;
      book.quantity -= quantity;
      book.cost -= costBasis;
      cash += quantity * (entry.price as number) - fee;
      realizedPnl += quantity * (entry.price as number) - fee - costBasis;
    }
    if (book.quantity <= 1e-12) {
      holdings.delete(productId);
    } else {
      holdings.set(productId, book);
    }
  }

  const resultHoldings = [...holdings.entries()].map(([productId, book]) => {
    const price = Number.isFinite(prices[productId]) ? prices[productId] : 0;
    const marketValue = book.quantity * price;
    const averageCost = book.cost / book.quantity;
    const unrealizedPnl = marketValue - book.cost;
    return {
      productId,
      quantity: book.quantity,
      avgCost: averageCost,
      marketValue,
      unrealizedPnl,
      unrealizedPct: book.cost > 0 ? (unrealizedPnl / book.cost) * 100 : 0,
    };
  });
  const holdingsValue = resultHoldings.reduce((total, holding) => total + holding.marketValue, 0);
  return {
    cash,
    holdings: resultHoldings,
    realizedPnl,
    feesPaid,
    deposits,
    withdrawals,
    equity: cash + holdingsValue,
  };
}
