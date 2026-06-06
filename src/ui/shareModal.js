import {
  onAuthChange, createShare, getShare, listMyShares, revokeShare, cloudToSongfile,
} from '../state/cloudSync.js';
import { buildXShareUrl } from '../domain/socialShare.js';
import { showToast } from './toast.js';

/**
 * 曲共有 UI（docs/features/SHARE.md）。
 *  - 共有作成: ソングブック行の「共有」→ POST /api/shares → URL/ID モーダル（コピー・失効日）
 *  - 受け取り: 「…→IDから読み込み」or `?share=` URL → 確認 → 読込（公開・ログイン不要）
 *  - 管理: 「…→共有を管理」→ 一覧・取り消し（ログイン時のみ）
 *
 * 破壊的読込は確認必須・取得成功確定までローカルを消さない・オフライン時は送信しない。
 *
 * @param {object} store
 * @param {(savedArray:Array)=>void} onLoadSongbook 読込確定時：store.saved 置換＋タブ切替
 * @returns {{ shareSongbook:(book)=>void, openReceive:()=>void, openManage:()=>void, checkUrlParam:()=>void }}
 */
export function initShareUi(store, onLoadSongbook) {
  const resultModal  = document.getElementById('shareResultModal');
  const receiveModal = document.getElementById('shareReceiveModal');
  const manageModal  = document.getElementById('shareManageModal');
  const manageItem   = document.querySelector('[data-act="share-manage"]');
  const receiveItem  = document.querySelector('[data-act="share-receive"]');

  // 「共有を管理」はログイン時のみ表示
  onAuthChange(user => { if (manageItem) manageItem.style.display = user ? '' : 'none'; });

  // ── モーダル共通の開閉 ──
  const show = m => m?.classList.add('show');
  const hide = m => m?.classList.remove('show');
  [resultModal, receiveModal, manageModal].forEach(m => {
    if (!m) return;
    m.addEventListener('click', e => { if (e.target === m) hide(m); });
    m.querySelectorAll('[data-act="close"], [data-act="cancel"]').forEach(b => b.addEventListener('click', () => hide(m)));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    [resultModal, receiveModal, manageModal].forEach(m => { if (m?.classList.contains('show')) hide(m); });
  });

  function offline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('オフラインです。接続を確認してください');
      return true;
    }
    return false;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); showToast('コピーしました'); }
    catch { showToast('コピーできませんでした。手動で選択してください'); }
  }

  // ── 共有作成 ──
  async function shareSongbook(book) {
    if (offline()) return;
    try {
      const res = await createShare(book.public_id); // { share_id, url, name }
      document.getElementById('shareResultTitle').textContent = `「${res.name || book.name}」を共有`;
      const urlInput = document.getElementById('shareUrlInput');
      urlInput.value = res.url || '';
      // URL のみコピーさせる (ID は廃止: ユーザー混乱を避けるため UI から除外)
      resultModal.querySelectorAll('.share-copy').forEach(btn => {
        btn.onclick = () => copyText(urlInput.value);
      });
      // X に投稿: 共有 URL を本文添付で投稿作成画面を開く
      const xBtn = document.getElementById('shareXBtn');
      if (xBtn) {
        const shareName = res.name || book.name;
        xBtn.onclick = () => {
          const text = `🎸「${shareName}」を神スケールトレーナーで共有しました`;
          const href = buildXShareUrl({ text, url: urlInput.value, hashtags: ['神スケールトレーナー'] });
          window.open(href, '_blank', 'noopener,noreferrer');
        };
      }
      show(resultModal);
    } catch (e) {
      console.error('共有の作成に失敗:', e);
      if (e.status === 404) showToast('ソングブックが見つかりませんでした');
      else showToast('共有の作成に失敗しました');
    }
  }

  // ── 受け取り ──
  /** 入力が URL でも ID でも share_id を取り出す。 */
  function extractShareId(raw) {
    const s = (raw || '').trim();
    if (s === '') return '';
    const m = s.match(/[?&]share=([^&\s]+)/);
    return m ? decodeURIComponent(m[1]) : s;
  }

  function openReceive() {
    const input = document.getElementById('shareReceiveInput');
    input.value = '';
    const loadBtn = receiveModal.querySelector('[data-act="load"]');
    loadBtn.onclick = () => {
      const id = extractShareId(input.value);
      if (id === '') { showToast('IDを入力してください'); return; }
      hide(receiveModal);
      receiveShare(id);
    };
    show(receiveModal);
    setTimeout(() => input.focus(), 50);
  }

  async function receiveShare(shareId) {
    if (offline()) return;
    let full;
    try {
      full = await getShare(shareId); // 公開GET（失効/不正は404）
    } catch (e) {
      console.error('共有の取得に失敗:', e);
      showToast(e.status === 404
        ? 'この共有は存在しないか、有効期限が切れています'
        : '共有の読み込みに失敗しました');
      return;
    }
    // 取得成功を確定してから確認 → ローカル展開（途中失敗でデータ喪失しない）
    const ok = window.confirm(
      '共有されたソングファイルを読み込みます。\n現在編集中のソングファイルは上書きされます。\nよろしいですか？',
    );
    if (!ok) return;
    onLoadSongbook(cloudToSongfile(full.scales), full.name);
    showToast('共有を読み込みました');
  }

  /** 起動時 `?share=<id>` を処理し、URL からパラメータを除去する。 */
  function checkUrlParam() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const id = params.get('share');
    if (!id) return;
    // パラメータは消す（不正形式でも通常起動に戻す）
    params.delete('share');
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    try { window.history.replaceState(null, '', newUrl); } catch { /* noop */ }
    if (/^[A-Za-z0-9]{6,40}$/.test(id)) receiveShare(id);
  }

  // ── 管理 ──
  async function openManage() {
    if (offline()) return;
    const list = document.getElementById('shareManageList');
    list.innerHTML = '<div class="share-manage-loading">読み込み中…</div>';
    show(manageModal);
    try {
      const { shares } = await listMyShares();
      renderManage(shares || []);
    } catch (e) {
      console.error('共有一覧の取得に失敗:', e);
      list.innerHTML = '<div class="share-manage-empty">共有を取得できませんでした。</div>';
    }
  }

  function renderManage(shares) {
    const list = document.getElementById('shareManageList');
    list.innerHTML = '';
    if (shares.length === 0) {
      list.innerHTML = '<div class="share-manage-empty">有効な共有はありません。</div>';
      return;
    }
    shares.forEach(sh => {
      const row = document.createElement('div');
      row.className = 'share-manage-row';
      const info = document.createElement('div');
      info.className = 'share-manage-info';
      const createdLabel = sh.created_at
        ? new Date(sh.created_at).toLocaleDateString('ja-JP')
        : '';
      info.innerHTML = `<div class="share-manage-name">${escapeHtml(sh.name)}</div>`
        + `<div class="share-manage-meta">${createdLabel ? createdLabel + ' ・ ' : ''}${sh.scale_count ?? 0}スケール</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn-share-revoke';
      btn.textContent = '取り消し';
      btn.addEventListener('click', async () => {
        if (!window.confirm(`「${sh.name}」の共有を取り消します。\nこのURL/IDは無効になります。よろしいですか？`)) return;
        btn.disabled = true;
        try { await revokeShare(sh.share_id); showToast('共有を取り消しました'); openManage(); }
        catch (err) { console.error('共有取り消しに失敗:', err); showToast('取り消しに失敗しました'); openManage(); }
      });
      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // 「…」メニュー項目
  receiveItem?.addEventListener('click', openReceive);
  manageItem?.addEventListener('click', openManage);

  return { shareSongbook, openReceive, openManage, checkUrlParam };
}
