import { describe, it, expect } from 'vitest';
import { midiToPitchClass, pitchClassToDegree } from '../../src/domain/music.js';

describe('midiToPitchClass', () => {
  it('maps standard MIDI to 0-11', () => {
    expect(midiToPitchClass(60)).toBe(0);  // C4
    expect(midiToPitchClass(69)).toBe(9);  // A4
    expect(midiToPitchClass(72)).toBe(0);  // C5
    expect(midiToPitchClass(71)).toBe(11); // B4
  });
  it('handles negative MIDI without breaking', () => {
    expect(midiToPitchClass(-1)).toBe(11);
    expect(midiToPitchClass(-12)).toBe(0);
  });
});

describe('pitchClassToDegree', () => {
  it('returns 0 when pitchClass == root', () => {
    expect(pitchClassToDegree(9, 9)).toBe(0);
  });
  it('returns wrap-around degree when pc < root', () => {
    // root A (9), pc C (0)  -> minor 3rd (3 semitones up from A)
    expect(pitchClassToDegree(0, 9)).toBe(3);
  });
  it('all 12 degrees for root C (0)', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(pitchClassToDegree(pc, 0)).toBe(pc);
    }
  });
});
