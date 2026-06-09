import { NOTES } from './constants.js';

/**
 * チューナー用のピッチ検出ドメイン（pure・DOM 非依存・Node でテスト可）。
 *
 * - F0 推定は YIN（de Cheveigné & Kawahara 2002）の純 JS 実装。
 *   時間波形を直接受け取り、自己相関の累積平均正規化差分でオクターブ誤りを抑える。
 * - ベース最低弦 E1(41.2Hz) まで届かせるため、検出レンジ（minHz/maxHz）を引数で絞る。
 *   呼び出し側はバッファ長を「最低周波数の周期×2以上」確保すること（E1 なら ~2200 サンプル）。
 *
 * すべて純関数。乱数・時刻・DOM を使わない。
 */

export const A4 = 440;

/**
 * YIN による単音 F0 推定。
 * @param {Float32Array} buf 時間波形（-1..1 正規化済み・AnalyserNode.getFloatTimeDomainData 等）
 * @param {number} sampleRate サンプリングレート（Hz）
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.12] 絶対閾値（小さいほど厳しい。0.1〜0.15 が定番）
 * @param {number} [opts.minHz=38]  検出下限（これ以下の周期は探索しない＝サブハーモニクス抑制）
 * @param {number} [opts.maxHz=1200] 検出上限
 * @param {number} [opts.rmsGate=0.005] これ未満の RMS は「無音」として null を返す
 * @returns {{ hz:number, clarity:number, rms:number } | null} 検出不能時 null
 */
export function detectPitchYIN(buf, sampleRate, opts = {}) {
  const { threshold = 0.12, minHz = 38, maxHz = 1200, rmsGate = 0.005 } = opts;
  const SIZE = buf.length;
  if (SIZE < 4 || !(sampleRate > 0)) return null;

  // 1) 入力レベル（RMS）ゲート。無音/極小は早期 return。
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < rmsGate) return null;

  // 探索する周期(tau)の範囲。tauMax は「バッファに 2 周期入る」上限でも頭打ちにする。
  const tauMax = Math.min(SIZE - 2, Math.floor(sampleRate / minHz));
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  if (tauMax <= tauMin) return null;

  // 比較窓 W：buf[j] と buf[j+tau] を tau=tauMax まで取れるよう W = SIZE - tauMax。
  const W = SIZE - tauMax;
  if (W < 2) return null;

  // 2) 差分関数 d(tau)（tau は 1..tauMax を素直に計算 → 累積正規化を正しく出すため）。
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // 3) 累積平均正規化差分 d'(tau) = d(tau) * tau / Σ_{1..tau} d。
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // 4) 絶対閾値：レンジ内で初めて threshold を下回る谷を採用（その後の局所最小まで追う）。
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  // 閾値を割らなければ、レンジ内の最小値（最も周期的）を保険で採用。
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    // それでも明らかに非周期的なら検出失敗扱い。
    if (cmnd[best] > 0.5) return null;
    tauEst = best;
  }

  // 5) 放物線補間で tau をサブサンプル精度に。
  let betterTau = tauEst;
  if (tauEst > tauMin && tauEst < tauMax) {
    const s0 = cmnd[tauEst - 1];
    const s1 = cmnd[tauEst];
    const s2 = cmnd[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEst + (s2 - s0) / denom;
  }

  const hz = sampleRate / betterTau;
  if (!(hz >= minHz && hz <= maxHz)) return null;
  return { hz, clarity: Math.max(0, 1 - cmnd[tauEst]), rms };
}

/**
 * 周波数 → 最寄り平均律音。
 * @param {number} hz 周波数（>0）
 * @param {number} [a4=440] 基準 A4
 * @returns {{ midi:number, noteName:string, octave:number, label:string, cents:number, hz:number } | null}
 *   cents は最寄り音からのズレ（+ で高い / − で低い、-50〜+50）。
 */
/**
 * MIDI ノート番号 → 音名/オクターブ/表示ラベル（例: 64 → E4）。
 * @param {number} midi
 * @returns {{ noteName:string, octave:number, label:string }}
 */
export function noteLabelFromMidi(midi) {
  const noteName = NOTES[(((midi % 12) + 12) % 12)];
  const octave = Math.floor(midi / 12) - 1;       // MIDI 60 = C4
  return { noteName, octave, label: `${noteName}${octave}` };
}

/**
 * MIDI ノート番号 → 周波数(Hz)。基準 A4 を変えると全体が移調する。
 * @param {number} midi
 * @param {number} [a4=440]
 */
export function midiToFreq(midi, a4 = A4) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToNote(hz, a4 = A4) {
  if (!(hz > 0) || !(a4 > 0)) return null;
  const midiFloat = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const { noteName, octave, label } = noteLabelFromMidi(midi);
  return { midi, noteName, octave, label, cents, hz };
}

/**
 * 検出周波数が、与えたチューニング（開放弦 MIDI 配列）のどの弦に最も近いかを返す。
 * 弦ハイライト用。cents は対象弦からのズレ（+ で高い / − で低い）。
 * @param {number} hz 周波数（>0）
 * @param {number[]} tuning 開放弦 MIDI 番号の配列（例: TUNING_GUITAR）
 * @param {number} [a4=440]
 * @returns {{ index:number, midi:number, cents:number } | null}
 */
export function nearestOpenString(hz, tuning, a4 = A4) {
  if (!(hz > 0) || !Array.isArray(tuning) || tuning.length === 0) return null;
  const midiFloat = 69 + 12 * Math.log2(hz / a4);
  let best = null;
  for (let i = 0; i < tuning.length; i++) {
    const cents = (midiFloat - tuning[i]) * 100;
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { index: i, midi: tuning[i], cents };
    }
  }
  return best;
}
