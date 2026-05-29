import { DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

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

  function openModal() {
    syncStyles();
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }

  function syncStyles() {
    const { activeDegrees } = store.get().edit;
    gridEl.querySelectorAll('.picker-sq-btn').forEach(btn => {
      btn.classList.toggle('active', activeDegrees.has(Number(btn.dataset.semi)));
    });
  }

  function toggle(semi) {
    store.updateEdit(edit => {
      const next = new Set(edit.activeDegrees);
      if (next.has(semi)) next.delete(semi); else next.add(semi);
      return { activeDegrees: next, presetName: null };
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
