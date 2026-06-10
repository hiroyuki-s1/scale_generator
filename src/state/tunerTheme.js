import { getUser, getSettings, patchSettings } from './cloudSync.js';

/**
 * チューナーの表示テーマ（'dark' | 'light'）の保存層。
 *  - 'dark'  … 暖色ダーク（既定。チューナー没入型）
 *  - 'light' … 本体（スケール設定画面）と同じクリーム/オレンジのライト
 *
 * localStorage に常時保存。ログイン時は D1 (user_settings.settings.tunerTheme) にも同期。
 */

const KEY = 'sg.v1.tunerTheme';

/** 正規化（'light' 以外は 'dark'）。 */
export function normalizeTheme(t) {
  return t === 'light' ? 'light' : 'dark';
}

export function loadTheme() {
  try { return normalizeTheme(localStorage.getItem(KEY)); } catch { return 'dark'; }
}

export function saveThemeLocal(t) {
  try { localStorage.setItem(KEY, normalizeTheme(t)); } catch { /* private mode */ }
}

/** ログイン中ならサーバのテーマを取得（無ければ null）。 */
export async function pullTheme() {
  if (!getUser()) return null;
  try {
    const s = await getSettings();
    return s && (s.tunerTheme === 'light' || s.tunerTheme === 'dark') ? s.tunerTheme : null;
  } catch (e) { console.error('tunerTheme pull failed', e); return null; }
}

/** ログイン中なら D1 設定へマージ保存。失敗は握りつぶす。 */
export async function pushTheme(t) {
  if (!getUser()) return;
  try { await patchSettings({ tunerTheme: normalizeTheme(t) }); }
  catch (e) { console.error('tunerTheme push failed', e); }
}
