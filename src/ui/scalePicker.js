import { SCALE_GROUPS, CHORD_GROUPS, findPresetEverywhere } from '../domain/constants.js';
import { SCALE_NAME_JA } from '../domain/i18n.js';

const GROUPS = [
  { label: 'ペンタトニック', presets: SCALE_GROUPS[0].presets, mode: 'scale' },
  { label: 'ダイアトニック',  presets: SCALE_GROUPS[1].presets, mode: 'scale' },
  { label: 'アドバンスド',   presets: SCALE_GROUPS[2].presets, mode: 'scale' },
  { label: 'コード / トライアド', presets: CHORD_GROUPS[0].presets, mode: 'chord' },
  { label: 'コード / 7th',       presets: CHORD_GROUPS[1].presets, mode: 'chord' },
  { label: 'コード / テンション', presets: CHORD_GROUPS[2].presets, mode: 'chord' },
];

/** モーダル型スケール / コード選択 */
export function initScalePicker(store) {
  const btn        = document.getElementById('scalePickerBtn');
  const btnText    = document.getElementById('scalePickerBtnText');
  const modal      = document.getElementById('scalePickerModal');
  const closeBtn   = document.getElementById('scalePickerClose');
  const catList    = document.getElementById('scaleCatList');
  const nameList   = document.getElementById('scaleNameList');

  // ── カテゴリリスト構築 ──────────────────────────────
  GROUPS.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'scale-cat-item';
    b.textContent = g.label;
    b.dataset.idx = i;
    b.addEventListener('click', () => selectCat(i));
    catList.appendChild(b);
  });

  function selectCat(i) {
    catList.querySelectorAll('.scale-cat-item').forEach((b, bi) =>
      b.classList.toggle('active', bi === i));
    fillNames(i);
  }

  function fillNames(gi) {
    const { presetName } = store.get().edit;
    nameList.innerHTML = '';
    GROUPS[gi].presets.forEach(p => {
      const b = document.createElement('button');
      b.className = 'scale-name-item';
      b.textContent = SCALE_NAME_JA[p.name] || p.name;
      b.classList.toggle('active', p.name === presetName);
      b.addEventListener('click', () => applyPreset(p.name));
      nameList.appendChild(b);
    });
  }

  function applyPreset(name) {
    const found = findPresetEverywhere(name);
    if (!found) return;
    const { edit } = store.get();
    if (edit.presetName === null && edit.activeDegrees.size > 0) {
      if (!confirm('カスタム設定した度数が失われます。\nスケールを変更しますか？')) return;
    }
    store.updateEdit({
      presetName: found.preset.name,
      mode: found.mode,
      activeDegrees: new Set(found.preset.degrees),
    });
    closeModal();
  }

  function openModal() {
    // 現在のプリセットに合わせてカテゴリを初期選択
    const { presetName } = store.get().edit;
    let initCat = 0;
    if (presetName) {
      for (let i = 0; i < GROUPS.length; i++) {
        if (GROUPS[i].presets.some(p => p.name === presetName)) { initCat = i; break; }
      }
    }
    selectCat(initCat);
    modal.classList.add('show');
  }

  function closeModal() { modal.classList.remove('show'); }

  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // ── ボタンラベル同期 ──────────────────────────────────
  function syncBtn() {
    const { presetName } = store.get().edit;
    if (!presetName) {
      btnText.textContent = 'スケール選択 ▾';
      return;
    }
    // カテゴリラベルを探す
    for (const g of GROUPS) {
      const found = g.presets.find(p => p.name === presetName);
      if (found) {
        btnText.textContent = `${g.label} / ${SCALE_NAME_JA[found.name] || found.name} ▾`;
        return;
      }
    }
    btnText.textContent = `${presetName} ▾`;
  }

  syncBtn();
  store.subscribe((s, p) => {
    if (p && s.edit.presetName === p.edit.presetName) return;
    syncBtn();
  });
}
