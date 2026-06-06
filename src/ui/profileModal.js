import { onAuthChange, getProfile, setProfile } from '../state/cloudSync.js';
import { showToast } from './toast.js';

/**
 * 表示名（公開プロフィール名）UI。migration 0005 / API /api/profile。
 *
 *  - オンボーディング: ログイン後にプロフィール未設定（表示名なし）なら必須モーダルを出す。
 *    キャンセル不可（オーバーレイ/Esc で閉じない）。保存して初めて閉じる。
 *  - 編集: ヘッダ「⋮ → 表示名を変更」からいつでも変更可能（キャンセル可）。
 *  - 「表示名を変更」メニューはログイン時のみ表示。
 *
 * 表示名は重複OK・1〜50文字。検証はサーバが最終権威（ここは軽い前さばきのみ）。
 * 落とさない方針: プロフィール取得に失敗してもアプリ本体は継続（モーダルを出さないだけ）。
 *
 * @returns {{ openEdit: () => void, getDisplayName: () => (string|null) }}
 */
export function initProfileUi() {
  const modal     = document.getElementById('profileModal');
  const titleEl   = document.getElementById('profileModalTitle');
  const introEl   = document.getElementById('profileModalIntro');
  const input     = document.getElementById('profileNameInput');
  const errorEl   = document.getElementById('profileNameError');
  const cancelBtn = document.getElementById('profileCancelBtn');
  const saveBtn   = document.getElementById('profileSaveBtn');
  const editItem  = document.querySelector('[data-act="profile-edit"]');
  if (!modal || !input || !saveBtn) return { openEdit() {}, getDisplayName: () => null };

  let displayName = null;   // 既知の表示名（未設定/未ログインは null）
  let mode = 'edit';        // 'onboarding' | 'edit'
  let saving = false;

  // 表示名の変化を購読する仕組み（Clerk メニューのラベル同期などに使う）。
  const changeListeners = new Set();
  function setDisplayName(next) {
    displayName = next;
    changeListeners.forEach(fn => { try { fn(displayName); } catch (e) { console.error('profile listener error', e); } });
  }

  const show = () => modal.classList.add('show');
  const hide = () => modal.classList.remove('show');
  const isOpen = () => modal.classList.contains('show');

  function clearError() { errorEl.hidden = true; errorEl.textContent = ''; }
  function setError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }

  // 軽い前さばき（サーバ検証と整合）。OK なら正規化文字列、NG なら null。
  function localNormalize(raw) {
    if (typeof raw !== 'string') return null;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
    const n = raw.replace(/\s+/g, ' ').trim();
    if (n.length < 1 || n.length > 50) return null;
    return n;
  }

  function open(nextMode) {
    mode = nextMode;
    clearError();
    if (mode === 'onboarding') {
      titleEl.textContent = '表示名を決めてください';
      introEl.textContent = 'コード進行を共有したときに、ほかのユーザーに表示される名前です。あとからいつでも変更できます。';
      cancelBtn.style.display = 'none';
      input.value = '';
    } else {
      titleEl.textContent = '表示名を変更';
      introEl.textContent = 'ほかのユーザーに表示される名前です。いつでも変更できます。';
      cancelBtn.style.display = '';
      input.value = displayName || '';
    }
    show();
    setTimeout(() => input.focus(), 50);
  }

  async function save() {
    if (saving) return;
    const candidate = localNormalize(input.value);
    if (!candidate) {
      setError('表示名は1〜50文字で、改行などは使えません');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('オフラインです。接続を確認してください');
      return;
    }
    saving = true;
    saveBtn.disabled = true;
    clearError();
    try {
      const res = await setProfile(candidate);
      setDisplayName(res.displayName || candidate);
      hide();
      showToast(mode === 'onboarding' ? `ようこそ、${displayName} さん！` : '表示名を変更しました');
    } catch (e) {
      console.error('表示名の保存に失敗:', e);
      // サーバの検証メッセージ（400）はそのまま見せる。それ以外は汎用文言。
      setError(e.status === 400 && e.message ? e.message : '保存に失敗しました。時間をおいて再試行してください');
    } finally {
      saving = false;
      saveBtn.disabled = false;
    }
  }

  // ── イベント配線 ──
  saveBtn.addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  input.addEventListener('input', clearError);
  cancelBtn.addEventListener('click', () => { if (mode === 'edit') hide(); });
  // オーバーレイ/Esc で閉じられるのは編集モードのみ（オンボーディングは必須）。
  modal.addEventListener('click', e => { if (e.target === modal && mode === 'edit') hide(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen() && mode === 'edit') hide();
  });
  editItem?.addEventListener('click', () => open('edit'));

  // ── ログイン状態に追随 ──
  onAuthChange(async user => {
    if (editItem) editItem.style.display = user ? '' : 'none';
    if (!user) { setDisplayName(null); if (isOpen()) hide(); return; }
    // ログイン: プロフィールを取得し、未設定ならオンボーディングを必須表示。
    try {
      const prof = await getProfile();
      setDisplayName(prof?.displayName ?? null);
      if (displayName == null) open('onboarding');
    } catch (e) {
      // 取得失敗は本体に影響させない（モーダルを出さず継続）。
      console.error('プロフィール取得に失敗（本体は継続）:', e);
    }
  });

  return {
    openEdit: () => open('edit'),
    getDisplayName: () => displayName,
    /** 表示名が変わったら通知（即時に現在値でも一度呼ぶ）。解除関数を返す。 */
    onProfileChange(fn) {
      changeListeners.add(fn);
      fn(displayName);
      return () => changeListeners.delete(fn);
    },
  };
}
