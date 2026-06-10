import { frontendApiFromPublishableKey } from '../domain/clerkPublishableKey.js';
import { snapshotForStorage, sanitizeStoredState } from './persist.js';

/**
 * クラウド連携（Clerk 認証 + ソングブック API）。
 *
 * 方針（CLAUDE.md「src/ ランタイム依存ゼロ」を尊重）:
 *   - ClerkJS は npm バンドルせず CDN から動的 <script> 読込（公開鍵から Frontend API 導出）。
 *   - Publishable key は /api/public-config から取得（単一ソース。ハードコードしない）。
 *   - 認証状態が変わると購読者へ通知。fetch は session トークンを Bearer 付与。
 *
 * 落とさない方針（EXCEPTION_HANDLING.md）: Clerk 読込失敗時もアプリ本体は継続。
 */

let clerk = null;
let publishableKey = null;
let loadError = null;
const listeners = new Set();

function notify() {
  const user = getUser();
  listeners.forEach(fn => { try { fn(user); } catch (e) { console.error('auth listener error', e); } });
}

/** 認証状態の購読。即時に現在値でも一度呼ぶ。解除関数を返す。 */
export function onAuthChange(fn) {
  listeners.add(fn);
  fn(getUser());
  return () => listeners.delete(fn);
}

/** 現在のユーザー（未ログイン/未ロードは null）。 */
export function getUser() {
  return clerk?.user ?? null;
}

export function isClerkReady() { return clerk != null; }
export function getLoadError() { return loadError; }

/** Clerk を初期化する。失敗しても throw せず loadError に残す（本体は継続）。 */
export async function initCloud() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/public-config`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`public-config ${res.status}`);
    const cfg = await res.json();
    publishableKey = cfg.clerkPublishableKey;
    const host = frontendApiFromPublishableKey(publishableKey);
    if (!publishableKey || !host) throw new Error('publishable key 未設定');

    await loadClerkScript(publishableKey, host);
    clerk = window.Clerk;
    await clerk.load();
    clerk.addListener(() => notify());
    notify();
    // 起動イベント記録 (失敗しても無視・本体に影響しない)
    recordLaunch();
    return clerk;
  } catch (e) {
    // Clerk が落ちても起動記録は試みる (匿名 ID で記録される)
    recordLaunch();
    loadError = e;
    console.error('Clerk 初期化に失敗しました（ログイン機能のみ無効・本体は継続）:', e);
    notify();
    return null;
  }
}

function loadClerkScript(pk, host) {
  if (window.Clerk) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-clerk-publishable-key', pk);
    s.src = `https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Clerk SDK の読み込みに失敗')));
    document.head.appendChild(s);
  });
}

// ── 認証 UI（Clerk プリビルト） ────────────────────────────────────────
export function openSignIn()  { clerk?.openSignIn?.(); }
export function openSignUp()  { clerk?.openSignUp?.(); }
export function mountUserButton(el, opts = {}) {
  if (clerk && el) clerk.mountUserButton(el, { afterSignOutUrl: import.meta.env.BASE_URL, ...opts });
}
export function unmountUserButton(el) { if (clerk && el) clerk.unmountUserButton?.(el); }
export function signOut()     { return clerk?.signOut?.(); }

// ── 認証付き fetch ─────────────────────────────────────────────────────
async function getToken() {
  try { return clerk?.session ? await clerk.session.getToken() : null; }
  catch { return null; }
}

