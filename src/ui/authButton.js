import {
  onAuthChange, openSignIn, mountUserButton, isClerkReady, getLoadError,
} from '../state/cloudSync.js';

/**
 * ヘッダーの認証 UI。
 *  - Clerk 読込前: 何も出さない（本体操作を妨げない）
 *  - 読込失敗: 「ログイン利用不可」を薄く表示（本体は通常動作・EXCEPTION_HANDLING.md §1）
 *  - 未ログイン: 「ログイン」ボタン → Clerk プリビルト SignIn
 *  - ログイン中: Clerk の UserButton（プロフィール/ログアウト）をマウント
 *
 * @param {HTMLElement} container ヘッダー内のスロット要素
 */
export function initAuthButton(container) {
  if (!container) return;
  onAuthChange(render);

  function render(user) {
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

    if (user) {
      const mount = document.createElement('div');
      mount.className = 'auth-user-btn';
      container.appendChild(mount);
      mountUserButton(mount);
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
