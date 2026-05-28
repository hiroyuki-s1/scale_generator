import { describe, it, expect } from 'vitest';
import { chordQualityToScale, chordQualityToScaleCtx } from '../../src/domain/chordScale.js';

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

  it('m7b5 → Locrian #2 (6th mode of melodic minor)', () => {
    expect(chordQualityToScale('m7b5').scaleName).toBe('Locrian #2');
  });

  it('h7 → Locrian #2', () => {
    expect(chordQualityToScale('h7').scaleName).toBe('Locrian #2');
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

describe('chordQualityToScaleCtx — key-aware mode assignment', () => {
  // key of C major (keyPc=0, keyIsMinor=false)
  it('IVM7 (FM7 in C) → Lydian', () => {
    expect(chordQualityToScaleCtx('M7', 5, 0, false).scaleName).toBe('Lydian');
  });
  it('IIIm7 (Em7 in C) → Phrygian', () => {
    expect(chordQualityToScaleCtx('m7', 4, 0, false).scaleName).toBe('Phrygian');
  });
  it('VIm7 (Am7 in C) → Aeolian', () => {
    expect(chordQualityToScaleCtx('m7', 9, 0, false).scaleName).toBe('Aeolian');
  });
  it('bII7 (Db7 in C) → Lydian Dom (tritone sub)', () => {
    expect(chordQualityToScaleCtx('7', 1, 0, false).scaleName).toBe('Lydian Dom');
  });

  // non-context-specific chords fall through to quality rules
  it('IIm7 (Dm7 in C) → Dorian (fallthrough)', () => {
    expect(chordQualityToScaleCtx('m7', 2, 0, false).scaleName).toBe('Dorian');
  });
  it('V7 (G7 in C) → Mixolydian (fallthrough)', () => {
    expect(chordQualityToScaleCtx('7', 7, 0, false).scaleName).toBe('Mixolydian');
  });
  it('m7b5 → Locrian #2 regardless of key', () => {
    expect(chordQualityToScaleCtx('m7b5', 9, 0, false).scaleName).toBe('Locrian #2');
  });
  it('7b9 → Altered regardless of key', () => {
    expect(chordQualityToScaleCtx('7b9', 7, 0, false).scaleName).toBe('Altered');
  });

  // minor key (G minor, keyPc=7, keyIsMinor=true)
  it('bVIM7 (EbM7 in Gm) → Lydian', () => {
    expect(chordQualityToScaleCtx('M7', 3, 7, true).scaleName).toBe('Lydian');
  });
  it('bVIIM7 (FM7 in Gm) → Lydian', () => {
    expect(chordQualityToScaleCtx('M7', 5, 7, true).scaleName).toBe('Lydian');
  });
  it('bII7 (Ab7 in Gm) → Lydian Dom', () => {
    expect(chordQualityToScaleCtx('7', 8, 7, true).scaleName).toBe('Lydian Dom');
  });
  it('Im7 (Gm7 in Gm) → Dorian (fallthrough)', () => {
    expect(chordQualityToScaleCtx('m7', 7, 7, true).scaleName).toBe('Dorian');
  });
});
