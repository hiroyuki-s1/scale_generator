import { describe, it, expect } from 'vitest';
import { savedListChanged } from '../../src/state/savedList.js';

const mk = (id) => ({ id, title: 't' + id });

describe('savedListChanged', () => {
  it('true when prev is null/empty and next has items', () => {
    expect(savedListChanged([], [mk(1)])).toBe(true);
    expect(savedListChanged(undefined, [mk(1)])).toBe(true);
  });

  it('false when same array references in same order', () => {
    const a = mk(1), b = mk(2);
    expect(savedListChanged([a, b], [a, b])).toBe(false);
  });

  it('true when length differs (add/remove)', () => {
    const a = mk(1), b = mk(2);
    expect(savedListChanged([a], [a, b])).toBe(true);
    expect(savedListChanged([a, b], [a])).toBe(true);
  });

  it('true on content update (same id, new object reference)', () => {
    const a = mk(1), b = mk(2);
    const bUpdated = { ...b, title: 'changed' }; // 編集モードで更新 → 新オブジェクト
    expect(savedListChanged([a, b], [a, bUpdated])).toBe(true);
  });

  it('true on reorder (same objects, different order)', () => {
    const a = mk(1), b = mk(2);
    expect(savedListChanged([a, b], [b, a])).toBe(true);
  });
});
