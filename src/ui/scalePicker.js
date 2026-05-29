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

/** 2段階スケール選択（自動反映） */
export function initScalePicker(store) {
  const catSel  = document.getElementById('scaleCatSel');
  const nameSel = document.getElementById('scaleNameSel');

  // 先頭に「--（指定なし）」カテゴリを追加
  const blankCatOpt = document.createElement('option');
  blankCatOpt.value = '-1';
  blankCatOpt.textContent = '--';
  catSel.appendChild(blankCatOpt);

  // 大カテゴリを構築
  GROUPS.forEach((g, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = g.label;
    catSel.appendChild(opt);
  });

  function fillNames(gi) {
    nameSel.innerHTML = '';
    if (gi < 0) {
      // 指定なし選択時は名前セレクトも '--'
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '--';
      nameSel.appendChild(opt);
      return;
    }
    GROUPS[gi].presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = SCALE_NAME_JA[p.name] || p.name;
      nameSel.appendChild(opt);
    });
  }

  function applySelected() {
    const gi = parseInt(catSel.value);
    if (gi < 0) {
      // '--' 選択: 度数をクリア
      store.updateEdit({ presetName: null, activeDegrees: new Set() });
      return;
    }
    const found = findPresetEverywhere(nameSel.value);
    if (!found) return;
    const { edit } = store.get();
    // カスタム度数がある場合だけ警告（空 or プリセット選択中は警告不要）
    if (edit.presetName === null && edit.activeDegrees.size > 0) {
      if (!confirm('カスタム設定した度数が失われます。\nスケールを変更しますか？')) {
        syncSel();
        return;
      }
    }
    store.updateEdit({
      presetName: found.preset.name,
      mode: found.mode,
      activeDegrees: new Set(found.preset.degrees),
    });
  }

  catSel.addEventListener('change', () => {
    const gi = parseInt(catSel.value);
    fillNames(gi);
    applySelected();
  });
  nameSel.addEventListener('change', applySelected);

  function syncSel() {
    const { presetName } = store.get().edit;
    if (!presetName) {
      catSel.value = '-1';
      fillNames(-1);
      return;
    }
    for (let gi = 0; gi < GROUPS.length; gi++) {
      if (GROUPS[gi].presets.some(p => p.name === presetName)) {
        catSel.value = gi;
        fillNames(gi);
        nameSel.value = presetName;
        return;
      }
    }
  }

  fillNames(parseInt(catSel.value));
  syncSel();
  store.subscribe((s, p) => {
    if (p && s.edit.presetName === p.edit.presetName) return;
    syncSel();
  });
}
