/**
 * 画面下部に一時的なトースト通知を出す共有プリミティブ。
 * 状態を持たない純粋な表示ユーティリティ（DOM 直接操作）。
 * 印刷時は CSS (#appToast) で非表示。
 *
 * @param {string} msg 表示メッセージ
 * @param {number} [ms=2200] 表示時間（ミリ秒）
 */
export function showToast(msg, ms = 2200) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), ms);
}
