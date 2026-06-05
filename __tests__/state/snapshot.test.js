import { describe, it, expect } from 'vitest';
import { cloneColors, cloneEditAsSnapshot, applyColorsToAllSaved } from '../../src/state/snapshot.js';

const COLORS_A = [{ solid: true, color: '#a00000', text: '#fff' }];
const COLORS_B = [{ solid: false, color: '#0000a0', text: '#000' }];

function makeState() {
  return {
    edit: {
      rootIndex: 0,
      activeDegrees: new Set([0, 4, 7]),
      presetName: 'maj',
      mode: 'chord',
      mask: { enabled: false, min: 1, max: 22 },
      degreeColors: COLORS_A,
      instrument: 'guitar',
    },
    saved: [
      { id: 1, title: 's1', rootIndex: 2, activeDegrees: new Set([0, 3, 7]),
        presetName: 'min', mode: 'chord', mask: { enabled: false, min: 1, max: 22 },
        degreeColors: COLORS_A, instrument: 'guitar' },
      { id: 2, title: 's2', rootIndex: 5, activeDegrees: new Set([0, 2, 4]),
        presetName: null, mode: 'scale', mask: { enabled: false, min: 1, max: 22 },
        degreeColors: COLORS_A, instrument: 'bass' },
    ],
    layout: { orientation: 'landscape', cols: 2, rows: 3 },
    activeTab: 'edit',
    nextId: 3,
  };
}

describe('cloneColors', () => {
  it('deep-clones each color object', () => {
    const out = cloneColors(COLORS_A);
    expect(out).toEqual(COLORS_A);
    expect(out[0]).not.toBe(COLORS_A[0]);
  });
});

describe('cloneEditAsSnapshot', () => {
  it('produces independent Set / mask / colors', () => {
    const snap = cloneEditAsSnapshot(makeState().edit);
    expect(snap.presetName).toBe('maj');
    expect([...snap.activeDegrees]).toEqual([0, 4, 7]);
    expect(snap.instrument).toBe('guitar');
    // mutate snapshot → original unaffected
    snap.activeDegrees.add(11);
    expect([...snap.activeDegrees]).toContain(11);
  });
});

describe('applyColorsToAllSaved (explicit bulk apply)', () => {
  it('applies colors to every saved scale but NOT to edit', () => {
    const state = makeState();
    const next = applyColorsToAllSaved(state, COLORS_B);
    next.saved.forEach(s => expect(s.degreeColors).toEqual(COLORS_B));
    // edit は一括反映の対象外（編集中スケールの色はそのまま）
    expect(next.edit.degreeColors).toBe(COLORS_A);
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    applyColorsToAllSaved(state, COLORS_B);
    state.saved.forEach(s => expect(s.degreeColors).toBe(COLORS_A));
  });

  it('clones colors independently per scale (no shared reference)', () => {
    const state = makeState();
    const next = applyColorsToAllSaved(state, COLORS_B);
    expect(next.saved[0].degreeColors).not.toBe(COLORS_B);
    expect(next.saved[0].degreeColors).not.toBe(next.saved[1].degreeColors);
  });

  it('preserves other saved fields (id, title, activeDegrees, instrument)', () => {
    const state = makeState();
    const next = applyColorsToAllSaved(state, COLORS_B);
    expect(next.saved[0].id).toBe(1);
    expect(next.saved[1].instrument).toBe('bass');
    expect([...next.saved[0].activeDegrees]).toEqual([0, 3, 7]);
  });

  it('empty saved list → no-op clone', () => {
    const state = { ...makeState(), saved: [] };
    const next = applyColorsToAllSaved(state, COLORS_B);
    expect(next.saved).toEqual([]);
  });
});
