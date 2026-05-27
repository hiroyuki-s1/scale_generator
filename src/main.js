import './styles/main.css';

import { DEFAULT_COLORS, findPresetEverywhere, SVG } from './domain/constants.js';
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

// Show build version
/* global __COMMIT__ */
const verEl = document.getElementById('buildVer');
if (verEl) verEl.textContent = typeof __COMMIT__ !== 'undefined' ? __COMMIT__ : '';

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
initIrealTab(store, openFbFullscreen);
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

// ---- Fullscreen fretboard (shared: edit tab click + iReal fretboard click) ----
const fbFullscreen      = document.getElementById('fbFullscreen');
const fbFullscreenSvg   = document.getElementById('fbFullscreenSvg');
const fbFullscreenTitle = document.getElementById('fbFullscreenTitle');
const fbFullscreenLegend = document.getElementById('fbFullscreenLegend');
const fbFullscreenClose  = document.getElementById('fbFullscreenClose');
let fsPrevState = null;

drawFretboardBase(fbFullscreenSvg);

function openFbFullscreen(state) {
  fbFullscreenTitle.textContent = buildTitle(state);
  applyFretboardDiff(fbFullscreenSvg, state, fsPrevState);
  fsPrevState = state;
  renderLegend(fbFullscreenLegend, state);
  // Crop viewBox to mask range when mask is enabled
  const vb = maskViewBox(state.mask);
  fbFullscreenSvg.setAttribute('viewBox', vb || `0 0 ${SVG.W} ${SVG.H}`);
  fbFullscreen.classList.remove('hidden');
}

function closeFbFullscreen() {
  fbFullscreen.classList.add('hidden');
  fbFullscreenSvg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  fsPrevState = null; // force full re-render next open (viewBox may have changed)
}

fbFullscreenClose.addEventListener('click', closeFbFullscreen);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !fbFullscreen.classList.contains('hidden')) closeFbFullscreen();
});

// Click the edit tab's fretboard (SVG wrap only) to enlarge
fretboardEl.closest('.fb-wrap').addEventListener('click', () => {
  openFbFullscreen(store.get().edit);
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
