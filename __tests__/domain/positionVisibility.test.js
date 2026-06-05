import { describe, it, expect } from 'vitest';
import {
  posKey, isPosKey, allActivePositionKeys, toggleVisible,
  serializeVisible, deserializeVisible, reconcileVisible,
} from '../../src/domain/positionVisibility.js';

const guitarScale = (degrees, root = 0) => ({
  rootIndex: root,
  activeDegrees: new Set(degrees),
  mask: { enabled: false, min: 1, max: 22 },
  instrument: 'guitar',
});

describe('posKey / isPosKey', () => {
  it('builds g{fret}s{string} keys', () => {
    expect(posKey({ fret: 3, string: 0 })).toBe('g3s0');
    expect(posKey({ fret: 12, string: 5 })).toBe('g12s5');
  });
  it('validates key format', () => {
    expect(isPosKey('g3s0')).toBe(true);
    expect(isPosKey('g12s5')).toBe(true);
    expect(isPosKey('x3s0')).toBe(false);
    expect(isPosKey('g3')).toBe(false);
    expect(isPosKey('gXsY')).toBe(false);
    expect(isPosKey('')).toBe(false);
    expect(isPosKey(null)).toBe(false);
  });
});

describe('allActivePositionKeys', () => {
  it('returns a key for every active note (mask-independent)', () => {
    const scale = guitarScale([0]); // root only, C
    const keys = allActivePositionKeys(scale);
    expect(keys instanceof Set).toBe(true);
    // every key valid
    [...keys].forEach(k => expect(isPosKey(k)).toBe(true));
    expect(keys.size).toBeGreaterThan(0);
  });

  it('ignores mask (computes full fretboard)', () => {
    const open = guitarScale([0, 4, 7]);
    const masked = { ...open, mask: { enabled: true, min: 5, max: 7 } };
    expect(allActivePositionKeys(open).size).toBe(allActivePositionKeys(masked).size);
  });

  it('more active degrees → more positions', () => {
    expect(allActivePositionKeys(guitarScale([0, 4, 7])).size)
      .toBeGreaterThan(allActivePositionKeys(guitarScale([0])).size);
  });
});

describe('toggleVisible', () => {
  it('removes a present key, adds an absent key, returns a NEW set', () => {
    const a = new Set(['g3s0', 'g5s1']);
    const removed = toggleVisible(a, 'g3s0');
    expect(removed.has('g3s0')).toBe(false);
    expect(removed.has('g5s1')).toBe(true);
    expect(removed).not.toBe(a);
    expect(a.has('g3s0')).toBe(true); // original unchanged

    const added = toggleVisible(a, 'g7s2');
    expect(added.has('g7s2')).toBe(true);
  });
});

describe('serializeVisible / deserializeVisible', () => {
  it('round-trips a Set ⇄ Array', () => {
    const set = new Set(['g3s0', 'g5s1']);
    const arr = serializeVisible(set);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.sort()).toEqual(['g3s0', 'g5s1']);
    const back = deserializeVisible(arr);
    expect(back instanceof Set).toBe(true);
    expect([...back].sort()).toEqual(['g3s0', 'g5s1']);
  });

  it('null serializes to null and deserializes to null (全表示)', () => {
    expect(serializeVisible(null)).toBe(null);
    expect(deserializeVisible(null)).toBe(null);
  });

  it('deserialize drops invalid keys', () => {
    const back = deserializeVisible(['g3s0', 'bad', 'g5s1', 42, null, 'gXsY']);
    expect([...back].sort()).toEqual(['g3s0', 'g5s1']);
  });

  it('deserialize of a non-array, non-null value → null (全表示フォールバック)', () => {
    expect(deserializeVisible('nope')).toBe(null);
    expect(deserializeVisible(42)).toBe(null);
    expect(deserializeVisible({})).toBe(null);
  });

  it('deserialize of an array with no valid keys → empty Set (全非表示は許容)', () => {
    const back = deserializeVisible(['bad', 'gXsY']);
    expect(back instanceof Set).toBe(true);
    expect(back.size).toBe(0);
  });
});

describe('reconcileVisible', () => {
  it('initial (prev null) keeps next.visiblePositions', () => {
    const next = { ...guitarScale([0]), visiblePositions: null };
    expect(reconcileVisible(null, next)).toBe(null);
  });

  it('preset selection (presetName set + degrees change) rebuilds to all active', () => {
    const prev = { ...guitarScale([0]), presetName: null, visiblePositions: new Set(['g3s0']) };
    const next = { ...guitarScale([0, 4, 7]), presetName: 'maj', visiblePositions: new Set(['g3s0']) };
    const out = reconcileVisible(prev, next);
    expect(out).toEqual(allActivePositionKeys(next));
  });

  it('root change rebuilds to all active', () => {
    const prev = { ...guitarScale([0, 4, 7], 0), presetName: 'maj', visiblePositions: new Set(['g3s0']) };
    const next = { ...guitarScale([0, 4, 7], 2), presetName: 'maj', visiblePositions: new Set(['g3s0']) };
    expect(reconcileVisible(prev, next)).toEqual(allActivePositionKeys(next));
  });

  it('custom degree enable adds that degree positions; thins removed ones', () => {
    const prev = { ...guitarScale([0]), presetName: null };
    const prevAll = allActivePositionKeys(prev);
    // user had hidden some root positions
    const someRoot = [...prevAll][0];
    prev.visiblePositions = new Set([...prevAll].filter(k => k !== someRoot));
    // now enable degree 7 (custom)
    const next = { ...guitarScale([0, 7]), presetName: null, visiblePositions: prev.visiblePositions };
    const out = reconcileVisible(prev, next);
    // previously-hidden root stays hidden
    expect(out.has(someRoot)).toBe(false);
    // all new degree-7 positions are now visible
    const nextAll = allActivePositionKeys(next);
    const deg7Only = [...nextAll].filter(k => !prevAll.has(k));
    deg7Only.forEach(k => expect(out.has(k)).toBe(true));
  });

  it('custom degree disable removes those positions from visible', () => {
    const prev = { ...guitarScale([0, 7]), presetName: null };
    const prevAll = allActivePositionKeys(prev);
    prev.visiblePositions = new Set(prevAll);
    const next = { ...guitarScale([0]), presetName: null, visiblePositions: prev.visiblePositions };
    const out = reconcileVisible(prev, next);
    const nextAll = allActivePositionKeys(next);
    // only currently-active positions remain
    [...out].forEach(k => expect(nextAll.has(k)).toBe(true));
  });

  it('only visiblePositions changed (tap toggle) → keep as-is (no rebuild)', () => {
    const base = { ...guitarScale([0, 4, 7]), presetName: 'maj' };
    const all = allActivePositionKeys(base);
    const prev = { ...base, visiblePositions: new Set(all) };
    const tapped = new Set(all); tapped.delete([...all][0]);
    const next = { ...base, visiblePositions: tapped };
    expect(reconcileVisible(prev, next)).toBe(tapped);
  });

  it('null visiblePositions on degree change materializes to all active', () => {
    const prev = { ...guitarScale([0]), presetName: null, visiblePositions: null };
    const next = { ...guitarScale([0, 4]), presetName: null, visiblePositions: null };
    expect(reconcileVisible(prev, next)).toEqual(allActivePositionKeys(next));
  });
});
