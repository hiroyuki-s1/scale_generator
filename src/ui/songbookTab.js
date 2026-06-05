import {
  onAuthChange, openSignIn,
  listSongbooks, getSongbook, createSongbook, deleteSongbook, cloudToSongfile,
} from '../state/cloudSync.js';
import { showToast } from './toast.js';

/**
 * ソングブックタブ（クラウド保存・docs/songbook/SPEC.md）。
 *  - 未ログイン: ロック画面（ログインを促す）
 *  - ログイン: 一覧（名前/スケール数/最終更新）・「+保存」・読込（確認）・削除（楽観的）
 *
 * 破壊的操作（読込/削除）は確認必須、API はオフラインチェック＋失敗時トースト＋ロールバック
 * （EXCEPTION_HANDLING.md §2）。
 *
 * @param {object} store
 * @param {(savedArray:Array)=>void} onLoadSongbook 読込確定時：store.saved を置換しタブ切替
 */
export function initSongbookTab(store, onLoadSongbook) {
  const tabBtn   = document.getElementById('songbookTabBtn');
  const locked   = document.getElementById('songbookLocked');
  const main     = document.getElementById('songbookMain');
  const listEl   = document.getElementById('songbookList');
  const emptyEl  = document.getElementById('songbookEmpty');
  const saveBtn  = document.getElementById('songbookSaveBtn');
  const loginBtn = document.getElementById('songbookLoginBtn');
  if (!tabBtn || !locked || !main) return;

  let loggedIn = false;

  loginBtn?.addEventListener('click', () => openSignIn());
  saveBtn?.addEventListener('click', saveCurrent);

  onAuthChange(user => {
    loggedIn = !!user;
    // ソングブックタブはログイン時のみ表示
    tabBtn.style.display = loggedIn ? '' : 'none';
    locked.classList.toggle('hidden', loggedIn);
    main.classList.toggle('hidden', !loggedIn);
    if (loggedIn) refresh();
  });

  function offline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('オフラインです。接続を確認してください');
      return true;
    }
    return false;
  }

  function fmtDate(ms) {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function refresh() {
    if (!loggedIn) return;
    if (offline()) return;
    try {
      const { songbooks } = await listSongbooks();
      render(songbooks || []);
    } catch (e) {
      console.error('ソングブック一覧の取得に失敗:', e);
      listEl.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'songbook-error';
      err.textContent = 'ソングブックを取得できませんでした。';
      const retry = document.createElement('button');
      retry.className = 'btn-songbook-retry';
      retry.textContent = '再読み込み';
      retry.addEventListener('click', refresh);
      err.appendChild(document.createElement('br'));
      err.appendChild(retry);
      listEl.appendChild(err);
      emptyEl?.classList.add('hidden');
    }
  }

  function render(books) {
    listEl.innerHTML = '';
    emptyEl?.classList.toggle('hidden', books.length > 0);
    books.forEach(b => listEl.appendChild(renderRow(b)));
  }

  function renderRow(book) {
    const row = document.createElement('div');
    row.className = 'songbook-row';
    row.dataset.id = book.public_id;

    const info = document.createElement('button');
    info.className = 'songbook-row-main';
    info.title = 'タップで読み込み（現在のソングファイルは上書きされます）';
    const name = document.createElement('div');
    name.className = 'songbook-row-name';
    name.textContent = `🎵 ${book.name}`;
    const meta = document.createElement('div');
    meta.className = 'songbook-row-meta';
    meta.textContent = `${book.scale_count ?? 0}スケール ・ 最終更新 ${fmtDate(book.updated_at)}`;
    info.appendChild(name);
    info.appendChild(meta);
    info.addEventListener('click', () => loadBook(book));

    const del = document.createElement('button');
    del.className = 'btn-songbook-del';
    del.title = '削除';
    del.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/></svg>`;
    del.addEventListener('click', e => { e.stopPropagation(); deleteBook(book, row); });

    row.appendChild(info);
    row.appendChild(del);
    return row;
  }

  async function saveCurrent() {
    if (!loggedIn) return;
    if (offline()) return;
    const count = store.get().saved.length;
    if (count === 0) { showToast('保存するスケールがありません'); return; }
    // SPEC: 確認＋名前入力。MVP は prompt（既存も confirm/alert を使用）。
    const name = window.prompt(
      `現在のソングファイル（${count}スケール）をソングブックに保存します。\n名前を入力してください。`,
      '',
    );
    if (name === null) return;            // キャンセル
    const trimmed = name.trim();
    if (trimmed === '') { showToast('名前を入力してください'); return; }
    saveBtn.disabled = true;
    try {
      await createSongbook(trimmed, store.get());
      showToast('ソングブックに保存しました');
      await refresh();
    } catch (e) {
      console.error('ソングブック保存に失敗:', e);
      showToast(e.status === 400 ? (e.message || '保存できません') : '保存に失敗しました');
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function loadBook(book) {
    if (offline()) return;
    const ok = window.confirm(
      `「${book.name}」を読み込みます。\n現在編集中のソングファイルは上書きされます。\nよろしいですか？`,
    );
    if (!ok) return;
    try {
      // 取得成功を確定してからローカルを書き換える（途中失敗でデータ喪失しない）
      const full = await getSongbook(book.public_id);
      const savedArray = cloudToSongfile(full.scales);
      onLoadSongbook(savedArray);
      showToast(`「${book.name}」を読み込みました`);
    } catch (e) {
      console.error('ソングブック読み込みに失敗:', e);
      if (e.status === 404) { showToast('このソングブックは見つかりませんでした'); refresh(); }
      else showToast('読み込みに失敗しました');
    }
  }

  async function deleteBook(book, row) {
    if (offline()) return;
    if (!window.confirm(`「${book.name}」を削除しますか？`)) return;
    // 楽観的に消す → 失敗したら一覧を再取得して復元
    row.remove();
    try {
      await deleteSongbook(book.public_id);
      showToast('削除しました');
      refresh();
    } catch (e) {
      console.error('ソングブック削除に失敗:', e);
      showToast('削除に失敗しました');
      refresh();
    }
  }

  return { refresh };
}
