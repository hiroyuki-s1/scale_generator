import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { snapshotForStorage, restoreFromStorage } from '../../src/state/persist.js';

// ── snapshotForStorage ────────────────────────────────────────────────────────

const makeState = (overrides = {}) => ({
  edit: {
    rootIndex: 9,
    activeDegrees: new Set([0, 3, 5, 7, 10]),
    presetName: 'minor_pentatonic',
    mode: 'scale',
    mask: { enabled: false, min: 1, max: 15 },
    degreeColors: [],
    instrument: null,
  },
  saved: [],
  layout: { cols: 2, rows: 3 },
  activeTab: 'edit',
  nextId: 1,
  ...overrides,
});

describe('snapshotForStorage', () => {
  it('serializes activeDegrees Set to an array', () => {
    const snap = snapshotForStorage(makeState());
    expect(Array.isArray(snap.edit.activeDegrees)).toBe(true);
    expect(snap.edit.activeDegrees).toEqual(expect.arrayContaining([0, 3, 5, 7, 10]));
  });

  it('preserves all top-level fields', () => {
    const snap = snapshotForStorage(makeState());
    expect(snap.activeTab).toBe('edit');
    expect(snap.nextId).toBe(1);
    expect(snap.layout).toEqual({ cols: 2, rows: 3 });
  });

  it('serializes saved cards with activeDegrees as array', () => {
    const state = makeState({
      saved: [
        {
          id: 1,
          title: 'Test',
          rootIndex: 0,
          activeDegrees: new Set([0, 4, 7]),
          presetName: 'major',
          mode: 'scale',
          mask: { enabled: false, min: 1, max: 15 },
          degreeColors: [],
          instrument: 'guitar',
        },
      ],
    });
    const snap = snapshotForStorage(state);
    expect(Array.isArray(snap.saved[0].activeDegrees)).toBe(true);
    expect(snap.saved[0].id).toBe(1);
    expect(snap.saved[0].title).toBe('Test');
  });

  it('defaults instrument to null when omitted in edit', () => {
    const state = makeState();
    delete state.edit.instrument;
    const snap = snapshotForStorage(state);
    expect(snap.edit.instrument).toBeNull();
  });

  it('preserves instrument value when set', () => {
    const state = makeState();
    state.edit.instrument = 'bass';
    const snap = snapshotForStorage(state);
    expect(snap.edit.instrument).toBe('bass');
  });

  it('does not mutate original state', () => {
    const state = makeState();
    const originalSet = state.edit.activeDegrees;
    snapshotForStorage(state);
    expect(state.edit.activeDegrees).toBe(originalSet); // same reference
    expect(state.edit.activeDegrees).toBeInstanceOf(Set);
  });
});

// ── restoreFromStorage ────────────────────────────────────────────────────────

