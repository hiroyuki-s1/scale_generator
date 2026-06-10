import { describe, it, expect } from 'vitest';
import { normalizeTheme } from '../../src/state/tunerTheme.js';

describe('normalizeTheme', () => {
  it("returns 'light' only for 'light'", () => {
    expect(normalizeTheme('light')).toBe('light');
  });
  it("falls back to 'dark' for anything else", () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('')).toBe('dark');
    expect(normalizeTheme(null)).toBe('dark');
    expect(normalizeTheme('LIGHT')).toBe('dark');
    expect(normalizeTheme(undefined)).toBe('dark');
  });
});
