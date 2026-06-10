import { describe, it, expect } from 'vitest';
import { normalizeTheme } from '../../src/state/tunerTheme.js';

describe('normalizeTheme', () => {
  it("returns 'dark' only for explicit 'dark'", () => {
    expect(normalizeTheme('dark')).toBe('dark');
  });
  it("defaults to 'light' for anything else (既定=ライト)", () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('')).toBe('light');
    expect(normalizeTheme(null)).toBe('light');
    expect(normalizeTheme('DARK')).toBe('light');
    expect(normalizeTheme(undefined)).toBe('light');
  });
});
