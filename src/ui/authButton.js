import {
  onAuthChange, openSignIn, mountUserButton, unmountUserButton, isClerkReady, getLoadError,
} from '../state/cloudSync.js';

/**
 * ヘッダーの認証 UI。
 *  - Clerk 読込前: 何も出さない（本体操作を妨げない）
 *  - 読込失敗: 「ログイン利用不可」を薄く表示（本体は通常動作・EXCEPTION_HANDLING.md §1）
 *  - 未ログイン: 「ログイン」ボタン → Clerk プリビルト SignIn
 *  - ログイン中: Clerk の UserButton（プロフィール/ログアウト）をマウント。
 *    さらに UserButton のメニューに「表示名: <name>（変更）」のカスタム項目を足し、
 *    Clerk のポップオーバー内で表示名を確認・編集できるようにする（表示名の正は D1。
 *    Clerk のプロフィールデータは書き換えない）。
 *
 * @param {HTMLElement} container ヘッダー内のスロット要素
 * @param {object} [profile] 表示名連携フック（ui/* 同士の直接 import を避け main.js 経由で受け取る）
 * @param {() => void} [profile.onEditProfile] 表示名編集モーダルを開く
 * @param {() => (string|null)} [profile.getDisplayName] 現在の表示名
 * @param {(fn:(name:string|null)=>void) => (()=>void)} [profile.onProfileChange] 表示名変化の購読
 */
export function initAuthButton(container, profile = {}) {
  if (!container) return;
  const { onEditProfile, getDisplayName, onProfileChange } = profile;
  let mountEl = null;

  onAuthChange(render);
  // 表示名が変わったら（ログイン中のみ）UserButton を貼り直してラベルを更新。
  onProfileChange?.(() => { if (mountEl) render(undefined, true); });

  function profileMenuItems() {
    if (!onEditProfile) return undefined;
    const name = getDisplayName?.();
    const label = name ? `表示名: ${name}` : '表示名を設定';
    return [{
      label,
      onClick: () => onEditProfile(),
      mountIcon: (el) => { el.innerHTML = '✎'; },
      unmountIcon: () => {},
    }];
  }

  // user 省略時は現在の認証状態を変えずに「貼り直し」だけ行う（ラベル更新用）。
  function render(user, remountOnly = false) {
    if (mountEl) { unmountUserButton(mountEl); mountEl = null; }
    container.innerHTML = '';

    if (getLoadError()) {
      const span = document.createElement('span');
      span.className = 'auth-disabled';
      span.textContent = 'ログイン利用不可';
      span.title = 'ログイン機能を読み込めませんでした。ローカル機能はそのまま使えます。';
      container.appendChild(span);
      return;
    }
    if (!isClerkReady()) return; // 読込中

    // remountOnly のときは現在ログイン中（mountEl があった）前提なので user 判定を省く。
    const loggedIn = remountOnly || !!user;
    if (loggedIn) {
      const mount = document.createElement('div');
      mount.className = 'auth-user-btn';
      container.appendChild(mount);
      mountEl = mount;
      mountUserButton(mount, { customMenuItems: profileMenuItems() });
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-login';
      btn.type = 'button';
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2 1H6a4 4 0 0 0-4 4 1 1 0 0 0 1 1h10a1 1 0 0 0 1-1 4 4 0 0 0-4-4z"/></svg>ログイン`;
      btn.addEventListener('click', () => openSignIn());
      container.appendChild(btn);
    }
  }
}
