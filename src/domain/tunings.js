import { midiToFreq, noteLabelFromMidi, A4 } from './pitch.js';

/**
 * チューニング（オルタネート含む）とスウィートンド/オフセットの定義・helpers（pure）。
 *
 * - 弦配列の並びは constants.js の `TUNING_*` と同じ **1弦(高音)→最終弦(低音)**。
 *   例: ギター標準 [E4,B3,G3,D3,A2,E2] = MIDI [64,59,55,50,45,40]。
 * - オルタネートは「課金で隠さない」方針の中核。MIDI 配列を足すだけで指板表示も追従する。
 * - スウィートンド/オフセットは **弦ごとの目標を ±cents ずらす**補正。平均律＋弦の物理的クセで
 *   「各弦は合っているのに開放和音が濁る」を緩和する（Peterson 看板機能の無料版）。
 *   ※offset 値はごく小さい数¢オーダーの近似プリセット。実機で詰める前提の初期値。
 *
 * すべて純関数（DOM/時刻/乱数なし）。
 */

/**
 * @typedef {Object} Tuning
 * @property {string} id
 * @property {string} name        表示名（日本語）
 * @property {'guitar'|'bass'} instrument
 * @property {number[]} midi      1弦(高音)→最終弦(低音) の MIDI 配列
 */

/** ギターのチューニングプリセット（1弦→6弦 = 高音→低音）。 */
export const GUITAR_TUNINGS = [
  { id: 'standard',    name: 'スタンダード',     instrument: 'guitar', midi: [64, 59, 55, 50, 45, 40] }, // E A D G B E
  { id: 'drop-d',      name: 'ドロップD',         instrument: 'guitar', midi: [64, 59, 55, 50, 45, 38] }, // 6弦 D
  { id: 'dadgad',      name: 'DADGAD',           instrument: 'guitar', midi: [62, 57, 55, 50, 45, 38] },
  { id: 'open-g',      name: 'オープンG',         instrument: 'guitar', midi: [62, 59, 55, 50, 43, 38] }, // D G D G B D
  { id: 'open-d',      name: 'オープンD',         instrument: 'guitar', midi: [62, 57, 54, 50, 45, 38] }, // D A D F# A D
  { id: 'half-down',   name: '半音下げ (E♭)',     instrument: 'guitar', midi: [63, 58, 54, 49, 44, 39] },
  { id: 'whole-down',  name: '1音下げ (D)',       instrument: 'guitar', midi: [62, 57, 53, 48, 43, 38] },
];

/** ベースのチューニングプリセット（1弦→4弦 = 高音→低音）。 */
export const BASS_TUNINGS = [
  { id: 'standard',   name: 'スタンダード',  instrument: 'bass', midi: [43, 38, 33, 28] }, // G D A E
  { id: 'drop-d',     name: 'ドロップD',      instrument: 'bass', midi: [43, 38, 33, 26] }, // 4弦 D
  { id: 'half-down',  name: '半音下げ',       instrument: 'bass', midi: [42, 37, 32, 27] },
];

/**
 * スウィートンド・オフセット（cents、弦配列と同じ並び）。
 * `null` 相当 = フラット（補正なし）。ギターは開放和音のうなりを抑える方向に B/G を僅かに下げる。
 */
export const SWEETENED = {
  // ギター6弦 [E4, B3, G3, D3, A2, E2]
  guitar: [-1, -4, -2, -1, 0, 0],
  // ベース4弦 [G2, D2, A1, E1]
  bass: [-1, -1, 0, 0],
};

/** 補正なし（全弦 0¢）の offset 配列。 */
export function zeroOffsets(stringCount) {
  return new Array(stringCount).fill(0);
}

/** 楽器のチューニング一覧。 */
export function tuningsFor(instrument) {
  return instrument === 'bass' ? BASS_TUNINGS : GUITAR_TUNINGS;
}

/** id からチューニングを引く（無ければ先頭=standard）。 */
export function findTuning(instrument, id) {
  const list = tuningsFor(instrument);
  return list.find(t => t.id === id) || list[0];
}

/** MIDI 配列 → 表示ラベル配列（例 [E4,B3,...]）。 */
export function labelsForMidi(midiArr) {
  return midiArr.map(m => noteLabelFromMidi(m).label);
}

/**
 * 目標周波数（Hz）。offsetCents ぶん平均律目標からずらす。
 * @param {number} midi
 * @param {number} [a4=440]
 * @param {number} [offsetCents=0]
 */
export function targetHz(midi, a4 = A4, offsetCents = 0) {
  return midiToFreq(midi, a4) * Math.pow(2, offsetCents / 1200);
}

/**
 * 検出周波数が、与えたチューニングのどの弦に最も近いかを返す（offset 対応）。
 * cents は **オフセット後の目標**からのズレ（+で高い / −で低い）。
 * @param {number} hz 検出周波数（>0）
 * @param {number[]} midiArr 弦の MIDI 配列
 * @param {object} [opts]
 * @param {number} [opts.a4=440]
 * @param {number[]} [opts.offsets] cents 配列（省略=全0）
 * @returns {{ index:number, midi:number, cents:number, targetHz:number } | null}
 */
export function nearestStringWithOffset(hz, midiArr, opts = {}) {
  if (!(hz > 0) || !Array.isArray(midiArr) || midiArr.length === 0) return null;
  const { a4 = A4, offsets } = opts;
  let best = null;
  for (let i = 0; i < midiArr.length; i++) {
    const off = offsets && Number.isFinite(offsets[i]) ? offsets[i] : 0;
    const tHz = targetHz(midiArr[i], a4, off);
    const cents = 1200 * Math.log2(hz / tHz);
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { index: i, midi: midiArr[i], cents, targetHz: tHz };
    }
  }
  return best;
}

/**
 * エンジンに渡す検出レンジ（最低弦の下〜最高弦の上に余裕を持たせる）。
 * @param {number[]} midiArr
 * @param {number} [a4=440]
 * @returns {{ minHz:number, maxHz:number }}
 */
export function tuningRange(midiArr, a4 = A4) {
  let lo = Infinity, hi = -Infinity;
  for (const m of midiArr) {
    const f = midiToFreq(m, a4);
    if (f < lo) lo = f;
    if (f > hi) hi = f;
  }
  return { minHz: lo * 0.85, maxHz: hi * 1.6 };
}

/**
 * ポリフォニック検出用の弦ごとの目標周波数（Hz）配列（offset 適用済み）。
 * @param {number[]} midiArr
 * @param {object} [opts]
 * @param {number} [opts.a4=440]
 * @param {number[]} [opts.offsets]
 * @returns {number[]}
 */
export function targetsHz(midiArr, opts = {}) {
  const { a4 = A4, offsets } = opts;
  return midiArr.map((m, i) => targetHz(m, a4, offsets && Number.isFinite(offsets[i]) ? offsets[i] : 0));
}
