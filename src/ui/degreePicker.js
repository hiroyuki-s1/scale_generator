import { DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** 度数設定モーダル — 四角グリッドボタン */
export function initDegreePicker(store) {
  const triggerBtn = document.getElementById('degPickerBtn');
  const modal      = document.getElementById('degPickerModal');
  const closeBtn   = document.getElementById('degPickerClose');
  const doneBtn    = document.getElementById('degPickerDone');
  const gridEl     = document.getElementById('degPickerPiano');
  const legendEl   = document.getElementById('legend');

  DEGREES.forEach(deg => {
    const btn = document.createElement('button');
    btn.className = 'picker-sq-btn';
    btn.dataset.semi = deg.semi;
    btn.textContent = deg.name;
    btn.addEventListener('click', () => toggle(deg.semi));
    gridEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  doneBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  // モーダルを開いた瞬間の度数集合スナップショット。閉じる時にこれと比較し、
  // 実際に変化があった場合のみ presetName=null (カスタム) を立てる。
  // 他のUI (scalePicker / instrumentPicker) はこのフラグを見て
  // 「カスタム設定が失われます」警告を出すか判断する。
  let openSnapshot = null;

  function openModal() {
    openSnapshot = new Set(store.get().edit.activeDegrees);
    syncStyles();
    modal.classList.add('show');
  }
  function closeModal() {
    modal.classList.remove('show');
    if (openSnapshot) {
      const cur = store.get().edit.activeDegrees;
      if (!setsEqual(openSnapshot, cur)) {
        store.updateEdit({ presetName: null });
      }
      openSnapshot = null;
    }
  }

  function syncStyles() {
    const { activeDegrees } = store.get().edit;
    gridEl.querySelectorAll('.picker-sq-btn').forEach(btn => {
      btn.classList.toggle('active', activeDegrees.has(Number(btn.dataset.semi)));
    });
  }

  function toggle(semi) {
    // モーダル内のトグルでは presetName は変更しない。
    // 閉じた時点で開時と差分があれば closeModal がカスタムフラグを立てる。
    store.updateEdit(edit => {
      const next = new Set(edit.activeDegrees);
      if (next.has(semi)) next.delete(semi); else next.add(semi);
      return { activeDegrees: next };
    });
  }

  function syncTrigger() {
    const { activeDegrees } = store.get().edit;
    triggerBtn.textContent = `スケール設定  設定数：${activeDegrees.size}`;
  }

  syncTrigger();
  renderLegend(legendEl, store.get().edit);

  store.subscribe((s, p) => {
    if (p && s.edit.activeDegrees === p.edit.activeDegrees) return;
    syncTrigger();
    renderLegend(legendEl, s.edit);
    if (modal.classList.contains('show')) syncStyles();
  });
}
