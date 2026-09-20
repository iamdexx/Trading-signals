import { describe, expect, it } from 'vitest';
import { assetNewsScore, classifyCatalysts, scoreSentiment, tagAssets } from './sentiment.js';
import type { NewsArticle } from './types.js';

describe('sentiment', () => {
  it('recognizes positive listings', () => {
    expect(scoreSentiment('Coinbase to list X')).toBeGreaterThan(0);
    expect(classifyCatalysts('Coinbase to list X')).toContain('listing');
  });

  it('recognizes a negative exploit and hack catalyst', () => {
    expect(scoreSentiment('X protocol exploited for $40M')).toBeLessThan(0);
    expect(classifyCatalysts('X protocol exploited for $40M')).toContain('hack');
  });

  it('treats a dropped SEC lawsuit as positive', () => {
    expect(scoreSentiment('SEC drops lawsuit against Y')).toBeGreaterThan(0);
    expect(classifyCatalysts('SEC drops lawsuit against Y')).toContain('regulation_positive');
  });

  it('flips negated approval', () => {
    expect(scoreSentiment('ETF not approved')).toBeLessThan(0);
  });

  it('covers crypto-finance positives, negatives, and neutral language', () => {
    expect(scoreSentiment('Bitcoin ETF approval attracts institutional inflows')).toBeGreaterThan(
      0,
    );
    expect(scoreSentiment('Partnership secures funding as adoption expands')).toBeGreaterThan(0);
    expect(scoreSentiment('Token unlock triggers outflows and a plunge')).toBeLessThan(0);
    expect(scoreSentiment('Exchange halted withdrawals and funds were frozen')).toBeLessThan(0);
    expect(scoreSentiment('Fidelity surge is saving Bitcoin ETFs from a disastrous week')).toBe(0);
    expect(scoreSentiment('Gen Z investing like Boomers')).toBe(0);
    expect(scoreSentiment('Regulator denied the upgrade after a lawsuit')).toBeLessThan(0);
  });

  it('requires uppercase exact matching for ambiguous symbols', () => {
    const assets = [
      { productId: 'SUI-USD', symbol: 'SUI', name: 'Sui Network' },
      { productId: 'BTC-USD', symbol: 'BTC', name: 'Bitcoin' },
    ];
    expect(tagAssets('sui rises while Bitcoin rallies', assets)).toEqual(['BTC-USD']);
    expect(tagAssets('SUI rises while BTC rallies', assets)).toEqual(['SUI-USD', 'BTC-USD']);
  });

  it('decays and weights recent asset news', () => {
    const articles: NewsArticle[] = [
      {
        id: '1',
        source: 'coindesk',
        title: 'Positive',
        summary: '',
        link: 'https://example.com/1',
        published: Date.now() - 60 * 60 * 1000,
        sentiment: 0.8,
        catalysts: ['listing'],
        assets: ['BTC-USD'],
      },
    ];
    const summary = assetNewsScore(articles, 'BTC-USD');
    expect(summary.score).toBeGreaterThan(0);
    expect(summary.count).toBe(1);
    expect(summary.catalysts).toContain('listing');
  });
});
