import { scalePitchClassSet } from './scalePractice.js';

/**
 * スケールトレーニング・ゲームの進行スケジューリングと採点（pure・DOM/時刻なし）。
 *
 *  - ソングファイルのスケール進行を **テンポ同期**で進める。1スケール = `beatsPerScale`(既定4)拍。
 *  - 進行は `loops` 回くり返す。
 *  - 採点（弾いた音1つ＝1イベント、pitch class と時刻 ms）:
 *      現在スケールに含まれる音      → 'correct'
 *      含まれない音               → 'miss'
 *      ただし **切替直後の1拍だけ**、直前スケールに含まれる音は 'tolerated'（前の音の鳴り残り。減点なし）
 *
 * 時刻は「STARTからの経過 ms」を外から渡す純粋設計（テスト可能）。
 */

/**
 * @param {object} cfg
 * @param {{rootIndex:number, activeDegrees:Set<number>|number[]}[]} cfg.scales 進行（ソングファイル順）
 * @param {number} cfg.tempo BPM
 * @param {number} cfg.loops くり返し回数（>=1）
 * @param {number} [cfg.beatsPerScale=4]
 */
export function buildGame({ scales, tempo, loops, beatsPerScale = 4 }) {
  const list = Array.isArray(scales) ? scales : [];
  const beatMs = 60000 / Math.max(1, tempo);
  const scaleCount = list.length;
  const lp = Math.max(1, loops | 0);
  const totalSteps = scaleCount * lp;
  const totalBeats = totalSteps * beatsPerScale;
  return {
    beatMs,
    beatsPerScale,
    scaleCount,
    loops: lp,
    totalSteps,
    totalBeats,
    totalMs: totalBeats * beatMs,
    scaleSets: list.map(s => scalePitchClassSet(s.rootIndex, s.activeDegrees)),
    scales: list,
  };
}

/**
 * 経過 ms における進行状態。
 * @returns {{finished:boolean, beforeStart:boolean, beatIndex:number, stepIndex:number,
 *            scaleIndex:number, beatInStep:number, withinFirstBeat:boolean}}
 */
export function scheduleAt(tMs, game) {
  if (game.scaleCount === 0) {
    return { finished: true, beforeStart: false, beatIndex: 0, stepIndex: 0, scaleIndex: 0, beatInStep: 0, withinFirstBeat: false };
  }
  if (tMs < 0) {
    return { finished: false, beforeStart: true, beatIndex: -1, stepIndex: 0, scaleIndex: 0, beatInStep: 0, withinFirstBeat: false };
  }
  const beatIndex = Math.floor(tMs / game.beatMs);
  const finished = beatIndex >= game.totalBeats;
  const clamped = Math.min(beatIndex, game.totalBeats - 1);
  const stepIndex = Math.floor(clamped / game.beatsPerScale);
  const scaleIndex = stepIndex % game.scaleCount;
  const beatInStep = clamped % game.beatsPerScale;
  return {
    finished, beforeStart: false, beatIndex, stepIndex, scaleIndex, beatInStep,
    withinFirstBeat: beatInStep === 0, // 切替直後の1拍
  };
}

/**
 * 弾いた音1つ（pitch class, 経過ms）を判定。
 * @returns {'correct'|'miss'|'tolerated'|'idle'}
 */
export function judgePlay(pc, tMs, game) {
  const s = scheduleAt(tMs, game);
  if (s.beforeStart || s.finished || game.scaleCount === 0) return 'idle';
  const pcn = (((pc % 12) + 12) % 12);
  if (game.scaleSets[s.scaleIndex].has(pcn)) return 'correct';
  // 切替直後1拍だけ、直前スケールの音は許容（鳴り残り）。
  if (s.withinFirstBeat && s.stepIndex > 0) {
    const prev = game.scaleSets[(s.stepIndex - 1) % game.scaleCount];
    if (prev && prev.has(pcn)) return 'tolerated';
  }
  return 'miss';
}

/** 正答率(0..1) → ランク。 */
export function rankFor(accuracy) {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.70) return 'B';
  if (accuracy >= 0.50) return 'C';
  return 'D';
}
