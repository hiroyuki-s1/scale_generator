import { cloneEditAsSnapshot } from '../state/snapshot.js';

/**
 * 登録ボタン。
 * options.getEditingId() が非 null のとき → 既存スケールを上書き更新（編集モード）
 * options.onComplete()  → 保存後に呼ばれる（編集モード解除など）
 */
export function initRegisterBtn(store, registerBtn, titleInputEl, options = {}) {
  registerBtn.addEventListener('click', () => {
    const title     = (titleInputEl?.value?.trim()) || '無題';
    const editingId = options.getEditingId?.() ?? null;

    store.set(state => {
      const snap = { title, ...cloneEditAsSnapshot(state.edit) };
      if (editingId != null) {
        return {
          ...state,
          saved: state.saved.map(s => s.id === editingId ? { ...snap, id: editingId } : s),
        };
      }
      const id = state.nextId;
      return { ...state, saved: [...state.saved, { ...snap, id }], nextId: id + 1 };
    });

    showToast(editingId != null ? '更新しました' : '登録しました');
    options.onComplete?.();
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
