/**
 * 指板上の度数ポジション総当たりテスト。
 *
 * 全プリセット (15スケール + 16コードトーン) × 全12ルート × 両楽器
 * (Guitar 6弦 / Bass 4弦) × 全フレット (FRET_START..FRET_END) を、
 * 独立した音楽理論の素式 (MIDI → ピッチクラス → 度数) で計算した期待値と
 * computeFretNotes の出力を完全一致で照合する。
 *
 * ねらい:
 *   - スケール / コードトーンの度数定義が音楽理論的に正しいか確認
 *   - 全 (string, fret) 組合せに対し「鳴るべき度数だけが鳴っている」を保証
 *   - 楽器切替 (guitar/bass) で正しいチューニングが使われているか
 *   - 編集→登録→タップで全画面表示 (= computeFretNotes 経由) の正しさを保証
 */
import { describe, it, expect } from 'vitest';
import {
  SCALE_GROUPS, CHORD_GROUPS,
  FRET_START, FRET_END,
  TUNING_GUITAR, TUNING_BASS,
  STRING_LABELS_GUITAR, STRING_LABELS_BASS,
  NOTES,
} from '../../src/domain/constants.js';
import { computeFretNotes } from '../../src/domain/fretboard.js';

// ── ヘルパー: 独立した素式 (テスト対象とは別の純粋計算) ────────────────────

/** MIDI 番号 → Scientific Pitch Notation 文字列 (例: 60 → 'C4') */
function midiToSpn(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return NOTES[pc] + octave;
}

function expectedFretNotes(tuning, rootIndex, degrees) {
  const set = new Set(degrees);
  const out = [];
  for (let s = 0; s < tuning.length; s++) {
    for (let f = FRET_START; f <= FRET_END; f++) {
      const midi = tuning[s] + f;
      const pc = ((midi % 12) + 12) % 12;
      const deg = ((pc - rootIndex) % 12 + 12) % 12;
      if (set.has(deg)) out.push({ string: s, fret: f, midi, degree: deg });
    }
  }
  return out;
}

const sortNotes = arr =>
  arr.slice().sort((a, b) => a.string - b.string || a.fret - b.fret);

// ── 楽器 ──
const INSTRUMENTS = [
  { name: 'guitar', tuning: TUNING_GUITAR, labels: STRING_LABELS_GUITAR },
  { name: 'bass',   tuning: TUNING_BASS,   labels: STRING_LABELS_BASS   },
];

// ── 全プリセット ──
const ALL_PRESETS = [
  ...SCALE_GROUPS.flatMap(g => g.presets.map(p => ({ ...p, kind: 'scale', group: g.label }))),
  ...CHORD_GROUPS.flatMap(g => g.presets.map(p => ({ ...p, kind: 'chord', group: g.label }))),
];

// ════════════════════════════════════════════════════════════════════════
// 1. チューニング/弦ラベルの整合性 (MIDI ↔ Scientific Pitch Notation)
// ════════════════════════════════════════════════════════════════════════

describe('TUNING constants match standard MIDI values', () => {
  it('Guitar: 高音→低音で E4 B3 G3 D3 A2 E2 = [64,59,55,50,45,40]', () => {
    expect(TUNING_GUITAR).toEqual([64, 59, 55, 50, 45, 40]);
  });
  it('Bass: 高音→低音で G2 D2 A1 E1 = [43,38,33,28]', () => {
    expect(TUNING_BASS).toEqual([43, 38, 33, 28]);
  });
});

