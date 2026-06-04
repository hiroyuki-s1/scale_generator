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

function renderBtnContent(instrument) {
  const label = instrument ? LABELS[instrument] : '：楽器';
  return `<span class="instr-btn-label">${label}</span>
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
      const { edit } = store.get();
      // 同じ楽器なら何もしない
      if (chosen === edit.instrument) { modalEl.classList.remove('show'); return; }
      // 楽器が入れ替わるとスケールは初期化される。設定済みなら確認。
      if (edit.activeDegrees.size > 0) {
        if (!confirm('楽器を変更するとスケールがリセットされます。\nよろしいですか？')) return;
      }
      store.updateEdit({ instrument: chosen, activeDegrees: new Set(), presetName: null });
      modalEl.classList.remove('show');
    });
  });

  // Close on overlay click
  modalEl.addEventListener('click', e => {
    if (e.target === modalEl) modalEl.classList.remove('show');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl.classList.contains('show')) modalEl.classList.remove('show');
  });

  store.subscribe((s, p) => {
    if (p && s.edit.instrument === p.edit.instrument) return;
    refresh();
  });
}
