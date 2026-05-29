import { describe, it, expect } from 'vitest';
import { savedListChanged, colorOnlyUpdate } from '../../src/state/savedList.js';

const mk = (id) => ({ id, title: 't' + id });

// snapshot factory with the fields colorOnlyUpdate inspects
const SHARED_DEGS = new Set([0, 4, 7]);
const SHARED_MASK = { enabled: false, min: 1, max: 22 };
const snap = (id, overrides = {}) => ({
  id,
  title: 't' + id,
  rootIndex: 0,
  presetName: 'maj',
  mode: 'chord',
  instrument: 'guitar',
  activeDegrees: SHARED_DEGS,
  mask: SHARED_MASK,
  degreeColors: [{ solid: true, color: '#a00', text: '#fff' }],
  ...overrides,
});

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

describe('colorOnlyUpdate', () => {
  it('false when prev is empty', () => {
    expect(colorOnlyUpdate([], [snap(1)])).toBe(false);
    expect(colorOnlyUpdate(undefined, [snap(1)])).toBe(false);
  });

  it('false when nothing changed (no new refs)', () => {
    const a = snap(1), b = snap(2);
    expect(colorOnlyUpdate([a, b], [a, b])).toBe(false);
  });

  it('false when length differs', () => {
    const a = snap(1);
    expect(colorOnlyUpdate([a], [a, snap(2)])).toBe(false);
  });

  it('true when only degreeColors differ (id/title/degrees etc all same refs)', () => {
    const a = snap(1), b = snap(2);
    const newColors = [{ solid: false, color: '#0a0', text: '#000' }];
    // 色のみ差し替え: 新しいオブジェクトだが他のフィールドは同一参照
    const aNew = { ...a, degreeColors: newColors };
    const bNew = { ...b, degreeColors: newColors };
    expect(colorOnlyUpdate([a, b], [aNew, bNew])).toBe(true);
  });

  it('false when title also changed', () => {
    const a = snap(1);
    const aNew = { ...a, title: 'renamed', degreeColors: [] };
    expect(colorOnlyUpdate([a], [aNew])).toBe(false);
  });

  it('false when activeDegrees ref changed (scale update path)', () => {
    const a = snap(1);
    const aNew = { ...a, activeDegrees: new Set([0, 3, 7]), degreeColors: [] };
    expect(colorOnlyUpdate([a], [aNew])).toBe(false);
  });

  it('false on reorder of same objects', () => {
    const a = snap(1), b = snap(2);
    expect(colorOnlyUpdate([a, b], [b, a])).toBe(false);
  });
});
