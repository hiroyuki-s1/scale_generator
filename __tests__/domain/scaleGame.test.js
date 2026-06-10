import { describe, it, expect } from 'vitest';
import { buildGame, scheduleAt, judgePlay, rankFor } from '../../src/domain/scaleGame.js';

// 進行: C major(全白鍵) → G major(F#入り)。tempo 120 → beatMs=500, 4拍/scale=2000ms。
const C_MAJOR = { rootIndex: 0, activeDegrees: new Set([0, 2, 4, 5, 7, 9, 11]) };
const G_MAJOR = { rootIndex: 7, activeDegrees: new Set([0, 2, 4, 5, 7, 9, 11]) };

function game(loops = 1) {
  return buildGame({ scales: [C_MAJOR, G_MAJOR], tempo: 120, loops });
}

describe('buildGame', () => {
  it('computes beat/step timing', () => {
    const g = game(2);
    expect(g.beatMs).toBe(500);
    expect(g.beatsPerScale).toBe(4);
    expect(g.scaleCount).toBe(2);
    expect(g.totalSteps).toBe(4);   // 2 scales * 2 loops
    expect(g.totalBeats).toBe(16);
    expect(g.totalMs).toBe(8000);
    expect(g.scaleSets[0].has(4)).toBe(true);  // C major has E
    expect(g.scaleSets[1].has(6)).toBe(true);  // G major has F#
  });
});

describe('scheduleAt', () => {
  const g = game(1); // C(0..2000) G(2000..4000)
  it('before start', () => {
    expect(scheduleAt(-10, g).beforeStart).toBe(true);
  });
  it('first scale, beat 0', () => {
    const s = scheduleAt(0, g);
    expect(s.scaleIndex).toBe(0); expect(s.beatInStep).toBe(0); expect(s.withinFirstBeat).toBe(true);
  });
  it('first scale, beat 2 (1000ms)', () => {
    const s = scheduleAt(1000, g);
    expect(s.scaleIndex).toBe(0); expect(s.beatInStep).toBe(2); expect(s.withinFirstBeat).toBe(false);
  });
  it('switches to 2nd scale at 2000ms', () => {
    const s = scheduleAt(2000, g);
    expect(s.stepIndex).toBe(1); expect(s.scaleIndex).toBe(1); expect(s.beatInStep).toBe(0); expect(s.withinFirstBeat).toBe(true);
  });
  it('finished after total', () => {
    expect(scheduleAt(4000, g).finished).toBe(true);
    expect(scheduleAt(3999, g).finished).toBe(false);
  });
});

describe('judgePlay', () => {
  const g = game(1);
  it('E in C major (beat 2) → correct', () => {
    expect(judgePlay(4, 1000, g)).toBe('correct'); // E=4
  });
  it('F# in C major (beat 2, not boundary) → miss', () => {
    expect(judgePlay(6, 1000, g)).toBe('miss'); // F#=6 not in C major, not first beat
  });
  it('F# in G major (2nd scale) → correct', () => {
    expect(judgePlay(6, 2500, g)).toBe('correct');
  });
  it('right after switch (2nd scale, first beat), a C-major-only note is tolerated', () => {
    // F (pc5) is in C major but NOT in G major (G major has F#=6, not F=5).
    expect(g.scaleSets[0].has(5)).toBe(true);
    expect(g.scaleSets[1].has(5)).toBe(false);
    // at 2100ms = 2nd scale, beat 0 (first beat) → tolerated (鳴り残り)
    expect(judgePlay(5, 2100, g)).toBe('tolerated');
    // at 2600ms = 2nd scale, beat 1 (past tolerance) → miss
    expect(judgePlay(5, 2600, g)).toBe('miss');
  });
  it('first scale first beat has no previous → out-of-scale is a miss (no tolerance)', () => {
    expect(judgePlay(6, 100, g)).toBe('miss'); // F# at very start
  });
  it('idle before start / after finish', () => {
    expect(judgePlay(4, -10, g)).toBe('idle');
    expect(judgePlay(4, 99999, g)).toBe('idle');
  });
});

describe('rankFor', () => {
  it('maps accuracy to ranks', () => {
    expect(rankFor(1)).toBe('S');
    expect(rankFor(0.95)).toBe('S');
    expect(rankFor(0.9)).toBe('A');
    expect(rankFor(0.75)).toBe('B');
    expect(rankFor(0.6)).toBe('C');
    expect(rankFor(0.3)).toBe('D');
  });
});
