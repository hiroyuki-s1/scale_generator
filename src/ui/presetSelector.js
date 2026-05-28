import { SCALE_GROUPS, CHORD_GROUPS, findPresetEverywhere } from '../domain/constants.js';

/**
 * Single native <select> for both scale and chord presets, with optgroup
 * sections. Mode is inferred from the chosen name.
 */
export function initPresetSelector(container, store) {
  container.innerHTML = `
    <select class="preset-select" id="presetSelect" aria-label="プリセット">
      ${optgroupHtml('スケール / Penta',     SCALE_GROUPS[0])}
      ${optgroupHtml('スケール / チャーチモード', SCALE_GROUPS[1])}
      ${optgroupHtml('スケール / Advanced',  SCALE_GROUPS[2])}
      ${optgroupHtml('コード / Triad',       CHORD_GROUPS[0])}
      ${optgroupHtml('コード / 7th',         CHORD_GROUPS[1])}
      ${optgroupHtml('コード / Extended',    CHORD_GROUPS[2])}
      <optgroup label="その他">
        <option value="__custom__">カスタム（度数を直接編集）</option>
      </optgroup>
    </select>
  `;

  const sel = container.querySelector('select');
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v === '__custom__') {
      store.updateEdit({ presetName: null });
      return;
    }
    const found = findPresetEverywhere(v);
    if (!found) return;
    store.updateEdit({
      presetName: found.preset.name,
      mode: found.mode,
      activeDegrees: new Set(found.preset.degrees),
    });
  });

  function sync() {
    const pn = store.get().edit.presetName;
    sel.value = pn || '__custom__';
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.edit.presetName === p.edit.presetName) return;
    sync();
  });
}

function optgroupHtml(label, group) {
  const opts = group.presets
    .map(p => `<option value="${p.name}">${p.name}</option>`)
    .join('');
  return `<optgroup label="${label}">${opts}</optgroup>`;
}
