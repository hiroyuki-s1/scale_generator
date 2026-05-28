import { SCALE_GROUPS, CHORD_GROUPS, findPresetEverywhere } from '../domain/constants.js';

const GROUPS = [
  { label: 'ペンタトニック', presets: SCALE_GROUPS[0].presets, mode: 'scale' },
  { label: 'ダイアトニック',  presets: SCALE_GROUPS[1].presets, mode: 'scale' },
  { label: 'アドバンスド',   presets: SCALE_GROUPS[2].presets, mode: 'scale' },
  { label: 'コード / トライアド', presets: CHORD_GROUPS[0].presets, mode: 'chord' },
  { label: 'コード / 7th',       presets: CHORD_GROUPS[1].presets, mode: 'chord' },
  { label: 'コード / テンション', presets: CHORD_GROUPS[2].presets, mode: 'chord' },
];

/** 2段階スケール選択 + 反映ボタン */
export function initScalePicker(store) {
  const catSel   = document.getElementById('scaleCatSel');
  const nameSel  = document.getElementById('scaleNameSel');
  const applyBtn = document.getElementById('scaleApplyBtn');

  // 大カテゴリを構築
  GROUPS.forEach((g, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = g.label;
    catSel.appendChild(opt);
  });

  function fillNames() {
    const gi = parseInt(catSel.value);
    nameSel.innerHTML = '';
    GROUPS[gi].presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      nameSel.appendChild(opt);
    });
  }

  catSel.addEventListener('change', fillNames);
  applyBtn.addEventListener('click', () => {
    const found = findPresetEverywhere(nameSel.value);
    if (!found) return;
    store.updateEdit({
      presetName: found.preset.name,
      mode: found.mode,
      activeDegrees: new Set(found.preset.degrees),
    });
  });

  function syncSel() {
    const { presetName } = store.get().edit;
    if (!presetName) return;
    for (let gi = 0; gi < GROUPS.length; gi++) {
      if (GROUPS[gi].presets.some(p => p.name === presetName)) {
        catSel.value = gi;
        fillNames();
        nameSel.value = presetName;
        return;
      }
    }
  }

  fillNames();
  syncSel();
  store.subscribe((s, p) => {
    if (p && s.edit.presetName === p.edit.presetName) return;
    syncSel();
  });
}
