import { describe, expect, it } from 'vitest';
import { computePortfolio, validateEntry } from './ledger.js';
import type { LedgerEntry } from './ledger.js';

const entry = (
  id: string,
  type: LedgerEntry['type'],
  values: Partial<LedgerEntry> = {},
): LedgerEntry => ({
  id,
  type,
  feeUsd: 0,
  timestamp: Number(id),
  source: 'api',
  ...values,
});

describe('manual ledger', () => {
  it('computes average-cost holdings, realized and unrealized P&L', () => {
    const entries = [
      entry('1', 'deposit', { price: 1000 }),
      entry('2', 'buy', { productId: 'BTC-USD', quantity: 0.01, price: 20000 }),
      entry('3', 'buy', { productId: 'BTC-USD', quantity: 0.01, price: 30000 }),
      entry('4', 'sell', { productId: 'BTC-USD', quantity: 0.01, price: 40000 }),
    ];
    const portfolio = computePortfolio(entries, { 'BTC-USD': 35000 }, 10);
    expect(portfolio.cash).toBe(900);
    expect(portfolio.realizedPnl).toBe(150);
    expect(portfolio.holdings[0]).toMatchObject({
      productId: 'BTC-USD',
      quantity: 0.01,
      avgCost: 25000,
      marketValue: 350,
      unrealizedPnl: 100,
    });
    expect(portfolio.equity).toBe(1250);
  });

  it('includes fees in cash, basis, realized P&L and totals', () => {
    const entries = [
      entry('1', 'deposit', { price: 1000, feeUsd: 2 }),
      entry('2', 'buy', { productId: 'ETH-USD', quantity: 1, price: 500, feeUsd: 5 }),
      entry('3', 'sell', { productId: 'ETH-USD', quantity: 1, price: 600, feeUsd: 6 }),
    ];
    const portfolio = computePortfolio(entries, {}, 10);
    expect(portfolio.cash).toBe(1087);
    expect(portfolio.realizedPnl).toBe(89);
    expect(portfolio.feesPaid).toBe(13);
    expect(portfolio.deposits).toBe(1000);
    expect(portfolio.equity).toBe(1087);
  });

  it('rejects sells beyond held quantity', () => {
    const buy = entry('1', 'buy', { productId: 'SOL-USD', quantity: 2, price: 100 });
    const sell = entry('2', 'sell', { productId: 'SOL-USD', quantity: 3, price: 110 });
    expect(validateEntry(sell, [buy])).toContain('only 2 held');
  });
});
