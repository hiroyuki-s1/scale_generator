import { freqToNote } from './pitch.js';

/**
 * 生 F0 の「音名分類」と「安定音検出」（pure・DOM 非依存・Node でテスト可）。
 *
 * audio/pitchEngine.js は生の F0 だけを流す。これを音楽的に解釈する層をここに置き、
 * チューナーにも将来の **スケールあてクイズ**（「いま G を鳴らした」を判定）にも流用する。
 *
 *  - classifyNote(hz, a4): freqToNote の薄いラッパ（{midi,noteName,octave,label,cents,hz}）。
 *  - StableNoteTracker: F0 サンプル列を食わせ、同じ音が stableMs 以上続いたら「確定」イベントを返す。
 *    無音/別音が releaseMs 続くと確定状態を解放する（次の同音をまた確定できる）。
 *
 * 時刻は呼び出し側が ms で渡す（純粋・テスト可能にするため内部で時計を持たない）。
 */

/**
 * @param {number} hz
 * @param {number} [a4=440]
 * @returns {{midi:number, noteName:string, octave:number, label:string, cents:number, hz:number}|null}
 */
export function classifyNote(hz, a4 = 440) {
  return freqToNote(hz, a4);
}

export class StableNoteTracker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.a4=440]
   * @param {number} [opts.stableMs=250]  同じ音がこの時間続いたら確定
   * @param {number} [opts.releaseMs=350] 無音/不明がこの時間続いたら確定解放
   * @param {number} [opts.minClarity=0]  これ未満の clarity は無視
   */
  constructor(opts = {}) {
    this._a4 = opts.a4 ?? 440;
    this._stableMs = opts.stableMs ?? 250;
    this._releaseMs = opts.releaseMs ?? 350;
    this._minClarity = opts.minClarity ?? 0;
    this.reset();
  }

  reset() {
    this._candMidi = null;   // 現在の候補音(midi)
    this._candSince = 0;     // 候補が始まった時刻
    this._stableMidi = null; // 確定中の音(midi)
    this._lastHeardT = -Infinity;
  }

  setA4(a4) { this._a4 = a4; }
  /** 現在確定中の音名（midi）。未確定は null。 */
  get stableMidi() { return this._stableMidi; }

  /**
   * F0 サンプルを 1 つ投入。新しい音が「確定した瞬間」だけ note オブジェクトを返す（他は null）。
   * @param {number|null} hz 検出周波数（無音/不明は null）
   * @param {number} tMs 時刻(ms・単調増加)
   * @param {number} [clarity=1]
   * @returns {{midi:number, noteName:string, octave:number, label:string, cents:number, hz:number}|null}
   */
  push(hz, tMs, clarity = 1) {
    if (hz != null && hz > 0 && clarity >= this._minClarity) {
      this._lastHeardT = tMs;
      const n = classifyNote(hz, this._a4);
      const midi = n ? n.midi : null;
      if (midi !== this._candMidi) { this._candMidi = midi; this._candSince = tMs; }
      if (midi != null && midi !== this._stableMidi && (tMs - this._candSince) >= this._stableMs) {
        this._stableMidi = midi;
        return n; // 確定イベント（その時点の cents 込み）
      }
    } else if (this._stableMidi != null && (tMs - this._lastHeardT) >= this._releaseMs) {
      this._stableMidi = null;
      this._candMidi = null;
    }
    return null;
  }
}
