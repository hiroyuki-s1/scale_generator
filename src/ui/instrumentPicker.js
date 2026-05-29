/**
 * 楽器選択ボタン + ポップアップ (Guitar / Bass)
 *
 * initInstrumentPicker(btnEl, modalEl, store)
 *   - btnEl:   #instrumentBtn  — 現在の楽器を表示するボタン
 *   - modalEl: #instrumentModal — 選択ポップアップ
 */

const LABELS = {
  guitar: 'Guitar',
  bass:   'Bass',
};

// SVG icon paths — simplified silhouettes
const GUITAR_ICON = `<svg viewBox="0 0 36 90" fill="currentColor" aria-hidden="true">
  <!-- Headstock -->
  <rect x="13" y="0" width="10" height="7" rx="3"/>
  <!-- Nut + neck -->
  <rect x="15.5" y="5" width="5" height="24" rx="1"/>
  <!-- Body: upper bout -->
  <ellipse cx="18" cy="36" rx="12" ry="10"/>
  <!-- Body: lower bout -->
  <ellipse cx="18" cy="56" rx="14" ry="15"/>
  <!-- Sound hole -->
  <circle cx="18" cy="56" r="5.5" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
  <!-- Tuning pegs (3 each side) -->
  <circle cx="11" cy="2" r="1.8"/><circle cx="11" cy="7" r="1.8"/><circle cx="11" cy="12" r="1.8"/>
  <circle cx="25" cy="2" r="1.8"/><circle cx="25" cy="7" r="1.8"/><circle cx="25" cy="12" r="1.8"/>
</svg>`;

const BASS_ICON = `<svg viewBox="0 0 36 100" fill="currentColor" aria-hidden="true">
  <!-- Headstock (4 pegs) -->
  <rect x="13" y="0" width="10" height="7" rx="3"/>
  <!-- Nut + neck (longer than guitar) -->
  <rect x="15.5" y="5" width="5" height="34" rx="1"/>
  <!-- Body: upper bout -->
  <ellipse cx="18" cy="48" rx="12" ry="10"/>
  <!-- Body: lower bout -->
  <ellipse cx="18" cy="68" rx="14" ry="16"/>
  <!-- Sound hole -->
  <ellipse cx="18" cy="70" rx="5" ry="5.5" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
  <!-- 4 tuning pegs -->
  <circle cx="11" cy="2" r="1.8"/><circle cx="11" cy="8" r="1.8"/>
  <circle cx="25" cy="2" r="1.8"/><circle cx="25" cy="8" r="1.8"/>
</svg>`;

function renderBtnContent(instrument) {
  if (!instrument) {
    return `<span class="instr-btn-icon instr-icon-placeholder">🎸</span>
            <span class="instr-btn-label">：楽器</span>
            <svg class="instr-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="2,3.5 5,6.5 8,3.5"/></svg>`;
  }
  const icon = instrument === 'bass' ? BASS_ICON : GUITAR_ICON;
  return `<span class="instr-btn-icon">${icon}</span>
          <span class="instr-btn-label">${LABELS[instrument]}</span>
          <svg class="instr-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="2,3.5 5,6.5 8,3.5"/></svg>`;
}

export function initInstrumentPicker(btnEl, modalEl, store) {
  function refresh() {
    const instrument = store.get().edit.instrument;
    btnEl.innerHTML = renderBtnContent(instrument);
    btnEl.classList.toggle('instr-btn--selected', !!instrument);
  }

  refresh();

  // Open modal
  btnEl.addEventListener('click', () => {
    const current = store.get().edit.instrument;
    modalEl.querySelectorAll('.instr-choice-btn').forEach(b => {
      b.classList.toggle('instr-choice-btn--active', b.dataset.instrument === current);
    });
    modalEl.classList.add('show');
  });

  // Choice buttons
  modalEl.querySelectorAll('.instr-choice-btn').forEach(choiceBtn => {
    choiceBtn.addEventListener('click', () => {
      const chosen = choiceBtn.dataset.instrument;
      store.updateEdit({ instrument: chosen });
      modalEl.classList.remove('show');
    });
  });

  // Close on overlay click
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) modalEl.classList.remove('show');
  });

  store.subscribe((s, p) => {
    if (p && s.edit.instrument === p.edit.instrument) return;
    refresh();
  });
}
