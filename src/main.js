import './styles/main.css';

import { DEFAULT_COLORS, findPresetEverywhere } from './domain/constants.js';
import { buildTitle } from './domain/title.js';
import { createStore } from './state/store.js';
import { attachPersist, restoreFromStorage } from './state/persist.js';
import { cloneColors } from './state/snapshot.js';

import { initPiano } from './ui/piano.js';
import { initPresetSelector } from './ui/presetSelector.js';
import { initDegreeToggle } from './ui/degreeToggle.js';
import { initMaskControl } from './ui/maskControl.js';
import {
  drawFretboardBase,
  applyFretboardDiff,
  maskViewBox,
  setMaskOverlayVisible,
} from './ui/fretboardSvg.js';
import { renderLegend } from './ui/legend.js';
import { initTabs } from './ui/tabs.js';
import { initSavedTab } from './ui/savedTab.js';
import { initSaveModal } from './ui/saveModal.js';
import { initColorModal } from './ui/colorModal.js';
import { initIrealTab } from './ui/irealTab.js';
import { initLayoutPicker } from './ui/layoutPicker.js';
import { initOrientation } from './ui/orientation.js';
import { initPrintCss } from './print/printCss.js';

function defaultState() {
  const initial = findPresetEverywhere('Minor Penta');
  return {
    edit: {
      rootIndex: 9,
      activeDegrees: new Set(initial.preset.degrees),
      presetName: initial.preset.name,
      mode: initial.mode,
      mask: { enabled: false, min: 1, max: 15 },
      degreeColors: cloneColors(DEFAULT_COLORS),
    },
    saved: [],
    layout: { orientation: 'landscape', cols: 2, rows: 3 },
    activeTab: 'edit',
    nextId: 1,
  };
}

const store = createStore(restoreFromStorage() || defaultState());
attachPersist(store);

const fretboardEl = document.getElementById('fretboard');
const titleEl     = document.getElementById('fbTitle');
const legendEl    = document.getElementById('legend');

initPiano(document.getElementById('piano'), store);
initPresetSelector(document.getElementById('presetSelectorMount'), store);
initDegreeToggle(document.getElementById('degBtns'), store);
initMaskControl(document.getElementById('maskControl'), store);
initTabs(store);
initSavedTab(document.getElementById('savedGrid'), store);
initSaveModal(store, document.getElementById('saveBtn'));
initColorModal(store, document.getElementById('colorBtn'));
initIrealTab(store);
initLayoutPicker(store);
initOrientation(store);
initPrintCss(store);

document.getElementById('printBtn').addEventListener('click', () => window.print());

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('保存済みデータをすべて消去してリセットしますか？\nこの操作は元に戻せません。')) {
    localStorage.clear();
    location.reload();
  }
});

// Edit-tab fretboard: draw the static base once, then diff-apply on every
// edit change. The diff naturally handles all transitions (root, preset,
// mode, mask range, degree toggle, color) — only the actual delta animates.
drawFretboardBase(fretboardEl);
applyFretboardDiff(fretboardEl, store.get().edit, null);
titleEl.textContent = buildTitle(store.get().edit);
renderLegend(legendEl, store.get().edit);

store.subscribe((s, p) => {
  if (p && s.edit === p.edit) return;
  titleEl.textContent = buildTitle(s.edit);
  renderLegend(legendEl, s.edit);
  applyFretboardDiff(fretboardEl, s.edit, p?.edit);
});

// ---- Print: crop saved-card SVGs to the mask range and hide overlays ----
const printOriginalViewBox = new WeakMap();

window.addEventListener('beforeprint', () => {
  store.get().saved.forEach(snap => {
    const svg = document.getElementById('sv' + snap.id);
    if (!svg) return;
    const vb = maskViewBox(snap.mask);
    if (!vb) return;
    printOriginalViewBox.set(svg, svg.getAttribute('viewBox'));
    svg.setAttribute('viewBox', vb);
    setMaskOverlayVisible(svg, false);
  });
});

window.addEventListener('afterprint', () => {
  store.get().saved.forEach(snap => {
    const svg = document.getElementById('sv' + snap.id);
    if (!svg) return;
    const original = printOriginalViewBox.get(svg);
    if (original) {
      svg.setAttribute('viewBox', original);
      printOriginalViewBox.delete(svg);
    }
    setMaskOverlayVisible(svg, true);
  });
});
