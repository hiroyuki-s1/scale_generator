import { describe, it, expect } from 'vitest';
import { buildXShareUrl, SITE_URL } from '../../src/domain/socialShare.js';

describe('buildXShareUrl', () => {
  it('uses the x.com intent endpoint', () => {
    expect(buildXShareUrl({ text: 'hi' })).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/);
  });

  it('encodes text and url', () => {
    const url = buildXShareUrl({ text: 'C リディアン', url: SITE_URL });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('text')).toBe('C リディアン');
    expect(params.get('url')).toBe(SITE_URL);
  });

  it('joins hashtags with commas and drops empties', () => {
    const url = buildXShareUrl({ text: 'x', hashtags: ['神スケールトレーナー', '', 'guitar'] });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('hashtags')).toBe('神スケールトレーナー,guitar');
  });

  it('omits empty params (no url / no hashtags)', () => {
    const url = buildXShareUrl({ text: 'only text' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('url')).toBe(false);
    expect(params.has('hashtags')).toBe(false);
  });

  it('handles no args without throwing', () => {
    expect(() => buildXShareUrl()).not.toThrow();
    expect(buildXShareUrl()).toBe('https://x.com/intent/tweet?');
  });
});
