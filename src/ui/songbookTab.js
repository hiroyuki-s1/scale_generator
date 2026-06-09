import {
  onAuthChange, openSignIn,
  listSongbooks, getSongbook, createSongbook, updateSongbook, deleteSongbook, cloudToSongfile,
} from '../state/cloudSync.js';
import { showToast } from './toast.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { SVG } from '../config/fretboardGeometry.js';
import { localizeTitle } from '../domain/i18n.js';

const NS = 'http://www.w3.org/2000/svg';

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
 * @param {(book:object)=>void} [onShare] 共有ボタン
 * @param {()=>void} [onAfterSave] 保存(新規作成/上書き)成功後：ソングファイルを新規状態へリセット
 */
export function initSongbookTab(store, onLoadSongbook, onShare = null, onAfterSave = null) {
  const tabBtn   = document.getElementById('songbookTabBtn');
  const locked   = document.getElementById('songbookLocked');
  const main     = document.getElementById('songbookMain');
  const listEl   = document.getElementById('songbookList');
  const emptyEl  = document.getElementById('songbookEmpty');
  const loginBtn = document.getElementById('songbookLoginBtn');
  const saveTopBtn = document.getElementById('songbookSaveTopBtn'); // ソングファイルタブ上部の保存
  const saveLabel  = document.getElementById('songbookSaveLabel');
  if (!tabBtn || !locked || !main) return;

  let loggedIn = false;
  const IMPORT_OFFERED_KEY = 'sg.v1.songbookImportOffered';

  loginBtn?.addEventListener('click', () => openSignIn());
  saveTopBtn?.addEventListener('click', saveCurrent);

  /** 編集中ソングブック束縛 {publicId}|null を保存。null=新規保存側。 */
  function setSource(source) {
    store.set(s => ({ ...s, songfileSource: source && source.publicId ? { publicId: source.publicId } : null }));
  }
  /** 保存ボタンの文言を束縛状態に合わせる（上書き or 新規）。 */
  function syncSaveLabel() {
    if (!saveLabel) return;
    const bound = !!store.get().songfileSource?.publicId;
    saveLabel.textContent = bound ? '上書き保存' : 'ソングブックに保存';
    if (saveTopBtn) {
      saveTopBtn.title = bound
        ? '読み込んだソングブックへ上書き保存します'
        : '現在のソングファイルを新しいソングブックとして保存します';
    }
  }
  syncSaveLabel();
  store.subscribe((s, p) => {
    if (p && s.songfileSource === p.songfileSource) return;
    syncSaveLabel();
  });

  onAuthChange(user => {
    const was = loggedIn;
    loggedIn = !!user;
    // ソングブックタブ / ソングファイル上部の保存ボタンはログイン時のみ表示
    tabBtn.style.display = loggedIn ? '' : 'none';
    if (saveTopBtn) saveTopBtn.style.display = loggedIn ? '' : 'none';
    locked.classList.toggle('hidden', loggedIn);
    main.classList.toggle('hidden', !loggedIn);
    if (loggedIn) {
      refresh();
      if (!was) maybeOfferImport(); // 非ログイン→ログインの遷移時のみ
    }
  });

  // Phase 5（移行フロー）: 初回ログイン時、ローカルのソングファイルが残っていれば
  // 一度だけ「ソングブックに保存しますか？」と促す（ログイン前の作業をクラウドへ）。
  function markImportOffered() {
    try { localStorage.setItem(IMPORT_OFFERED_KEY, '1'); } catch { /* private mode */ }
  }
  function maybeOfferImport() {
    let already = false;
    try { already = !!localStorage.getItem(IMPORT_OFFERED_KEY); } catch { /* noop */ }
    if (already) return;
    const count = store.get().saved.length;
    if (count === 0) { markImportOffered(); return; }
    // サインインモーダルが閉じる猶予を置いてから促す
    setTimeout(async () => {
      markImportOffered();
      if (offline()) return;
      const ok = window.confirm(
        `ログイン前に作ったソングファイル（${count}スケール）をソングブックに保存しますか？\n`
        + 'クラウドに残しておくと別の端末でも呼び出せます。',
      );
      if (!ok) return;
      const name = window.prompt('ソングブック名を入力してください。', '');
      if (name === null) return;
      const t = name.trim();
      if (t === '') { showToast('名前を入力してください'); return; }
      try {
        const res = await createSongbook(t, store.get());
        // 取り込んだローカルソングファイル＝このソングブック、として以後束縛。
        if (res?.public_id) store.set(s => ({ ...s, songfileTitle: t, songfileSource: { publicId: res.public_id } }));
        showToast('ソングブックに保存しました');
        refresh();
      } catch (e) {
        console.error('初回取り込みの保存に失敗:', e);
        showToast('保存に失敗しました');
      }
    }, 600);
  }

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
    name.textContent = book.name;
    const meta = document.createElement('div');
    meta.className = 'songbook-row-meta';
    meta.textContent = `${book.scale_count ?? 0}スケール ・ 最終更新 ${fmtDate(book.updated_at)}`;
    info.appendChild(name);
    info.appendChild(meta);
    info.addEventListener('click', () => loadBook(book));

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-songbook-share';
    shareBtn.title = '共有URLを表示（無期限・誰でも読み込み可）';
    shareBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5z"/></svg>共有`;
    shareBtn.addEventListener('click', e => { e.stopPropagation(); onShare?.(book); });

    const del = document.createElement('button');
    del.className = 'btn-songbook-del';
    del.title = '削除';
    del.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/></svg>`;
    del.addEventListener('click', e => { e.stopPropagation(); deleteBook(book, row); });

    row.appendChild(info);
    if (onShare) row.appendChild(shareBtn);
    row.appendChild(del);
    return row;
  }

  async function saveCurrent() {
    if (!loggedIn) return;
    if (offline()) return;
    const state = store.get();
    const count = state.saved.length;
    if (count === 0) { showToast('保存するスケールがありません'); return; }

    const source = state.songfileSource;
    // ① 自分のソングブックを読み込んで編集中 → 元へ上書き保存(update)。
    if (source?.publicId) {
      const name = (state.songfileTitle || '').trim() || '無題のソングブック';
      if (!window.confirm(`「${name}」を上書き保存します。\n読み込んだソングブックの内容が、現在の${count}スケールで更新されます。よろしいですか？`)) return;
      if (saveTopBtn) saveTopBtn.disabled = true;
      try {
        await updateSongbook(source.publicId, name, state);
        showToast('上書き保存しました');
        await refresh();
        // 保存完了 → ソングファイルを新規状態へリセット（編集状態は読み込み時のみ）。
        onAfterSave?.();
      } catch (e) {
        if (e.status === 404) {
          // 元が削除済み/自分のものでない → 束縛を切って新規保存に切替（共有元は不変なので安全）。
          showToast('元のソングブックが見つからないため、新規保存に切り替えます');
          setSource(null);
          await saveAsNew();
        } else {
          console.error('ソングブック上書き保存に失敗:', e);
          showToast('保存に失敗しました');
        }
      } finally {
        if (saveTopBtn) saveTopBtn.disabled = false;
      }
      return;
    }

    // ② 未束縛（新規 or 共有コピー）→ 新規保存(create)。
    await saveAsNew();
  }

  /** 新規ソングブックとして保存し、成功したら以後そのソングブックへ束縛する。 */
  async function saveAsNew() {
    const state = store.get();
    const count = state.saved.length;
    const name = window.prompt(
      `現在のソングファイル（${count}スケール）を新しいソングブックとして保存します。\n名前を入力してください。`,
      state.songfileTitle || '',
    );
    if (name === null) return;            // キャンセル
    const trimmed = name.trim();
    if (trimmed === '') { showToast('名前を入力してください'); return; }
    if (saveTopBtn) saveTopBtn.disabled = true;
    try {
      await createSongbook(trimmed, store.get());
      showToast('ソングブックに保存しました');
      await refresh();
      // 保存完了 → ソングファイルを新規状態へリセット（編集状態は読み込み時のみ）。
      onAfterSave?.();
    } catch (e) {
      console.error('ソングブック保存に失敗:', e);
      showToast(e.status === 400 ? (e.message || '保存できません') : '保存に失敗しました');
    } finally {
      if (saveTopBtn) saveTopBtn.disabled = false;
    }
  }

  /** プレビューモーダルを開く。ユーザーが「読み込み」を押した時のみ実際に上書きする。 */
  async function loadBook(book) {
    if (offline()) return;
    let full;
    try {
      full = await getSongbook(book.public_id);
    } catch (e) {
      console.error('ソングブック取得に失敗:', e);
      if (e.status === 404) { showToast('このソングブックは見つかりませんでした'); refresh(); }
      else showToast('読み込みに失敗しました');
      return;
    }
    const savedArray = cloudToSongfile(full.scales);
    openPreview(book, savedArray);
  }

  function openPreview(book, savedArray) {
    const modal   = document.getElementById('songbookPreviewModal');
    const titleEl = document.getElementById('songbookPreviewTitle');
    const metaEl  = document.getElementById('songbookPreviewMeta');
    const listEl_ = document.getElementById('songbookPreviewList');
    const loadBtn = document.getElementById('songbookPreviewLoadBtn');
    const closeBtn = document.getElementById('songbookPreviewCloseBtn');
    if (!modal || !titleEl || !listEl_) return;
    titleEl.textContent = book.name;
    if (metaEl) metaEl.textContent = `${savedArray.length}スケール ・ 最終更新 ${fmtDate(book.updated_at)}`;
    listEl_.innerHTML = '';
    if (savedArray.length === 0) {
      const e = document.createElement('div');
      e.className = 'songbook-preview-empty';
      e.textContent = 'スケールが登録されていません。';
      listEl_.appendChild(e);
    } else {
      // ソングファイル画面と同じく「スケール名 + その下にミニ指板」を 1 列で並べる
      savedArray.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'songbook-preview-card';

        const title = document.createElement('div');
        title.className = 'songbook-preview-title';
        title.textContent = localizeTitle(s.title || s.name || '(名称未設定)');
        row.appendChild(title);

        const fbWrap = document.createElement('div');
        fbWrap.className = 'songbook-preview-fb';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'fb');
        svg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        fbWrap.appendChild(svg);
        row.appendChild(fbWrap);

        listEl_.appendChild(row);
        try {
          drawFretboardBase(svg, s.instrument || 'guitar');
          applyFretboardDiff(svg, s, null);
        } catch (e) {
          console.warn('songbook-preview: failed to render', e);
        }
      });
    }
    function close() { modal.classList.remove('show'); cleanup(); }
    function load() {
      // 自分のソングブックを読込 → 束縛（保存で上書き）。public_id を渡す。
      onLoadSongbook(savedArray, book.name, { publicId: book.public_id });
      showToast(`「${book.name}」を読み込みました`);
      close();
    }
    function cleanup() {
      loadBtn?.removeEventListener('click', load);
      closeBtn?.removeEventListener('click', close);
      modal.removeEventListener('click', onBg);
    }
    function onBg(e) { if (e.target === modal) close(); }
    loadBtn?.addEventListener('click', load);
    closeBtn?.addEventListener('click', close);
    modal.addEventListener('click', onBg);
    modal.classList.add('show');
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