describe('STRING_LABELS は MIDI 値の Scientific Pitch Notation と一致する', () => {
  INSTRUMENTS.forEach(({ name, tuning, labels }) => {
    it(`${name}: ラベルがMIDI由来の音名と一致`, () => {
      tuning.forEach((midi, i) => {
        expect(labels[i]).toBe(midiToSpn(midi));
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. プリセット定義そのものの音楽理論チェック (R を含む / 0-11 範囲)
// ════════════════════════════════════════════════════════════════════════

describe('全プリセットの度数定義 (theory sanity)', () => {
  ALL_PRESETS.forEach(p => {
    it(`${p.kind}/${p.group}/${p.name}: R(0)を含み、全て 0-11 で重複なし`, () => {
      expect(p.degrees).toContain(0);
      const set = new Set(p.degrees);
      expect(set.size).toBe(p.degrees.length); // 重複なし
      p.degrees.forEach(d => {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(12);
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3. 総当たり: 全プリセット × 全12ルート × 両楽器 × 全弦・全フレットで
//    出力が期待値と完全一致
// ════════════════════════════════════════════════════════════════════════

describe('指板ポジション総当たり (preset × key × instrument)', () => {
  ALL_PRESETS.forEach(preset => {
    INSTRUMENTS.forEach(({ name: inst, tuning }) => {
      for (let root = 0; root < 12; root++) {
        const keyName = NOTES[root];
        it(`${preset.kind}/${preset.name} [${inst}/${keyName}]: 全ポジション一致`, () => {
          const expected = expectedFretNotes(tuning, root, preset.degrees);
          const actual = computeFretNotes({
            rootIndex: root,
            activeDegrees: new Set(preset.degrees),
            mask: { enabled: false, min: FRET_START, max: FRET_END },
            instrument: inst,
          });
          expect(sortNotes(actual)).toEqual(sortNotes(expected));
        });
      }
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// 4. グラウンドトゥルース・スポットチェック
//    (有名な代表ポジションが期待通りに含まれる)
// ════════════════════════════════════════════════════════════════════════

describe('ground truth: well-known positions', () => {
  it('A Minor Penta (guitar): 6弦5フレット=A2 (root), 6弦8フレット=C3 (m3)', () => {
    const notes = computeFretNotes({
      rootIndex: 9, // A
      activeDegrees: new Set([0, 3, 5, 7, 10]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'guitar',
    });
    // 6弦 = index 5 (低E弦)
    const root_5_5 = notes.find(n => n.string === 5 && n.fret === 5);
    expect(root_5_5).toBeDefined();
    expect(root_5_5.degree).toBe(0);
    expect(root_5_5.midi).toBe(45); // A2
    expect(midiToSpn(root_5_5.midi)).toBe('A2');
    const m3_5_8 = notes.find(n => n.string === 5 && n.fret === 8);
    expect(m3_5_8).toBeDefined();
    expect(m3_5_8.degree).toBe(3); // m3
    expect(midiToSpn(m3_5_8.midi)).toBe('C3');
  });

  it('C maj7 (guitar): 5弦3フレット=C3 (root), 5弦14フレット=B3 (M7)', () => {
    const notes = computeFretNotes({
      rootIndex: 0, // C
      activeDegrees: new Set([0, 4, 7, 11]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'guitar',
    });
    // 5弦 = index 4 (A2弦)
    const c_4_3 = notes.find(n => n.string === 4 && n.fret === 3);
    expect(c_4_3).toBeDefined();
    expect(c_4_3.degree).toBe(0);
    expect(midiToSpn(c_4_3.midi)).toBe('C3');
    const b_4_14 = notes.find(n => n.string === 4 && n.fret === 14);
    expect(b_4_14).toBeDefined();
    expect(b_4_14.degree).toBe(11); // M7
    expect(midiToSpn(b_4_14.midi)).toBe('B3');
  });

  it('E1 root (bass): 4弦0フレット=E1, 4弦12フレット=E2 (オクターブ上)', () => {
    const notes = computeFretNotes({
      rootIndex: 4, // E
      activeDegrees: new Set([0]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'bass',
    });
    // 4弦 = index 3 (E1弦)
    const root0 = notes.find(n => n.string === 3 && n.fret === 0);
    expect(root0).toBeDefined();
    expect(midiToSpn(root0.midi)).toBe('E1');
    const root12 = notes.find(n => n.string === 3 && n.fret === 12);
    expect(root12).toBeDefined();
    expect(midiToSpn(root12.midi)).toBe('E2');
  });

  it('C Ionian (guitar): メジャースケール7音 (C D E F G A B) が全オクターブで揃う', () => {
    const notes = computeFretNotes({
      rootIndex: 0,
      activeDegrees: new Set([0, 2, 4, 5, 7, 9, 11]),
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      instrument: 'guitar',
    });
    const pitchClasses = new Set(notes.map(n => ((n.midi % 12) + 12) % 12));
    expect(pitchClasses).toEqual(new Set([0, 2, 4, 5, 7, 9, 11]));
  });
});
