import { getSharedSongbook, getLegacyShare, cloudToSongfile } from '../state/cloudSync.js';
import {
  buildShareUrl, extractShareId, isLikelyShareId, buildXShareUrl,
} from '../domain/shareLink.js';
import { track } from '../state/track.js'; // [removable-analytics] 後で消す前提（migrations/0006）
import { showToast } from './toast.js';

/**
 * 曲共有 UI（無期限・自動生成・public_id ベース）。
 *  - 共有: ソングブック行の「共有」→ public_id から共有 URL を組み立て表示（コピー）。
 *          別途の作成 API・期限・取り消し（管理）は不要。URL はソングブックが存在する限り無期限。
 *  - 受け取り: 「…→URLから読み込み」or `?share=<public_id>` → 確認 → 読込（公開・ログイン不要）。
 *
 * 破壊的読込は確認必須・取得成功確定までローカルを消さない・オフライン時は送信しない。
 *
 * @param {object} store
 * @param {(savedArray:Array, name?:string)=>void} onLoadSongbook 読込確定時：store.saved 置換＋タブ切替
 * @returns {{ shareSongbook:(book)=>void, openReceive:()=>void, checkUrlParam:()=>void }}
 */
export function initShareUi(store, onLoadSongbook) {
  const resultModal  = document.getElementById('shareResultModal');
  const receiveModal = document.getElementById('shareReceiveModal');
  const receiveItem  = document.querySelector('[data-act="share-receive"]');

  // ── モーダル共通の開閉 ──
  const show = m => m?.classList.add('show');
  const hide = m => m?.classList.remove('show');
  [resultModal, receiveModal].forEach(m => {
    if (!m) return;
    m.addEventListener('click', e => { if (e.target === m) hide(m); });
    m.querySelectorAll('[data-act="close"], [data-act="cancel"]').forEach(b => b.addEventListener('click', () => hide(m)));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    [resultModal, receiveModal].forEach(m => { if (m?.classList.contains('show')) hide(m); });
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

  // ── 共有（URL 表示・コピー）──
  // public_id から共有 URL を組み立てるだけ。作成 API は呼ばない（無期限・自動生成）。
  function shareSongbook(book) {
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
    const base = import.meta.env.BASE_URL;
    const url = buildShareUrl(origin, base, book.public_id);
    track('share_create', { scale_count: book.scale_count ?? undefined }); // [removable-analytics]
    const titleEl = document.getElementById('shareResultTitle');
    if (titleEl) titleEl.textContent = `「${book.name}」を共有`;
    const urlInput = document.getElementById('shareUrlInput');
    if (urlInput) urlInput.value = url;
    resultModal.querySelectorAll('.share-copy').forEach(btn => { btn.onclick = () => copyText(url); });
    // X に投稿: 共有 URL を本文添付で投稿作成画面を開く
    const xBtn = document.getElementById('shareXBtn');
    if (xBtn) {
      xBtn.onclick = () => {
        const text = `🎸「${book.name}」を神スケールトレーナーで共有しました`;
        const href = buildXShareUrl({ text, url, hashtags: ['神スケールトレーナー'] });
        window.open(href, '_blank', 'noopener,noreferrer');
      };
    }
    show(resultModal);
  }

  // ── 受け取り ──
  function openReceive() {
    const input = document.getElementById('shareReceiveInput');
    input.value = '';
    const loadBtn = receiveModal.querySelector('[data-act="load"]');
    loadBtn.onclick = () => {
      const id = extractShareId(input.value);
      if (id === '') { showToast('共有URLを入力してください'); return; }
      hide(receiveModal);
      receiveShare(id);
    };
    show(receiveModal);
    setTimeout(() => input.focus(), 50);
  }

  /** public_id（unlisted）を優先、ダメならレガシー共有 ID をフォールバックで試す。 */
  async function fetchShared(id) {
    try {
      return await getSharedSongbook(id);
    } catch (e) {
      if (e.status === 404) {
        // 旧 `?share=<短いID>` リンク互換: shares テーブルを試す。
        return await getLegacyShare(id);
      }
      throw e;
    }
  }

  async function receiveShare(id) {
    if (offline()) return;
    let full;
    try {
      full = await fetchShared(id);
    } catch (e) {
      console.error('共有の取得に失敗:', e);
      showToast(e.status === 404
        ? 'この共有は存在しないか、削除されています'
        : '共有の読み込みに失敗しました');
      return;
    }
    // 取得成功を確定してから確認 → ローカル展開（途中失敗でデータ喪失しない）
    const ok = window.confirm(
      '共有されたソングファイルを読み込みます。\n現在編集中のソングファイルは上書きされます。\nよろしいですか？',
    );
    if (!ok) return;
    // 共有の受け取りは「自分のコピー」。束縛なし(null)で読み込む → 保存すると新規ソングブックになり、
    // 共有元の持ち主のデータは決して書き換わらない（サーバ側 PUT も user_id 一致必須で二重に安全）。
    onLoadSongbook(cloudToSongfile(full.scales), full.name, null);
    showToast('共有を読み込みました');
  }

  /** 起動時 `?share=<public_id>` を処理し、URL からパラメータを除去する。 */
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
    if (isLikelyShareId(id)) receiveShare(id);
  }

  // 「…」メニュー項目
  receiveItem?.addEventListener('click', openReceive);

  return { shareSongbook, openReceive, checkUrlParam };
}
