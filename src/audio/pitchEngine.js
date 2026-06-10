import { pitchWorkletUrl } from './workletUrl.js';

/**
 * 再利用可能な低レイテンシ・ピッチ検出エンジン。
 *
 *  - getUserMedia の MediaStream を受け取り、AudioContext → AudioWorkletNode を組み、
 *    オーディオスレッドで F0 を推定して購読者へ生の `{hz,clarity,rms,t}` を流す。
 *  - **音名判定（freqToNote / nearestOpenString）はここでは行わない**。
 *    consumer（チューナー / 将来のスケール採点）が domain 関数で解釈する。
 *  - 複数購読可能。AudioContext はエンジンが所有・破棄する。MediaStream の停止は
 *    呼び出し側の責務（取得元が握っているため）。
 *
 * 依存ゼロ（Web 標準 AudioWorklet のみ）。AudioWorklet 非対応環境では isSupported()=false。
 *
 * @typedef {Object} PitchSample
 * @property {number|null} hz   推定 F0（検出不能は null）
 * @property {number} clarity   0..1（1 - CMNDF最小値）
 * @property {number} rms
 * @property {number} t         AudioContext currentTime（秒）
 */

/** AudioWorklet が使えるか（DOM 文脈で判定）。 */
export function isPitchEngineSupported() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return !!(Ctx && Ctx.prototype && 'audioWorklet' in Ctx.prototype);
}

/**
 * @param {Object} cfg
 * @param {number} cfg.minHz
 * @param {number} cfg.maxHz
 * @param {number} [cfg.hopMs=15]
 * @param {number} [cfg.targetRate=12000]
 * @param {number} [cfg.threshold=0.12]
 * @param {number} [cfg.rmsGate=0.005]
 */
export function createPitchEngine(cfg) {
  const {
    minHz, maxHz, hopMs = 15, targetRate = 12000, threshold = 0.12, rmsGate = 0.005,
  } = cfg;

  let audioCtx = null;
  let srcNode = null;
  let workletNode = null;
  let started = false;
  const pitchSubs = new Set();  // mono: {hz,clarity,rms,t}
  const polySubs = new Set();   // poly: {strings:[...], t}

  function emit(subs, payload) {
    for (const cb of subs) {
      try { cb(payload); } catch (err) { console.error('pitchEngine subscriber threw', err); }
    }
  }

  function route(data) {
    if (data && data.type === 'poly') emit(polySubs, data);
    else emit(pitchSubs, data);
  }

  /**
   * マイクの MediaStream で計測を開始する。ユーザー操作直後に呼ぶこと（iOS の resume 制約）。
   * @param {MediaStream} mediaStream
   */
  async function start(mediaStream) {
    if (started) return;
    if (!isPitchEngineSupported()) throw new Error('AudioWorklet unsupported');
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    await audioCtx.resume();                 // iOS: ジェスチャ直後に resume
    await audioCtx.audioWorklet.addModule(pitchWorkletUrl);
    srcNode = audioCtx.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioCtx, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,            // 解析専用（destination へ繋がない＝ハウリング回避）
      processorOptions: { minHz, maxHz, hopMs, targetRate, threshold, rmsGate },
    });
    workletNode.port.onmessage = (e) => route(e.data);
    srcNode.connect(workletNode);
    started = true;
  }

  /**
   * mono の F0 サンプルを購読。
   * @param {(s: PitchSample) => void} cb
   * @returns {() => void} 解除関数
   */
  function onPitch(cb) {
    pitchSubs.add(cb);
    return () => pitchSubs.delete(cb);
  }

  /**
   * poly（全弦ズレ）の検出結果を購読。
   * @param {(p: { strings: Array, t: number }) => void} cb
   * @returns {() => void} 解除関数
   */
  function onPoly(cb) {
    polySubs.add(cb);
    return () => polySubs.delete(cb);
  }

  /** 検出レンジを変更（AudioContext は破棄しない＝楽器切替が軽い）。 */
  function setRange(nextMinHz, nextMaxHz) {
    if (workletNode) {
      workletNode.port.postMessage({ type: 'config', minHz: nextMinHz, maxHz: nextMaxHz });
    }
  }

  /** 検出モードを切替（'mono' | 'poly'）。 */
  function setMode(mode) {
    if (workletNode) workletNode.port.postMessage({ type: 'mode', mode });
  }

  /** poly 用の弦ごと目標周波数（Hz 配列）を設定。 */
  function setTargets(targets) {
    if (workletNode) workletNode.port.postMessage({ type: 'targets', targets });
  }

  /** 計測停止と AudioContext 破棄（MediaStream の track 停止は呼び出し側）。 */
  function stop() {
    started = false;
    if (srcNode) { try { srcNode.disconnect(); } catch { /* noop */ } srcNode = null; }
    if (workletNode) { try { workletNode.disconnect(); } catch { /* noop */ } workletNode.port.onmessage = null; workletNode = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    pitchSubs.clear();
    polySubs.clear();
  }

  return {
    start, onPitch, onPoly, setRange, setMode, setTargets, stop,
    isSupported: isPitchEngineSupported,
  };
}
