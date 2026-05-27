import { parseIrealUrl } from '../domain/ireal.js';
import { qualityToChordTones } from '../domain/chordTones.js';
import { SCALE_GROUPS, DEGREES } from '../domain/constants.js';
import { findPresetEverywhere } from '../domain/constants.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';
import { cloneColors } from '../state/snapshot.js';

/**
 * Dedicated iReal Pro tab.
 *
 * - URL/file input → parse → deduplicated chord chip grid
 * - Click a chip → shows fretboard with chord tones as default degrees
 * - Scale selector and degree toggle buttons to customise
 * - Save button saves the current chord/scale as a snapshot
 */
export function initIrealTab(store, openFullscreen) {
  const fileBtn        = document.getElementById('irealFileBtn');
  const input          = document.getElementById('irealInput');
  const parseBtn       = document.getElementById('irealParseBtn');
  const tabEl          = document.getElementById('tabIreal');
  const mainEl         = document.getElementById('irealMain');
  const songNameEl     = document.getElementById('irealSongName');
  const gridEl         = document.getElementById('irealChordGrid');
  const editChordEl    = document.getElementById('irealEditChord');
  const scaleSelect    = document.getElementById('irealScaleSelect');
  const saveBtn        = document.getElementById('irealSaveBtn');
  const degBtnsEl      = document.getElementById('irealDegBtns');
  const fbEl           = document.getElementById('irealFretboard');
  const fbWrapEl       = fbEl.closest('.fb-wrap');
  const legendEl       = document.getElementById('irealLegend');
  const maskEl         = document.getElementById('irealMaskControl');
  const drawerEl       = document.getElementById('irealDrawer');
  const drawerHandle   = document.getElementById('irealDrawerHandle');
  const drawerToggleEl = document.getElementById('irealDrawerToggle');

  // Local state
  let chords      = [];
  let songTitle   = '';
  let currentIdx  = -1;
  let currentRoot = 0;
  let currentDegrees = new Set();
  let currentMask = { enabled: false, min: 1, max: 15 };
  let prevFbState = null;

  // Init the iReal fretboard base (static decorations)
  drawFretboardBase(fbEl);

  // Populate scale selector
  buildScaleSelect(scaleSelect);

  // Init mask control
  initMaskUI();

  // ── Drawer toggle ────────────────────────────────────────────────────────
  drawerHandle.addEventListener('click', e => {
    if (e.target.closest('select') || e.target.closest('.ireal-save-btn')) return;
    if (currentIdx < 0) return;
    toggleDrawer();
  });

  // ── File input (hidden) ──────────────────────────────────────────────────
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.irealb,.html';
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(fileInput);

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // ── Drag-and-drop onto the tab pane ─────────────────────────────────────
  tabEl.addEventListener('dragover', e => {
    e.preventDefault();
    tabEl.classList.add('drag-over');
  });
  tabEl.addEventListener('dragleave', () => tabEl.classList.remove('drag-over'));
  tabEl.addEventListener('drop', e => {
    e.preventDefault();
    tabEl.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // ── Fretboard click: open fullscreen ─────────────────────────────────────
  if (openFullscreen) {
    fbWrapEl.addEventListener('click', () => {
      if (currentIdx >= 0) openFullscreen(getFbState());
    });
  }

  // ── Parse trigger ────────────────────────────────────────────────────────
  parseBtn.addEventListener('click', parse);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') parse(); });

  // ── Scale selector ───────────────────────────────────────────────────────
  scaleSelect.addEventListener('change', () => {
    const name = scaleSelect.value;
    if (name === '__chord__') {
      if (currentIdx >= 0) {
        currentDegrees = new Set(qualityToChordTones(chords[currentIdx].quality));
        updateDegBtns();
        updateFretboard();
      }
      return;
    }
    const result = findPresetEverywhere(name);
    if (result) {
      currentDegrees = new Set(result.preset.degrees);
      updateDegBtns();
      updateFretboard();
    }
  });

  // ── Save current chord ───────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    if (currentIdx < 0) return;
    const c = chords[currentIdx];
    const scaleName = scaleSelect.value === '__chord__'
      ? `${c.displayName} chord`
      : scaleSelect.value;
    store.set(state => {
      const snap = {
        id: state.nextId,
        title: `${songTitle} — ${c.displayName} (${scaleName})`,
        rootIndex: currentRoot,
        activeDegrees: new Set(currentDegrees),
        presetName: scaleName,
        mode: 'scale',
        mask: { ...currentMask },
        degreeColors: cloneColors(state.edit.degreeColors),
      };
      return { ...state, saved: [...state.saved, snap], nextId: state.nextId + 1 };
    });
  });

  // ────────────────────────────────────────────────────────────────────────

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = e => { input.value = e.target.result; parse(); };
    reader.readAsText(file);
  }

  function parse() {
    const url = input.value.trim();
    if (!url) return;
    try {
      const song = parseIrealUrl(url);
      const seen = new Set();
      chords = song.chords.filter(c => {
        if (seen.has(c.displayName)) return false;
        seen.add(c.displayName);
        return true;
      });
      songTitle = song.title;
      currentIdx = -1;
      songNameEl.textContent = `${song.title}  /  Key: ${song.key}`;
      mainEl.classList.remove('hidden');
      drawerEl.classList.remove('open');
      buildGrid();
      if (chords.length > 0) selectChord(0);
    } catch (e) {
      songNameEl.textContent = `エラー: ${e.message}`;
      mainEl.classList.remove('hidden');
    }
  }

  function buildGrid() {
    gridEl.innerHTML = '';
    chords.forEach((c, i) => {
      const chip = document.createElement('button');
      chip.className = 'ireal-chip';
      const sym = document.createElement('span');
      sym.className = 'ireal-chip-sym';
      sym.textContent = c.displayName;
      const sc = document.createElement('span');
      sc.className = 'ireal-chip-scale';
      sc.textContent = c.scaleName;
      chip.appendChild(sym);
      chip.appendChild(sc);
      chip.addEventListener('click', () => selectChord(i));
      gridEl.appendChild(chip);
    });
  }

  function selectChord(idx) {
    currentIdx = idx;
    const c = chords[idx];
    currentRoot = c.rootPc;
    currentDegrees = new Set(qualityToChordTones(c.quality));

    // Highlight active chip
    gridEl.querySelectorAll('.ireal-chip').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });

    editChordEl.textContent = c.displayName;
    scaleSelect.value = '__chord__';

    updateDegBtns();
    updateFretboard();
    openDrawer();
  }

  function getFbState() {
    return {
      rootIndex: currentRoot,
      activeDegrees: currentDegrees,
      presetName: currentIdx >= 0 ? chords[currentIdx].displayName : '',
      mode: 'scale',
      mask: { ...currentMask },
      degreeColors: store.get().edit.degreeColors,
    };
  }

  function openDrawer() {
    drawerEl.classList.add('open');
    drawerToggleEl.textContent = '▼';
  }

  function toggleDrawer() {
    const isOpen = drawerEl.classList.contains('open');
    drawerEl.classList.toggle('open');
    drawerToggleEl.textContent = isOpen ? '▲' : '▼';
  }

  function initMaskUI() {
    maskEl.innerHTML = `
      <button class="btn-mask" data-el="toggle">Mask OFF</button>
      <div class="mask-sliders" data-el="sliders" style="display:none">
        <div class="mslider-group">
          <span class="mslider-lbl">Min</span>
          <input type="range" class="mslider" data-el="min" min="1" max="15" value="1">
          <span class="mval" data-el="minVal">1</span>
        </div>
        <span class="msep">—</span>
        <div class="mslider-group">
          <span class="mslider-lbl">Max</span>
          <input type="range" class="mslider" data-el="max" min="1" max="15" value="15">
          <span class="mval" data-el="maxVal">15</span>
        </div>
      </div>
    `;

    const toggle   = maskEl.querySelector('[data-el="toggle"]');
    const sliders  = maskEl.querySelector('[data-el="sliders"]');
    const minIn    = maskEl.querySelector('[data-el="min"]');
    const maxIn    = maskEl.querySelector('[data-el="max"]');
    const minLabel = maskEl.querySelector('[data-el="minVal"]');
    const maxLabel = maskEl.querySelector('[data-el="maxVal"]');

    toggle.addEventListener('click', () => {
      currentMask = { ...currentMask, enabled: !currentMask.enabled };
      syncMask(toggle, sliders, minIn, maxIn, minLabel, maxLabel);
      updateFretboard();
    });

    minIn.addEventListener('input', () => {
      let lo = parseInt(minIn.value);
      let hi = parseInt(maxIn.value);
      if (lo > hi) hi = lo;
      currentMask = { ...currentMask, min: lo, max: hi };
      syncMask(toggle, sliders, minIn, maxIn, minLabel, maxLabel);
      updateFretboard();
    });

    maxIn.addEventListener('input', () => {
      let lo = parseInt(minIn.value);
      let hi = parseInt(maxIn.value);
      if (hi < lo) lo = hi;
      currentMask = { ...currentMask, min: lo, max: hi };
      syncMask(toggle, sliders, minIn, maxIn, minLabel, maxLabel);
      updateFretboard();
    });

    syncMask(toggle, sliders, minIn, maxIn, minLabel, maxLabel);
  }

  function syncMask(toggle, sliders, minIn, maxIn, minLabel, maxLabel) {
    toggle.textContent = currentMask.enabled ? 'Mask ON' : 'Mask OFF';
    toggle.classList.toggle('on', currentMask.enabled);
    sliders.style.display = currentMask.enabled ? 'flex' : 'none';
    minIn.value = currentMask.min;
    maxIn.value = currentMask.max;
    minLabel.textContent = currentMask.min;
    maxLabel.textContent = currentMask.max;
  }

  function updateFretboard() {
    const state = getFbState();
    applyFretboardDiff(fbEl, state, prevFbState);
    prevFbState = state;
    renderLegend(legendEl, state);
  }

  function updateDegBtns() {
    degBtnsEl.innerHTML = '';
    DEGREES.forEach(({ name, semi }) => {
      const isRoot = semi === 0;
      const btn = document.createElement('button');
      btn.className = 'deg-btn' + (currentDegrees.has(semi) ? ' active' : '') + (isRoot ? ' root' : '');
      btn.textContent = name;
      if (!isRoot) {
        btn.addEventListener('click', () => {
          if (currentDegrees.has(semi)) {
            currentDegrees = new Set([...currentDegrees].filter(d => d !== semi));
          } else {
            currentDegrees = new Set([...currentDegrees, semi]);
          }
          btn.classList.toggle('active', currentDegrees.has(semi));
          // update scale select to show as custom if degrees no longer match a preset
          updateFretboard();
        });
      }
      degBtnsEl.appendChild(btn);
    });
  }

  function buildScaleSelect(select) {
    const defOpt = document.createElement('option');
    defOpt.value = '__chord__';
    defOpt.textContent = 'コードトーン';
    select.appendChild(defOpt);

    for (const group of SCALE_GROUPS) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const preset of group.presets) {
        const opt = document.createElement('option');
        opt.value = preset.name;
        opt.textContent = preset.name;
        optgroup.appendChild(opt);
      }
      select.appendChild(optgroup);
    }
  }
}
