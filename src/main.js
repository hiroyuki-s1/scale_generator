import './styles/main.css';

import { DEFAULT_COLORS, findPresetEverywhere, SVG } from './domain/constants.js';
import { buildTitle } from './domain/title.js';
import { localizeTitle } from './domain/i18n.js';
import { createStore } from './state/store.js';
import { attachPersist, restoreFromStorage } from './state/persist.js';
import { cloneColors } from './state/snapshot.js';

import { initKeyPicker }    from './ui/keyPicker.js';
import { initScalePicker }  from './ui/scalePicker.js';
import { initDegreePicker } from './ui/degreePicker.js';
import { initMaskControl }  from './ui/maskControl.js';
import { initRegisterBtn }  from './ui/registerBtn.js';
import { initSavedTab }     from './ui/savedTab.js';
import { initColorModal }   from './ui/colorModal.js';
import { initIrealSection } from './ui/irealTab.js';
import { initLayoutPicker } from './ui/layoutPicker.js';
import { initHeaderMenu }   from './ui/headerMenu.js';
import { initPrintCss }     from './print/printCss.js';
import {
  drawFretboardBase,
  applyFretboardDiff,
  maskViewBox,
  setMaskOverlayVisible,
} from './ui/fretboardSvg.js';
import { renderLegend } from './ui/legend.js';

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

// ── 指板 ──────────────────────────────────────────────────────────────
const fretboardEl = document.getElementById('fretboard');
drawFretboardBase(fretboardEl);
applyFretboardDiff(fretboardEl, store.get().edit, null);

store.subscribe((s, p) => {
  if (p && s.edit === p.edit) return;
  applyFretboardDiff(fretboardEl, s.edit, p?.edit);
});

// ── スケール名入力 ────────────────────────────────────────────────────
const titleInputEl = document.getElementById('fbTitleInput');
let userEditedTitle = false;

function autoTitle(edit) {
  if (!userEditedTitle) titleInputEl.value = localizeTitle(buildTitle(edit));
}
autoTitle(store.get().edit);

titleInputEl.addEventListener('input', () => { userEditedTitle = true; });
store.subscribe((s, p) => {
  if (!p) return;
  if (s.edit.rootIndex !== p.edit.rootIndex || s.edit.presetName !== p.edit.presetName) {
    userEditedTitle = false;
    autoTitle(s.edit);
  }
});

// ── コントロール初期化 ─────────────────────────────────────────────────
initKeyPicker(store);
initScalePicker(store);
initDegreePicker(store);
initMaskControl(document.getElementById('maskControl'), store);
// ── 編集モード管理 ────────────────────────────────────────────────────
let editingId = null;

function setEditMode(snap) {
  editingId = snap.id;
  const banner = document.getElementById('editorModeBanner');
  // Re-trigger animation by cloning
  banner.className = 'editor-mode-banner edit-mode';
  banner.style.animation = 'none';
  requestAnimationFrame(() => { banner.style.animation = ''; });
  document.getElementById('editorModeLabel').innerHTML =
    '<span class="editor-mode-label-icon">✏️</span>編集中';
  document.getElementById('registerBtnLabel').textContent = '更新';
  document.getElementById('editorModeCancel').classList.remove('hidden');
  document.querySelector('.editor')?.classList.add('editor--edit-mode');
  savedTab?.applyEditingHighlight(snap.id);
}

function clearEditMode() {
  editingId = null;
  const banner = document.getElementById('editorModeBanner');
  banner.className = 'editor-mode-banner new-mode';
  banner.style.animation = 'none';
  requestAnimationFrame(() => { banner.style.animation = ''; });
  document.getElementById('editorModeLabel').innerHTML =
    '<span class="editor-mode-label-icon">✨</span>新規登録';
  document.getElementById('registerBtnLabel').textContent = '登録';
  document.getElementById('editorModeCancel').classList.add('hidden');
  document.querySelector('.editor')?.classList.remove('editor--edit-mode');
  savedTab?.applyEditingHighlight(null);
}

function loadSnapToEditor(snap) {
  store.updateEdit({
    rootIndex: snap.rootIndex,
    activeDegrees: new Set(snap.activeDegrees),
    presetName: snap.presetName,
    mode: snap.mode,
    mask: { ...snap.mask },
    degreeColors: snap.degreeColors,
  });
  titleInputEl.value = snap.title;
  userEditedTitle = true;
  setEditMode(snap);
  tabNav.querySelector('[data-tab="editor"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('editorModeCancel').addEventListener('click', () => {
  if (!confirm('編集をキャンセルします。\n変更内容は破棄されます。よろしいですか？')) return;
  clearEditMode();
});

const savedTab = initSavedTab(document.getElementById('savedGrid'), store, (state, title) => openFbFullscreen(state, title), loadSnapToEditor);

initRegisterBtn(store, document.getElementById('registerBtn'), titleInputEl, {
  getEditingId: () => editingId,
  onComplete: clearEditMode,
  onSaved: (id, isUpdate) => {
    // 新規登録後はエディターを空状態に初期化
    if (!isUpdate) {
      store.updateEdit({ activeDegrees: new Set(), presetName: null });
      userEditedTitle = false;
      titleInputEl.value = '';
    }
    // 登録スケールタブへスライド移動
    const savedBtn = tabNav.querySelector('[data-tab="saved"]');
    savedBtn?.click();
    // カードが描画されてからハイライト
    requestAnimationFrame(() => requestAnimationFrame(() => savedTab.highlightNewCard(id, isUpdate)));
  },
});
initColorModal(store, document.getElementById('colorBtn'));
initIrealSection(store);
initLayoutPicker(store);
initHeaderMenu(store);
initPrintCss(store);

