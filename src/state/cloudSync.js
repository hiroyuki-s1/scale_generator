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
    return clerk;
  } catch (e) {
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
export function mountUserButton(el) { if (clerk && el) clerk.mountUserButton(el, { afterSignOutUrl: import.meta.env.BASE_URL }); }
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

// ── 共有（shares・SHARE.md・期限廃止 migration 0003） ─────────────────
/** ソングブックを共有化（スナップショット複製）。{ share_id, url, name } を返す。 */
export async function createShare(songbookId) {
  return asJsonOrThrow(await authedFetch('api/shares', {
    method: 'POST', body: JSON.stringify({ songbook_id: songbookId }),
  }));
}
/** 共有の受け取り（公開・認証不要）。不正/不存在は 404。 */
export async function getShare(shareId) {
  return asJsonOrThrow(await authedFetch(`api/shares/${encodeURIComponent(shareId)}`));
}
/** 自分の共有一覧。 */
export async function listMyShares() {
  return asJsonOrThrow(await authedFetch('api/shares/mine'));
}
/** 共有の取り消し（即失効）。 */
export async function revokeShare(shareId) {
  return asJsonOrThrow(await authedFetch(`api/shares/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
  }));
}
