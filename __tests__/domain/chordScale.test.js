import { describe, it, expect } from 'vitest';
import { chordQualityToScale } from '../../src/domain/chordScale.js';

describe('chordQualityToScale', () => {
  it('empty quality → Major Penta (major triad)', () => {
    const { scaleName, degrees } = chordQualityToScale('');
    expect(scaleName).toBe('Major Penta');
    expect(degrees).toContain(0);
  });

  it('^7 → Ionian', () => {
    expect(chordQualityToScale('^7').scaleName).toBe('Ionian');
  });

  it('^ alone → Ionian (iReal Bb^ notation)', () => {
    expect(chordQualityToScale('^').scaleName).toBe('Ionian');
  });

  it('M7 → Ionian', () => {
    expect(chordQualityToScale('M7').scaleName).toBe('Ionian');
  });

  it('maj7 → Ionian', () => {
    expect(chordQualityToScale('maj7').scaleName).toBe('Ionian');
  });

  it('m7 → Dorian', () => {
    expect(chordQualityToScale('m7').scaleName).toBe('Dorian');
  });

  it('-7 → Dorian', () => {
    expect(chordQualityToScale('-7').scaleName).toBe('Dorian');
  });

  it('7 → Mixolydian', () => {
    expect(chordQualityToScale('7').scaleName).toBe('Mixolydian');
  });

  it('7alt → Altered', () => {
    expect(chordQualityToScale('7alt').scaleName).toBe('Altered');
  });

  it('7b9 → Altered', () => {
    expect(chordQualityToScale('7b9').scaleName).toBe('Altered');
  });

  it('7#9 → Altered', () => {
    expect(chordQualityToScale('7#9').scaleName).toBe('Altered');
  });

  it('7#11 → Lydian Dom', () => {
    expect(chordQualityToScale('7#11').scaleName).toBe('Lydian Dom');
  });

  it('m7b5 → Locrian', () => {
    expect(chordQualityToScale('m7b5').scaleName).toBe('Locrian');
  });

  it('h7 → Locrian', () => {
    expect(chordQualityToScale('h7').scaleName).toBe('Locrian');
  });

  it('o7 → Diminished', () => {
    expect(chordQualityToScale('o7').scaleName).toBe('Diminished');
  });

  it('dim7 → Diminished', () => {
    expect(chordQualityToScale('dim7').scaleName).toBe('Diminished');
  });

  it('mM7 → Harmonic Min', () => {
    expect(chordQualityToScale('mM7').scaleName).toBe('Harmonic Min');
  });

  it('m → Minor Penta', () => {
    expect(chordQualityToScale('m').scaleName).toBe('Minor Penta');
  });

  it('sus → Mixolydian', () => {
    expect(chordQualityToScale('sus').scaleName).toBe('Mixolydian');
  });

  it('sus4 → Mixolydian', () => {
    expect(chordQualityToScale('sus4').scaleName).toBe('Mixolydian');
  });

  it('all results have R (0) in degrees', () => {
    ['', 'm7', '7', '^7', 'm7b5', 'o7', '7alt', 'sus'].forEach(q => {
      expect(chordQualityToScale(q).degrees).toContain(0);
    });
  });
});
