import { cloneEditAsSnapshot } from '../state/snapshot.js';
import { showToast } from './toast.js';

/**
 * 登録ボタン。
 * options.getEditingId() が非 null のとき → 既存スケールを上書き更新（編集モード）
 * options.onComplete()  → 保存後に呼ばれる（編集モード解除など）
 */
export function initRegisterBtn(store, registerBtn, titleInputEl, options = {}) {
  registerBtn.addEventListener('click', () => {
    const title     = (titleInputEl?.value?.trim()) || '無題';
    const editingId = options.getEditingId?.() ?? null;

    let savedId = editingId;
    store.set(state => {
      const snap = { title, ...cloneEditAsSnapshot(state.edit) };
      if (editingId != null) {
        return {
          ...state,
          saved: state.saved.map(s => s.id === editingId ? { ...snap, id: editingId } : s),
        };
      }
      savedId = state.nextId;
      return { ...state, saved: [...state.saved, { ...snap, id: savedId }], nextId: savedId + 1 };
    });

    const wasUpdate = editingId != null;
    showToast(wasUpdate ? '更新しました' : '登録しました');
    options.onComplete?.();
    options.onSaved?.(savedId, wasUpdate);
  });
}
