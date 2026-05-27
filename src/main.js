import './styles/main.css';

import { DEFAULT_COLORS, PRESET_GROUPS } from './domain/constants.js';
import { buildTitle } from './domain/title.js';
import { createStore } from './state/store.js';
import { attachPersist, restoreFromStorage } from './state/persist.js';
import { cloneColors } from './state/snapshot.js';

import { initPiano } from './ui/piano.js';
import { initScaleSelector } from './ui/scaleSelector.js';
import { initDegreeToggle } from './ui/degreeToggle.js';
import { initMaskControl } from './ui/maskControl.js';
import { drawFretboard } from './ui/fretboardSvg.js';
import { renderLegend } from './ui/legend.js';
import { initTabs } from './ui/tabs.js';
import { initSavedTab } from './ui/savedTab.js';
import { initSaveModal } from './ui/saveModal.js';
import { initColorModal } from './ui/colorModal.js';
import { initLayoutPicker } from './ui/layoutPicker.js';
import { initOrientation } from './ui/orientation.js';
import { initPrintCss } from './print/printCss.js';

function findPreset(name) {
  for (const g of PRESET_GROUPS) {
    const p = g.presets.find(x => x.name === name);
    if (p) return p;
  }
  return null;
}

function defaultState() {
  const initial = findPreset('Minor Penta');
  return {
    edit: {
      rootIndex: 9,
      activeDegrees: new Set(initial.degrees),
      presetName: initial.name,
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
initScaleSelector(document.getElementById('scaleGroups'), store);
initDegreeToggle(document.getElementById('degBtns'), store, fretboardEl);
initMaskControl(document.getElementById('maskControl'), store);
initTabs(store);
initSavedTab(document.getElementById('savedGrid'), store);
initSaveModal(store, document.getElementById('saveBtn'));
initColorModal(store, document.getElementById('colorBtn'));
initLayoutPicker(store);
initOrientation(store);
initPrintCss(store);

document.getElementById('printBtn').addEventListener('click', () => window.print());

// Edit-tab fretboard. Skip full redraw when only activeDegrees changed —
// degreeToggle animates that diff in place. Full redraw covers root / preset /
// mask / colors changes.
function renderEdit(prevEdit) {
  const { edit } = store.get();
  titleEl.textContent = buildTitle(edit);
  renderLegend(legendEl, edit);
  const skipDrawForAnim =
    prevEdit
    && prevEdit.rootIndex === edit.rootIndex
    && prevEdit.mask === edit.mask
    && prevEdit.degreeColors === edit.degreeColors
    && prevEdit.activeDegrees !== edit.activeDegrees;
  if (!skipDrawForAnim) drawFretboard(fretboardEl, edit);
}
renderEdit(null);
store.subscribe((s, p) => {
  if (p && s.edit === p.edit) return;
  renderEdit(p?.edit);
});
