import { cloneEditAsSnapshot } from '../state/snapshot.js';

/** 登録ボタン: モーダルなしで即座に保存 + トーストを表示 */
export function initRegisterBtn(store, registerBtn, titleInputEl) {
  registerBtn.addEventListener('click', () => {
    const title = (titleInputEl?.value?.trim()) || '無題';
    store.set(state => {
      const id = state.nextId;
      const snap = { id, title, ...cloneEditAsSnapshot(state.edit) };
      return { ...state, saved: [...state.saved, snap], nextId: id + 1 };
    });
    showToast('登録しました');
  });
}

function showToast(msg) {
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
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}