/** Bearer トークンを付けて /api を叩く。401 は一度だけトークン再取得で再試行。 */
export async function authedFetch(path, options = {}) {
  const url = `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
  const build = async () => {
    const headers = { ...(options.headers || {}) };
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(url, { ...options, headers });
  };
  let res = await build();
  if (res.status === 401) res = await build(); // トークン失効 → 再取得して1回だけ再試行
  return res;
}

async function asJsonOrThrow(res) {
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

// ── ソングブック（D1）スナップショット ⇄ ローカル状態 ────────────────────
// ローカルの保存形式（localStorage と同一）を再利用し、版管理 "v" を内包する。
const SCHEMA_V = 1;

/** store の saved[] をクラウド保存用 JSON（{v, scales}）にする。 */
export function songfileToCloud(state) {
  return { v: SCHEMA_V, scales: snapshotForStorage(state).saved };
}

/** クラウドの {v, scales} を store.saved 形式（Set 等を復元）に戻す。 */
export function cloudToSongfile(cloudScales) {
  const arr = Array.isArray(cloudScales?.scales) ? cloudScales.scales : [];
  return sanitizeStoredState({ saved: arr }).saved;
}

export async function listSongbooks() {
  return asJsonOrThrow(await authedFetch('api/songbooks'));
}
export async function getSongbook(publicId) {
  return asJsonOrThrow(await authedFetch(`api/songbooks/${encodeURIComponent(publicId)}`));
}
export async function createSongbook(name, state) {
  return asJsonOrThrow(await authedFetch('api/songbooks', {
    method: 'POST', body: JSON.stringify({ name, scales: songfileToCloud(state) }),
  }));
}
export async function updateSongbook(publicId, name, state) {
  return asJsonOrThrow(await authedFetch(`api/songbooks/${encodeURIComponent(publicId)}`, {
    method: 'PUT', body: JSON.stringify({ name, scales: songfileToCloud(state) }),
  }));
}
export async function deleteSongbook(publicId) {
  return asJsonOrThrow(await authedFetch(`api/songbooks/${encodeURIComponent(publicId)}`, {
    method: 'DELETE',
  }));
}

// ── 共有（無期限・自動生成・public_id ベース） ───────────────────────
// ソングブックの public_id（推測不能な UUID）をそのまま共有キーに使う（unlisted リンク）。
// 共有 URL は `?share=<public_id>` の 1 本で、ソングブックが存在する限り無期限。
// 別途の「共有を作成」操作・期限・取り消し（管理）は不要。
/** 共有の受け取り（公開・認証不要）。不正/不存在/論理削除は 404。 */
export async function getSharedSongbook(publicId) {
  return asJsonOrThrow(await authedFetch(`api/public/songbooks/${encodeURIComponent(publicId)}`));
}
/**
 * レガシー共有（旧 shares テーブル・短い share_id）のフォールバック受け取り。
 * 既に配布済みの `?share=<短いID>` リンクを壊さないために残す（公開・認証不要）。
 */
export async function getLegacyShare(shareId) {
  return asJsonOrThrow(await authedFetch(`api/shares/${encodeURIComponent(shareId)}`));
}

// ── プロフィール（表示名・migration 0005） ───────────────────────────
/**
 * 自分の表示名を取得。未設定（オンボーディング未完了）は { displayName: null }。
 * 未ログイン/失敗時は throw（呼び出し側で握りつぶしてモーダルを出さない判断に使う）。
 */
export async function getProfile() {
  return asJsonOrThrow(await authedFetch('api/profile'));
}
/** 表示名を設定/更新（upsert）。{ ok, displayName } を返す。検証エラーは 400 で throw。 */
export async function setProfile(displayName) {
  return asJsonOrThrow(await authedFetch('api/profile', {
    method: 'PUT', body: JSON.stringify({ displayName }),
  }));
}

// ── ユーザー設定（D1 user_settings の汎用 JSON）─────────────────────────
/** 現在の設定オブジェクトを取得（未保存はサーバ既定）。未ログイン/失敗は throw。 */
export async function getSettings() {
  return asJsonOrThrow(await authedFetch('api/settings'));
}
/** 設定オブジェクト全体を保存（upsert・置換）。部分更新は patchSettings を使う。 */
export async function putSettings(obj) {
  return asJsonOrThrow(await authedFetch('api/settings', {
    method: 'PUT', body: JSON.stringify(obj),
  }));
}
/** 設定を部分更新（get→merge→put）。他のキーは保持。プリファレンス用途。 */
export async function patchSettings(partial) {
  let cur = {};
  try { cur = await getSettings(); } catch { cur = {}; }
  const merged = { ...(cur && typeof cur === 'object' ? cur : {}), ...partial };
  return putSettings(merged);
}

// ── 行動記録 (起動イベント・migration 0004) ─────────────────────────
const ANON_ID_KEY = 'sg.v1.anonId';
const LAUNCH_SENT_KEY = 'sg.v1.launchSentAt';
// 同一セッションで二重送信しない (タブ復帰や軽い再描画で何度も打たない)。
const LAUNCH_DEDUPE_MS = 6 * 60 * 60 * 1000; // 6 時間

function getOrCreateAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      // crypto.randomUUID は十分新しい環境で利用可能。fallback で 16 進ランダム。
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'anon-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch { return null; }
}

/** 起動イベントを 1 回だけ送る (LAUNCH_DEDUPE_MS 以内なら省略)。失敗しても無視。 */
export async function recordLaunch() {
  try {
    const last = Number(localStorage.getItem(LAUNCH_SENT_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last < LAUNCH_DEDUPE_MS) return;
    const body = {
      anon_id: getOrCreateAnonId(),
      tz_offset: -new Date().getTimezoneOffset(),
    };
    await authedFetch('api/events/launch', { method: 'POST', body: JSON.stringify(body) });
    localStorage.setItem(LAUNCH_SENT_KEY, String(Date.now()));
  } catch { /* 起動を阻害しない */ }
}
