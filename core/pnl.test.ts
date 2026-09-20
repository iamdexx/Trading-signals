import { describe, expect, it } from 'vitest';
import { entryFee, entryFill, exitLegPnl } from './pnl.js';

describe('fee-aware trade ledger', () => {
  it('accounts for a target partial and breakeven remainder', () => {
    const config = {
      riskPerTrade: 0.01,
      startingEquity: 10000,
      feeBps: 60,
      slippageBps: 5,
      stopAtrMult: 2,
      targetR: 1.5,
      trailAtrMult: 3,
      partialEnabled: true,
    };
    const quantity = 1;
    const fill = entryFill(100, config);
    const fee = entryFee(100, quantity, config);
    const partial = exitLegPnl(fill, 106, 0.5, config);
    const remainder = exitLegPnl(fill, 100, 0.5, config);
    const expected = -fee + partial + remainder;
    expect(fill).toBeCloseTo(100.05, 8);
    expect(fee).toBeCloseTo(0.6003, 8);
    expect(expected).toBeCloseTo(1.680509, 6);
  });
});
