import { SWEETENED } from '../domain/tunings.js';
import { getUser, getSettings, patchSettings } from './cloudSync.js';

/**
 * チューナーの「甘い調弦」オフセット（弦ごと ±cents）の保存層。
 *
 *  - 常に localStorage に保存（オフライン・未ログインでも動く）。
 *  - ログイン時は D1 (user_settings.settings.tunerOffsets) にも同期（ユーザーごと）。
 *  - 既定値は domain/tunings.js の SWEETENED プリセット（未編集時はこれが使われる）。
 *
 * 形: { guitar: number[6], bass: number[4] }（弦の並びは constants の TUNING_* と同じ）。
 * 純粋な検証/クランプ関数（sanitizeOffsetsMap / clampOffset）は単体テスト対象。
 */

const KEY = 'sg.v1.tunerOffsets';
export const OFFSET_MAX = 25; // ±この cents まで（編集UIの範囲）
const LENS = { guitar: 6, bass: 4 };

/** 1値を整数 [-OFFSET_MAX, OFFSET_MAX] にクランプ（不正は 0）。 */
export function clampOffset(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, v));
}

/** 既定（SWEETENED のクローン）。 */
export function defaultOffsets() {
  return { guitar: [...SWEETENED.guitar], bass: [...SWEETENED.bass] };
}

/** 任意入力を {guitar:[6], bass:[4]} の正規形へ（長さ補正・クランプ・既定フォールバック）。 */
export function sanitizeOffsetsMap(raw) {
  const def = defaultOffsets();
  if (!raw || typeof raw !== 'object') return def;
  const out = {};
  for (const instr of Object.keys(LENS)) {
    const len = LENS[instr];
    const src = Array.isArray(raw[instr]) ? raw[instr] : def[instr];
    const arr = new Array(len);
    for (let i = 0; i < len; i++) arr[i] = clampOffset(src[i] != null ? src[i] : def[instr][i]);
    out[instr] = arr;
  }
  return out;
}

/** localStorage から読み込み（無ければ既定）。 */
export function loadOffsets() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return sanitizeOffsetsMap(v);
  } catch { return defaultOffsets(); }
}

/** localStorage へ保存（同期は別途 pushOffsets）。 */
export function saveOffsetsLocal(map) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizeOffsetsMap(map))); } catch { /* private mode */ }
}

/** ログイン中ならサーバの tunerOffsets を取得（無ければ null）。失敗は null。 */
export async function pullOffsets() {
  if (!getUser()) return null;
  try {
    const s = await getSettings();
    return s && s.tunerOffsets ? sanitizeOffsetsMap(s.tunerOffsets) : null;
  } catch (e) { console.error('tunerOffsets pull failed', e); return null; }
}

/** ログイン中なら D1 設定へマージ保存（他の設定キーは保持）。失敗は握りつぶす。 */
export async function pushOffsets(map) {
  if (!getUser()) return;
  try { await patchSettings({ tunerOffsets: sanitizeOffsetsMap(map) }); }
  catch (e) { console.error('tunerOffsets push failed', e); }
}