describe('restoreFromStorage', () => {
  let storageMock;

  beforeEach(() => {
    storageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => storageMock[key] ?? null),
      setItem: vi.fn((key, val) => { storageMock[key] = val; }),
      removeItem: vi.fn(key => { delete storageMock[key]; }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const storeRaw = (data) => {
    storageMock['sg.v1.state'] = JSON.stringify(data);
  };

  it('returns null when nothing is stored', () => {
    expect(restoreFromStorage()).toBeNull();
  });

  it('restores activeDegrees as a Set', () => {
    storeRaw({
      edit: { rootIndex: 9, activeDegrees: [0, 3, 5, 7, 10], presetName: 'minor_pentatonic', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [],
      layout: { cols: 2, rows: 3 },
      activeTab: 'edit',
      nextId: 1,
    });
    const state = restoreFromStorage();
    expect(state.edit.activeDegrees).toBeInstanceOf(Set);
    expect([...state.edit.activeDegrees]).toEqual(expect.arrayContaining([0, 3, 5, 7, 10]));
  });

  it('defaults edit.mode to "scale" if missing', () => {
    storeRaw({
      edit: { rootIndex: 0, activeDegrees: [0], presetName: 'major', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [],
      layout: { cols: 2, rows: 3 },
      activeTab: 'edit',
      nextId: 1,
    });
    const state = restoreFromStorage();
    expect(state.edit.mode).toBe('scale');
  });

  it('defaults activeTab to "edit" if missing', () => {
    storeRaw({
      edit: { rootIndex: 0, activeDegrees: [], presetName: 'major', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [],
      layout: { cols: 2, rows: 3 },
      nextId: 1,
    });
    const state = restoreFromStorage();
    expect(state.activeTab).toBe('edit');
  });

  it('defaults nextId to 1 if missing', () => {
    storeRaw({
      edit: { rootIndex: 0, activeDegrees: [], presetName: 'major', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [],
      layout: { cols: 2, rows: 3 },
      activeTab: 'edit',
    });
    const state = restoreFromStorage();
    expect(state.nextId).toBe(1);
  });

  it('restores saved cards with activeDegrees as Set', () => {
    storeRaw({
      edit: { rootIndex: 9, activeDegrees: [0], presetName: 'minor_pentatonic', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [
        { id: 1, title: 'Card 1', rootIndex: 0, activeDegrees: [0, 4, 7], presetName: 'major', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: 'guitar' },
      ],
      layout: { cols: 2, rows: 3 },
      activeTab: 'saved',
      nextId: 2,
    });
    const state = restoreFromStorage();
    expect(state.saved[0].activeDegrees).toBeInstanceOf(Set);
    expect(state.saved[0].id).toBe(1);
  });

  it('defaults saved card instrument to "guitar" if missing', () => {
    storeRaw({
      edit: { rootIndex: 9, activeDegrees: [0], presetName: 'minor_pentatonic', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: null },
      saved: [
        { id: 1, title: 'Old Card', rootIndex: 0, activeDegrees: [0], presetName: 'major', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [] },
      ],
      layout: { cols: 2, rows: 3 },
      activeTab: 'edit',
      nextId: 2,
    });
    const state = restoreFromStorage();
    expect(state.saved[0].instrument).toBe('guitar');
  });

  it('preserves bass instrument in saved cards', () => {
    storeRaw({
      edit: { rootIndex: 9, activeDegrees: [0], presetName: 'minor_pentatonic', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: 'bass' },
      saved: [
        { id: 1, title: 'Bass Card', rootIndex: 0, activeDegrees: [0], presetName: 'major', mode: 'scale', mask: { enabled: false, min: 1, max: 15 }, degreeColors: [], instrument: 'bass' },
      ],
      layout: { cols: 2, rows: 3 },
      activeTab: 'edit',
      nextId: 2,
    });
    const state = restoreFromStorage();
    expect(state.edit.instrument).toBe('bass');
    expect(state.saved[0].instrument).toBe('bass');
  });

  it('returns null and logs warning when JSON is corrupt', () => {
    storageMock['sg.v1.state'] = 'not valid json{{{';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = restoreFromStorage();
    expect(state).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('snapshotForStorage → restoreFromStorage round-trip', () => {
  let storageMock;

  beforeEach(() => {
    storageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => storageMock[key] ?? null),
      setItem: vi.fn((key, val) => { storageMock[key] = val; }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves edit state through serialize → JSON → deserialize', () => {
    const state = makeState({ activeTab: 'saved', nextId: 5 });
    const snap = snapshotForStorage(state);
    storageMock['sg.v1.state'] = JSON.stringify(snap);
    const restored = restoreFromStorage();

    expect(restored.edit.rootIndex).toBe(9);
    expect(restored.edit.activeDegrees).toBeInstanceOf(Set);
    expect([...restored.edit.activeDegrees]).toEqual(expect.arrayContaining([0, 3, 5, 7, 10]));
    expect(restored.edit.presetName).toBe('minor_pentatonic');
    expect(restored.activeTab).toBe('saved');
    expect(restored.nextId).toBe(5);
  });

  it('preserves saved cards through round-trip', () => {
    const state = makeState({
      saved: [
        {
          id: 2,
          title: 'My Scale',
          rootIndex: 4,
          activeDegrees: new Set([0, 2, 4, 5, 7, 9, 11]),
          presetName: 'major',
          mode: 'scale',
          mask: { enabled: true, min: 3, max: 9 },
          degreeColors: [],
          instrument: 'guitar',
        },
      ],
    });
    const snap = snapshotForStorage(state);
    storageMock['sg.v1.state'] = JSON.stringify(snap);
    const restored = restoreFromStorage();

    const card = restored.saved[0];
    expect(card.id).toBe(2);
    expect(card.title).toBe('My Scale');
    expect(card.activeDegrees).toBeInstanceOf(Set);
    expect(card.mask.enabled).toBe(true);
    expect(card.mask.min).toBe(3);
    expect(card.instrument).toBe('guitar');
  });
});
