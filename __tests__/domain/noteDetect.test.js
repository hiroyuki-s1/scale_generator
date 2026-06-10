import { describe, it, expect } from 'vitest';
import { classifyNote, StableNoteTracker } from '../../src/domain/noteDetect.js';
import { midiToFreq } from '../../src/domain/pitch.js';

describe('classifyNote', () => {
  it('classifies A4=440 → A4 / midi 69 / 0 cents', () => {
    const n = classifyNote(440);
    expect(n.label).toBe('A4');
    expect(n.midi).toBe(69);
    expect(n.cents).toBe(0);
  });
  it('respects a4 reference', () => {
    expect(classifyNote(442, 442).cents).toBe(0);
  });
});

describe('StableNoteTracker', () => {
  const A4 = midiToFreq(69, 440); // 440

  it('confirms a note only after it persists for stableMs', () => {
    const tr = new StableNoteTracker({ stableMs: 250 });
    let ev = null;
    // 同じ A4 を 0,50,100,150,200ms → まだ確定しない（<250ms）
    for (const t of [0, 50, 100, 150, 200]) {
      const r = tr.push(A4, t);
      if (r) ev = r;
    }
    expect(ev).toBeNull();
    expect(tr.stableMidi).toBeNull();
    // 250ms で確定
    const r = tr.push(A4, 250);
    expect(r).not.toBeNull();
    expect(r.midi).toBe(69);
    expect(tr.stableMidi).toBe(69);
  });

  it('does not re-emit while the same note continues', () => {
    const tr = new StableNoteTracker({ stableMs: 100 });
    tr.push(A4, 0); tr.push(A4, 100); // 確定
    const again = tr.push(A4, 300);
    expect(again).toBeNull();
    expect(tr.stableMidi).toBe(69);
  });

  it('resets the candidate timer when the note changes', () => {
    const tr = new StableNoteTracker({ stableMs: 200 });
    const C4 = midiToFreq(60, 440);
    tr.push(A4, 0); tr.push(A4, 150);   // A4 候補 150ms（未確定）
    const sw = tr.push(C4, 160);         // 別音に切替 → タイマーリセット
    expect(sw).toBeNull();
    expect(tr.push(C4, 200)).toBeNull(); // C4 はまだ 40ms
    const conf = tr.push(C4, 360);       // C4 が 200ms 継続 → 確定
    expect(conf.midi).toBe(60);
  });

  it('releases the stable note after silence for releaseMs, allowing the same note to re-confirm', () => {
    const tr = new StableNoteTracker({ stableMs: 100, releaseMs: 200 });
    tr.push(A4, 0); tr.push(A4, 100);    // 確定
    expect(tr.stableMidi).toBe(69);
    tr.push(null, 150);                   // 無音
    tr.push(null, 360);                   // 200ms 経過 → 解放
    expect(tr.stableMidi).toBeNull();
    // 再び A4 を鳴らすと再確定できる
    tr.push(A4, 400);
    const re = tr.push(A4, 520);
    expect(re).not.toBeNull();
    expect(re.midi).toBe(69);
  });

  it('ignores samples below minClarity', () => {
    const tr = new StableNoteTracker({ stableMs: 50, minClarity: 0.5 });
    expect(tr.push(A4, 0, 0.2)).toBeNull();
    expect(tr.push(A4, 100, 0.2)).toBeNull();
    expect(tr.stableMidi).toBeNull();
    // clarity 十分なら確定
    tr.push(A4, 200, 0.9);
    expect(tr.push(A4, 300, 0.9).midi).toBe(69);
  });

  it('reset() clears state', () => {
    const tr = new StableNoteTracker({ stableMs: 50 });
    tr.push(A4, 0); tr.push(A4, 100);
    expect(tr.stableMidi).toBe(69);
    tr.reset();
    expect(tr.stableMidi).toBeNull();
  });
});
