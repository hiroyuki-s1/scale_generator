import { describe, it, expect } from 'vitest';
import {
  GUITAR_TUNINGS, BASS_TUNINGS, SWEETENED, tuningsFor, findTuning, labelsForMidi,
  targetHz, nearestStringWithOffset, tuningRange, targetsHz, zeroOffsets,
} from '../../src/domain/tunings.js';
import { midiToFreq } from '../../src/domain/pitch.js';

describe('tuning presets', () => {
  it('guitar standard = E A D G B E (high→low MIDI)', () => {
    const std = findTuning('guitar', 'standard');
    expect(std.midi).toEqual([64, 59, 55, 50, 45, 40]);
    expect(labelsForMidi(std.midi)).toEqual(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
  });

  it('drop D lowers only the 6th string by 2 semitones', () => {
    const std = findTuning('guitar', 'standard');
    const drop = findTuning('guitar', 'drop-d');
    expect(drop.midi.slice(0, 5)).toEqual(std.midi.slice(0, 5)); // 1〜5弦は同じ
    expect(drop.midi[5]).toBe(std.midi[5] - 2);                  // 6弦だけ -2
    expect(labelsForMidi(drop.midi)[5]).toBe('D2');
  });

  it('DADGAD / Open G / Open D have the expected low→high note names', () => {
    // labels は 高音→低音 並び。低音→高音 に直して確認。
    const low2high = id => labelsForMidi(findTuning('guitar', id).midi).slice().reverse();
    expect(low2high('dadgad')).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
    expect(low2high('open-g')).toEqual(['D2', 'G2', 'D3', 'G3', 'B3', 'D4']);
    expect(low2high('open-d')).toEqual(['D2', 'A2', 'D3', 'F#3', 'A3', 'D4']);
  });

  it('bass standard = G D A E and drop D lowers the 4th string', () => {
    expect(findTuning('bass', 'standard').midi).toEqual([43, 38, 33, 28]);
    expect(findTuning('bass', 'drop-d').midi[3]).toBe(26); // E1→D1
  });

  it('tuningsFor returns the right family; unknown id falls back to standard', () => {
    expect(tuningsFor('guitar')).toBe(GUITAR_TUNINGS);
    expect(tuningsFor('bass')).toBe(BASS_TUNINGS);
    expect(findTuning('guitar', 'nope').id).toBe('standard');
  });
});

describe('offset / sweetened targets', () => {
  it('targetHz with 0 offset equals equal-temperament frequency', () => {
    expect(targetHz(69, 440, 0)).toBeCloseTo(440, 6);
    expect(targetHz(40, 440, 0)).toBeCloseTo(midiToFreq(40, 440), 9);
  });

  it('negative offset lowers the target frequency by the cents amount', () => {
    const base = midiToFreq(59, 440);          // B3
    const lowered = targetHz(59, 440, -4);     // -4 cents
    expect(lowered).toBeLessThan(base);
    expect(1200 * Math.log2(lowered / base)).toBeCloseTo(-4, 6);
  });

  it('SWEETENED arrays match string counts', () => {
    expect(SWEETENED.guitar.length).toBe(6);
    expect(SWEETENED.bass.length).toBe(4);
  });

  it('zeroOffsets returns all-zero of given length', () => {
    expect(zeroOffsets(6)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('nearestStringWithOffset', () => {
  const std = findTuning('guitar', 'standard').midi;

  it('maps an in-tune low E2 to string index 5 with ~0 cents', () => {
    const r = nearestStringWithOffset(midiToFreq(40, 440), std);
    expect(r.index).toBe(5);
    expect(r.midi).toBe(40);
    expect(Math.abs(r.cents)).toBeLessThan(0.001);
  });

  it('respects offsets: a string sounding exactly at the sweetened target reads 0 cents', () => {
    const offsets = SWEETENED.guitar;            // B3 = -4 cents
    const sweetB = targetHz(59, 440, -4);        // 弦が甘い目標ぴったり
    const r = nearestStringWithOffset(sweetB, std, { offsets });
    expect(r.index).toBe(1);                      // B3 は index 1
    expect(Math.abs(r.cents)).toBeLessThan(0.001);
    // 補正なしだと同じ音が -4¢ にズレて見える
    const r0 = nearestStringWithOffset(sweetB, std);
    expect(r0.cents).toBeCloseTo(-4, 3);
  });

  it('returns null for empty / non-positive', () => {
    expect(nearestStringWithOffset(0, std)).toBeNull();
    expect(nearestStringWithOffset(110, [])).toBeNull();
  });
});

describe('tuningRange / targetsHz', () => {
  it('range brackets the lowest and highest string with margin', () => {
    const { minHz, maxHz } = tuningRange(findTuning('guitar', 'standard').midi);
    expect(minHz).toBeLessThan(midiToFreq(40, 440)); // E2 の下
    expect(maxHz).toBeGreaterThan(midiToFreq(64, 440)); // E4 の上
  });

  it('targetsHz applies per-string offsets', () => {
    const std = findTuning('guitar', 'standard').midi;
    const t0 = targetsHz(std);
    const ts = targetsHz(std, { offsets: SWEETENED.guitar });
    expect(t0.length).toBe(6);
    expect(ts[1]).toBeLessThan(t0[1]); // B3 が下がる
    expect(ts[4]).toBeCloseTo(t0[4], 9); // A2 は offset 0
  });
});