// ── タブナビゲーション ─────────────────────────────────────────────────
const tabNav      = document.getElementById('tabNav');
const panelEditor = document.getElementById('panelEditor');
const panelSaved  = document.getElementById('panelSaved');
tabNav.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tabNav.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    const goingSaved = btn.dataset.tab === 'saved';
    panelEditor.classList.toggle('hidden', goingSaved);
    panelSaved.classList.toggle('hidden', !goingSaved);
    if (!goingSaved) savedTab.clearNewlyAdded();
    // スライドアニメーション
    const panel = goingSaved ? panelSaved : panelEditor;
    panel.classList.remove('slide-in-left', 'slide-in-right');
    requestAnimationFrame(() => panel.classList.add(goingSaved ? 'slide-in-right' : 'slide-in-left'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});

// ── 保存済みバッジ + 全削除ボタン表示制御 ─────────────────────────────
const savedBadgeEl    = document.getElementById('savedBadge');
const savedSectionHdr = document.getElementById('savedSectionHdr');
function updateSavedCount(n) {
  if (savedBadgeEl) {
    savedBadgeEl.textContent = n;
    savedBadgeEl.style.display = n > 0 ? '' : 'none';
  }
  if (savedSectionHdr) savedSectionHdr.style.display = n > 0 ? '' : 'none';
}
updateSavedCount(store.get().saved.length);
store.subscribe((s, p) => {
  if (p && s.saved.length === p.saved.length) return;
  updateSavedCount(s.saved.length);
});

// ── 一括削除ボタン ─────────────────────────────────────────────────────
document.getElementById('deleteAllBtn').addEventListener('click', () => {
  const { saved } = store.get();
  if (saved.length === 0) return;
  if (!confirm(`登録済みのスケール ${saved.length} 件をすべて削除します。\nこの操作は元に戻せません。よろしいですか？`)) return;
  store.set(state => ({ ...state, saved: [] }));
});

// ── 全画面フレットボード ──────────────────────────────────────────────
const fbFullscreen       = document.getElementById('fbFullscreen');
const fbFullscreenSvg    = document.getElementById('fbFullscreenSvg');
const fbFullscreenTitle  = document.getElementById('fbFullscreenTitle');
const fbFullscreenLegend = document.getElementById('fbFullscreenLegend');
const fbFullscreenClose  = document.getElementById('fbFullscreenClose');
let fsPrevState = null;

drawFretboardBase(fbFullscreenSvg);

export function openFbFullscreen(state, displayTitle) {
  fbFullscreenTitle.textContent = displayTitle || buildTitle(state);
  applyFretboardDiff(fbFullscreenSvg, state, fsPrevState);
  fsPrevState = state;
  renderLegend(fbFullscreenLegend, state);
  const vb = maskViewBox(state.mask);
  fbFullscreenSvg.setAttribute('viewBox', vb || `0 0 ${SVG.W} ${SVG.H}`);
  fbFullscreen.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFbFullscreen() {
  fbFullscreen.classList.add('hidden');
  fbFullscreenSvg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  fsPrevState = null;
  document.body.style.overflow = '';
}

fbFullscreen.addEventListener('click', closeFbFullscreen);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !fbFullscreen.classList.contains('hidden')) closeFbFullscreen();
});

// 編集指板クリックで全画面
document.getElementById('editFbWrap').addEventListener('click', () => {
  openFbFullscreen(store.get().edit, titleInputEl.value || buildTitle(store.get().edit));
});

// 編集状態変化時に全画面も更新
store.subscribe((s, p) => {
  if (!fbFullscreen.classList.contains('hidden') && p && s.edit !== p.edit) {
    applyFretboardDiff(fbFullscreenSvg, s.edit, p?.edit);
    renderLegend(fbFullscreenLegend, s.edit);
  }
});

// ── 印刷ボタン: ダイアログを出す ──────────────────────────────────────
const printModal = document.getElementById('printModal');
printModal.querySelector('[data-act="cancel"]').addEventListener('click', () => printModal.classList.remove('show'));
printModal.querySelector('[data-act="print"]').addEventListener('click',  () => {
  printModal.classList.remove('show');
  setTimeout(() => window.print(), 80);
});
printModal.addEventListener('click', e => { if (e.target === printModal) printModal.classList.remove('show'); });

document.getElementById('printBtn').addEventListener('click', () => {
  syncPrintDialog();
  printModal.classList.add('show');
});

function syncPrintDialog() {
  const { orientation } = store.get().layout;
  printModal.querySelectorAll('.print-orient-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orient === orientation);
    btn.onclick = () => {
      store.set(s => ({ ...s, layout: { ...s.layout, orientation: btn.dataset.orient } }));
      syncPrintDialog();
    };
  });
}

// ── 印刷前後処理 ──────────────────────────────────────────────────────
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

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('保存済みデータをすべて消去してリセットしますか？\nこの操作は元に戻せません。')) {
    localStorage.clear();
    location.reload();
  }
});
