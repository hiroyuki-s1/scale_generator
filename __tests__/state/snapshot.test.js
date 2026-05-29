import { describe, it, expect } from 'vitest';
import { cloneColors, cloneEditAsSnapshot, propagateColors } from '../../src/state/snapshot.js';

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

describe('propagateColors (global color setting)', () => {
  it('applies new colors to edit AND every saved scale', () => {
    const state = makeState();
    const next = propagateColors(state, COLORS_B);
    expect(next.edit.degreeColors).toEqual(COLORS_B);
    next.saved.forEach(s => expect(s.degreeColors).toEqual(COLORS_B));
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    propagateColors(state, COLORS_B);
    expect(state.edit.degreeColors).toBe(COLORS_A);
    state.saved.forEach(s => expect(s.degreeColors).toBe(COLORS_A));
  });

  it('clones colors independently per scale (no shared reference)', () => {
    const state = makeState();
    const next = propagateColors(state, COLORS_B);
    expect(next.edit.degreeColors).not.toBe(COLORS_B);
    expect(next.saved[0].degreeColors).not.toBe(next.saved[1].degreeColors);
  });

  it('preserves other saved fields (id, title, activeDegrees, instrument)', () => {
    const state = makeState();
    const next = propagateColors(state, COLORS_B);
    expect(next.saved[0].id).toBe(1);
    expect(next.saved[1].instrument).toBe('bass');
    expect([...next.saved[0].activeDegrees]).toEqual([0, 3, 7]);
  });
});
