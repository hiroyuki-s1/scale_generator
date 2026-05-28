import { DEGREES } from '../domain/constants.js';
import { renderLegend } from './legend.js';

/** 度数設定ボタン + ドロップダウングリッド + 指板下の度数チップ表示 */
export function initDegreePicker(store) {
  const triggerBtn = document.getElementById('degPickerBtn');
  const popup      = document.getElementById('degPickerPopup');
  const gridEl     = document.getElementById('degPickerPiano');
  const doneBtn    = document.getElementById('degPickerDone');
  const legendEl   = document.getElementById('legend');

  let isOpen = false;

  // Build 12-degree grid once — all white, selected = red via CSS
  DEGREES.forEach(deg => {
    const semi = deg.semi;
    const btn = document.createElement('button');
    btn.className = 'note-key note-key-white';
    btn.dataset.semi = semi;
    btn.textContent = deg.name;
    btn.addEventListener('click', () => toggle(semi));
    gridEl.appendChild(btn);
  });

  triggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    isOpen ? close() : open();
  });
  doneBtn.addEventListener('click', close);
  document.addEventListener('click', e => {
    if (isOpen && !popup.contains(e.target) && e.target !== triggerBtn) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen) close();
  });

  function open() {
    isOpen = true;
    popup.classList.remove('hidden');
    position();
    syncStyles();
  }
  function close() {
    isOpen = false;
    popup.classList.add('hidden');
  }
  function position() {
    const r = triggerBtn.getBoundingClientRect();
    const pW = 340;
    let left = r.left;
    if (left + pW > window.innerWidth - 8) left = window.innerWidth - pW - 8;
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 160) {
      popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
      popup.style.top = 'auto';
    } else {
      popup.style.top    = `${r.bottom + 6}px`;
      popup.style.bottom = 'auto';
    }
    popup.style.left = `${Math.max(8, left)}px`;
  }

  function syncStyles() {
    const { activeDegrees } = store.get().edit;
    gridEl.querySelectorAll('.note-key').forEach(btn => {
      btn.classList.toggle('note-key-active', activeDegrees.has(Number(btn.dataset.semi)));
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
    if (isOpen) syncStyles();
  });
}
