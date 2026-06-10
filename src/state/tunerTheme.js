import { getUser, getSettings, patchSettings } from './cloudSync.js';

/**
 * チューナーの表示テーマ（'dark' | 'light'）の保存層。
 *  - 'light' … 本体（スケール設定画面）と同じクリーム/オレンジのライト（**既定**・本体と一体）
 *  - 'dark'  … 暖色ダーク（チューナー没入型）
 *
 * localStorage に常時保存。ログイン時は D1 (user_settings.settings.tunerTheme) にも同期。
 */

const KEY = 'sg.v1.tunerTheme';
const DEFAULT_THEME = 'light';

/** 'dark' を明示選択 → 'dark'、それ以外（'light'/不正）→ 'light'。 */
export function normalizeTheme(t) {
  return t === 'dark' ? 'dark' : 'light';
}

/** 保存値があればそれ、無ければ既定（ライト）。 */
export function loadTheme() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* private mode */ }
  return DEFAULT_THEME;
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
