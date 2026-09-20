import { describe, expect, it } from 'vitest';
import { isBlockingArticle } from './db.js';
import type { Catalyst } from '../core/types.js';

describe('news blocking', () => {
  it('blocks an 80-hour-old hack inside a 96-hour window', () => {
    const now = Date.now();
    const article = {
      published: now - 80 * 60 * 60 * 1000,
      catalysts: ['hack'] as Catalyst[],
    };
    expect(isBlockingArticle(article, now - 96 * 60 * 60 * 1000)).toBe(true);
    expect(isBlockingArticle(article, now - 72 * 60 * 60 * 1000)).toBe(false);
  });
});
