import './styles/main.css';

import { DEFAULT_COLORS, SVG, FRET_START, FRET_END } from './domain/constants.js';
import { MOBILE_EDITOR_FRETBOARD_WIDTH, MOBILE_ZOOM_BREAKPOINT } from './config.js';
import { buildTitle } from './domain/title.js';
import { localizeTitle } from './domain/i18n.js';
import { createStore } from './state/store.js';
import { attachPersist, restoreFromStorage } from './state/persist.js';
import { cloneColors } from './state/snapshot.js';

import { initKeyPicker }        from './ui/keyPicker.js';
import { initScalePicker }      from './ui/scalePicker.js';
import { initDegreePicker }     from './ui/degreePicker.js';
import { initMaskControl }      from './ui/maskControl.js';
import { initRegisterBtn }      from './ui/registerBtn.js';
import { initSavedTab }         from './ui/savedTab.js';
import { initColorModal }       from './ui/colorModal.js';
import { initLayoutPicker }     from './ui/layoutPicker.js';
import { initHeaderMenu }       from './ui/headerMenu.js';
import { initPrintCss }                    from './print/printCss.js';
import { wrapIntoPageGroups, unwrapPageGroups } from './print/pageGroup.js';
import { initInstrumentPicker } from './ui/instrumentPicker.js';
import {
  drawFretboardBase,
  applyFretboardDiff,
  maskViewBox,
  setMaskOverlayVisible,
  bakePrintTitle,
  removePrintTitle,
} from './ui/fretboardSvg.js';
import { renderLegend } from './ui/legend.js';

/* global __COMMIT__, __VERSION__ */
const appVerEl = document.getElementById('appVer');
if (appVerEl) {
  appVerEl.textContent = typeof __VERSION__ !== 'undefined' ? `v${__VERSION__}` : '';
}
const commitText = typeof __COMMIT__ !== 'undefined' ? __COMMIT__ : '';
// ヘッダ (PC 表示) とフッタ (スマホ表示) の両方にコミットハッシュを反映する。
// 表示の出し分けは CSS (max-width:767px) で行う。
for (const id of ['buildVer', 'buildVerFooter']) {
  const el = document.getElementById(id);
  if (el) el.textContent = commitText;
}

// ── 初回起動時のベータ版告知 ─────────────────────────────────────────
// 「了解しました」で恒久的に非表示。localStorage で一度きりに抑制。
// バージョン番号を保存するので、ベータ→ベータなど大きく区切るときに
// ルートを上げれば再告知できる。
const ALPHA_NOTICE_KEY = 'sg.alphaNoticeDismissed.v1';
const alphaNoticeEl = document.getElementById('alphaNotice');
if (alphaNoticeEl) {
  const alreadyDismissed = (() => {
    try { return localStorage.getItem(ALPHA_NOTICE_KEY) === '1'; }
    catch { return false; }
  })();
  if (!alreadyDismissed) {
    alphaNoticeEl.classList.remove('hidden');
  }
  document.getElementById('alphaNoticeClose')?.addEventListener('click', () => {
    alphaNoticeEl.classList.add('hidden');
    try { localStorage.setItem(ALPHA_NOTICE_KEY, '1'); } catch { /* noop */ }
  });
}

// ── ダブルタップ拡大は無効化 (ピンチイン/アウトは許可) ─────────────────
// 双タップズーム抑止は CSS の `touch-action: manipulation` (全要素適用済) に任せる。
// ピンチを残すため viewport meta から maximum-scale / user-scalable=no を撤去し、
// gesturestart の preventDefault も外している。PCのダブルクリック (テキスト選択化
// などの副作用) だけはここで防ぐ。
// PC のテキスト入力ではダブルクリックで単語選択を使えるよう対象を絞る
document.addEventListener('dblclick', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
});

// ── Service Worker 登録 (PWA / オフライン対応) ─────────────────────────
// base path は環境変数で切替わるため import.meta.env.BASE_URL を前置する
// (Cloudflare = '/', GitHub Pages = '/scale_generator/')。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(err => console.warn('SW registration failed:', err));
  });
}

function defaultState() {
  return {
    edit: {
      rootIndex: 0,          // C
      activeDegrees: new Set(),
      presetName: null,
      mode: 'scale',
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      degreeColors: cloneColors(DEFAULT_COLORS),
      instrument: null,      // null = 未選択, 'guitar' | 'bass'
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
const fretboardEl   = document.getElementById('fretboard');
const editFbWrapEl  = document.getElementById('editFbWrap');
const instrHintEl   = document.getElementById('instrHint');
const LAST_INSTR_KEY = 'sg.lastInstrument';
let lastFbInstrument = null; // セッション内で描画済み楽器を追跡

function syncEditorFretboard(s, p) {
  const instrument = s.edit.instrument;

  // 楽器未選択: 指板を隠してヒント表示
  const noInstr = !instrument;
  editFbWrapEl.style.display = noInstr ? 'none' : '';
  if (instrHintEl) instrHintEl.classList.toggle('hidden', !noInstr);
  if (noInstr) return;

  if (instrument !== lastFbInstrument) {
    // 楽器変更 → base を再描画してドットをすべて追加
    drawFretboardBase(fretboardEl, instrument);
    applyFretboardDiff(fretboardEl, s.edit, null);

    // 前回保存した楽器と異なる場合だけ glow burst (F5後の同楽器は除く)
    // iOS Safari Private mode は localStorage アクセスで例外を投げる場合があるので try で保護
    let prevSaved = null;
    try { prevSaved = localStorage.getItem(LAST_INSTR_KEY); } catch { /* iOS private: skip glow */ }
    if (prevSaved !== null && prevSaved !== instrument) {
      editFbWrapEl.classList.remove('fb-instrument-pop');
      void editFbWrapEl.offsetWidth;
      editFbWrapEl.classList.add('fb-instrument-pop');
      editFbWrapEl.addEventListener('animationend', () => editFbWrapEl.classList.remove('fb-instrument-pop'), { once: true });
    }
    lastFbInstrument = instrument;
    try { localStorage.setItem(LAST_INSTR_KEY, instrument); } catch { /* iOS private: skip */ }
    return;
  }
  if (p && s.edit === p.edit) return;
  applyFretboardDiff(fretboardEl, s.edit, p?.edit);
}

// スクロールインジケーター・ズームボタン要素
const fbScrollLeft  = document.getElementById('fbScrollLeft');
const fbScrollRight = document.getElementById('fbScrollRight');
const fbZoomBtn     = document.getElementById('fbZoomBtn');

// true = 拡大表示 (横スクロール可), false = 全体表示 (画面幅にフィット)
// 初期値 true: 起動時は拡大モード。ボタン "全体" で全体表示に切替。
let mobileZoomed = true;

// 拡大モードの指板高さ (px) — 全体/拡大どちらのモードでも高さはここに固定する。
// 幅を変えると高さもアスペクト比で変わってしまうため、拡大時の高さを計算して常に使う。
const MOBILE_FB_HEIGHT = Math.round(MOBILE_EDITOR_FRETBOARD_WIDTH / SVG.W * SVG.H);

function hideMobileScrollIndicators() {
  fbScrollLeft?.classList.remove('visible');
  fbScrollRight?.classList.remove('visible');
}

/**
 * スクロール位置とマスク範囲を照合してインジケーターを更新する。
 * マスク範囲内のポジションがすべてビューポートに収まっていればエフェクトなし。
 * 片方だけはみ出ていれば、はみ出ている側だけエフェクトを表示する。
 */
function updateScrollIndicators() {
  if (!mobileZoomed || window.innerWidth > MOBILE_ZOOM_BREAKPOINT) {
    hideMobileScrollIndicators();
    return;
  }
  const { scrollLeft, clientWidth } = editFbWrapEl;
  const scale = MOBILE_EDITOR_FRETBOARD_WIDTH / SVG.W;
  const { mask, activeDegrees } = store.get().edit;

  if (activeDegrees.size === 0) {
    hideMobileScrollIndicators();
    return;
  }

  let leftX, rightX;
  if (mask.enabled) {
    // マスク範囲の左端・右端 (CSS px)
    leftX  = (SVG.ML + mask.min * SVG.FW) * scale;
    rightX = (SVG.ML + (mask.max + 1) * SVG.FW) * scale;
  } else {
    // 全フレット範囲
    leftX  = SVG.ML * scale;
    rightX = (SVG.ML + SVG.FBW) * scale;
  }

  fbScrollLeft?.classList.toggle('visible',  leftX  < scrollLeft);
  fbScrollRight?.classList.toggle('visible', rightX > scrollLeft + clientWidth);
}

/** マスク範囲の中央へ自動スクロールする。マスク変化時のみ呼ぶ。 */
function scrollToMaskCenter(edit) {
  const scale = MOBILE_EDITOR_FRETBOARD_WIDTH / SVG.W;
  const midFret = (edit.mask.min + edit.mask.max) / 2;
  const midX_css = (SVG.ML + midFret * SVG.FW + SVG.FW / 2) * scale;
  editFbWrapEl.scrollLeft = Math.max(0, midX_css - editFbWrapEl.clientWidth / 2);
}

/**
 * 拡大 ↔ 全体 の 2 段階表示を切替える。
 * 拡大率は src/config.js → MOBILE_EDITOR_FRETBOARD_WIDTH で調整。
 */
function toggleMobileZoom() {
  mobileZoomed = !mobileZoomed;
  if (fbZoomBtn) fbZoomBtn.textContent = mobileZoomed ? '全体' : '拡大';
  // 高さはどちらのモードでも拡大時の基準値で固定する
  fretboardEl.style.height = `${MOBILE_FB_HEIGHT}px`;
  const edit = store.get().edit;
  if (mobileZoomed) {
    fretboardEl.style.width = `${MOBILE_EDITOR_FRETBOARD_WIDTH}px`;
    if (edit.mask.enabled) requestAnimationFrame(() => scrollToMaskCenter(edit));
    requestAnimationFrame(updateScrollIndicators);
  } else {
    fretboardEl.style.width = '';
    editFbWrapEl.scrollLeft = 0;
    hideMobileScrollIndicators();
  }
}

if (fbZoomBtn) fbZoomBtn.addEventListener('click', toggleMobileZoom);

/**
 * store/resize 変化時の指板幅同期。マスク変化時のみ自動スクロール。
 * 幅の数値は src/config.js → MOBILE_EDITOR_FRETBOARD_WIDTH で調整。
 */
function syncEditorFretboardZoom(edit, prevEdit) {
  const isMobile = window.innerWidth <= MOBILE_ZOOM_BREAKPOINT;
  if (!isMobile) {
    fretboardEl.style.width  = '';
    fretboardEl.style.height = '';
    hideMobileScrollIndicators();
    return;
  }
  // 高さはモードによらず拡大時基準値で固定 (src/config.js → MOBILE_EDITOR_FRETBOARD_WIDTH)
  fretboardEl.style.height = `${MOBILE_FB_HEIGHT}px`;

  if (!mobileZoomed) {
    fretboardEl.style.width = '';
    requestAnimationFrame(updateScrollIndicators);
    return;
  }
  fretboardEl.style.width = `${MOBILE_EDITOR_FRETBOARD_WIDTH}px`;

  const maskChanged = !prevEdit
    || prevEdit.mask.enabled !== edit.mask.enabled
    || prevEdit.mask.min !== edit.mask.min
    || prevEdit.mask.max !== edit.mask.max;
  if (maskChanged && edit.mask.enabled) {
    requestAnimationFrame(() => scrollToMaskCenter(edit));
  }

  requestAnimationFrame(updateScrollIndicators);
}

syncEditorFretboard({ edit: store.get().edit }, null);
if (lastFbInstrument) syncEditorFretboardZoom(store.get().edit, null);

store.subscribe((s, p) => {
  syncEditorFretboard(s, p);
  if (lastFbInstrument) syncEditorFretboardZoom(s.edit, p?.edit);
});
// リサイズ・回転時: 幅を再適用するが自動スクロールはしない (同一 edit を prev に渡す)
window.addEventListener('resize', () => {
  if (!lastFbInstrument) return;
  const edit = store.get().edit;
  syncEditorFretboardZoom(edit, edit);
});
// スクロール時にインジケーター更新
editFbWrapEl.addEventListener('scroll', updateScrollIndicators, { passive: true });

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
  // エディターを空状態に初期化
  store.updateEdit({ activeDegrees: new Set(), presetName: null });
  userEditedTitle = false;
  titleInputEl.value = '';
}

function loadSnapToEditor(snap) {
  // degreeColors は読み込まない: 度数カラーはアプリ全体共通の設定で、
  // スケールごとには持たない（現在のグローバル色を維持）。
  store.updateEdit({
    rootIndex: snap.rootIndex,
    activeDegrees: new Set(snap.activeDegrees),
    presetName: snap.presetName,
    mode: snap.mode,
    mask: { ...snap.mask },
    instrument: snap.instrument || 'guitar',
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
    // 登録スケールタブへスライド移動
    const savedBtn = tabNav.querySelector('[data-tab="saved"]');
    savedBtn?.click();
    // カードが描画されてからハイライト + スクロール（モバイル対応）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      savedTab.highlightNewCard(id, isUpdate);
      savedTab.scrollToCard(id);
    }));
  },
});
initColorModal(store, document.getElementById('colorBtn'));
initLayoutPicker(store);
initHeaderMenu(store);
initPrintCss(store);
initInstrumentPicker(
  document.getElementById('instrumentBtn'),
  document.getElementById('instrumentModal'),
  store,
);

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
  if (editingId != null) {
    alert('編集中は全削除できません。\n編集を終了してから実行してください。');
    return;
  }
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
fbFullscreenClose.addEventListener('click', e => { e.stopPropagation(); closeFbFullscreen(); });
let fsPrevState      = null;
let fsPrevInstrument = null;

export function openFbFullscreen(state, displayTitle) {
  const instrument = state.instrument || 'guitar';
  if (instrument !== fsPrevInstrument) {
    drawFretboardBase(fbFullscreenSvg, instrument);
    fsPrevInstrument = instrument;
    fsPrevState = null; // full redraw
  }
  fbFullscreenTitle.textContent = displayTitle || buildTitle(state);
  applyFretboardDiff(fbFullscreenSvg, state, fsPrevState);
  fsPrevState = state;
  renderLegend(fbFullscreenLegend, state);
  const vb = maskViewBox(state.mask);
  fbFullscreenSvg.setAttribute('viewBox', vb || `0 0 ${SVG.W} ${SVG.H}`);
  setMaskOverlayVisible(fbFullscreenSvg, false);
  fbFullscreen.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFbFullscreen() {
  fbFullscreen.classList.add('hidden');
  fbFullscreenSvg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  fsPrevState = null;
  fsPrevInstrument = null;
  const fsDotLayer = fbFullscreenSvg.querySelector('.dot-layer');
  if (fsDotLayer) fsDotLayer.innerHTML = '';
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
  if (fbFullscreen.classList.contains('hidden')) return;
  if (!p || s.edit === p.edit) return;
  const instrument = s.edit.instrument || 'guitar';
  if (instrument !== fsPrevInstrument) {
    drawFretboardBase(fbFullscreenSvg, instrument);
    fsPrevInstrument = instrument;
    applyFretboardDiff(fbFullscreenSvg, s.edit, null);
  } else {
    applyFretboardDiff(fbFullscreenSvg, s.edit, p.edit);
  }
  renderLegend(fbFullscreenLegend, s.edit);
});

// ── 印刷ボタン: ダイアログを出す ──────────────────────────────────────
const printModal = document.getElementById('printModal');
printModal.querySelector('[data-act="cancel"]').addEventListener('click', () => printModal.classList.remove('show'));
printModal.querySelector('[data-act="print"]').addEventListener('click', () => {
  // ▼ 順序が重要 — print() を最初に呼ぶ。
  // (1) iOS WebKit / Chrome の "transient user activation" は window.print() を
  //     呼んだ瞬間に消費される。print() の前に classList.remove や setTimeout を
  //     挟むと activation を先に奪われ、印刷が「自動印刷」と判定されてブロック
  //     される (「このWebサイトから自動的に印刷することは禁止されています」)。
  // (2) print() の後ろなら DOM 操作は自由。activation はすでに消費済みなので
  //     影響しない。
  // (3) iOS では afterprint が発火しないことがあるので、ここで閉じておかないと
  //     モーダルが開きっぱなしになり、2回目の「印刷」タップで挙動が崩れる
  //     (=今回のバグ)。afterprint も保険として残してある。
  window.print();
  printModal.classList.remove('show');
});
printModal.addEventListener('click', e => { if (e.target === printModal) printModal.classList.remove('show'); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && printModal.classList.contains('show')) printModal.classList.remove('show');
});

document.getElementById('printBtn').addEventListener('click', () => {
  // スマホは「向き」UI を隠して常に縦印刷とする。
  // (横向き印刷は OS の印刷シートで切り替える運用)
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  if (isMobile && store.get().layout.orientation !== 'portrait') {
    store.set(s => ({ ...s, layout: { ...s.layout, orientation: 'portrait' } }));
  }
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
let printTabWasHidden = false; // beforeprint でパネルを切り替えたか記憶
function restorePrintState() {
  if (printTabWasHidden) {
    panelSaved.classList.add('hidden');
    panelEditor.classList.remove('hidden');
    printTabWasHidden = false;
  }
  const grid = document.getElementById('savedGrid');
  if (grid) unwrapPageGroups(grid);
  store.get().saved.forEach(snap => {
    const svg = document.getElementById('sv' + snap.id);
    if (!svg) return;
    removePrintTitle(svg);
    const original = printOriginalViewBox.get(svg);
    if (original) {
      svg.setAttribute('viewBox', original);
      printOriginalViewBox.delete(svg);
    }
    setMaskOverlayVisible(svg, true);
  });
}

window.addEventListener('beforeprint', () => {
  try {
    // エディタータブ表示中でも登録スケールを印刷できるよう一時的にパネルを切り替える
    if (panelSaved.classList.contains('hidden')) {
      panelSaved.classList.remove('hidden');
      panelEditor.classList.add('hidden');
      printTabWasHidden = true;
    }
    const grid = document.getElementById('savedGrid');
    if (grid) {
      const { cols, rows } = store.get().layout;
      wrapIntoPageGroups(grid, cols, rows);
    }
    store.get().saved.forEach(snap => {
      const svg = document.getElementById('sv' + snap.id);
      if (!svg) return;
      // 既に元の値を保存済み (afterprint 未発火で再度 beforeprint が来た場合) は
      // 上書きしない。上書きするとマスク/タイトル済み viewBox を「元の値」として
      // 保存してしまう。
      if (!printOriginalViewBox.has(svg)) {
        printOriginalViewBox.set(svg, svg.getAttribute('viewBox'));
      }
      // マスク有効ならクロップ viewBox、無ければ全体。そこへタイトル帯を上に足す。
      const base = maskViewBox(snap.mask) || `0 0 ${SVG.W} ${SVG.H}`;
      setMaskOverlayVisible(svg, false);
      // スケール名を SVG 内上部へ焼き込み、1枚の画像にする (印刷分割の根治)。
      const printVb = bakePrintTitle(svg, localizeTitle(snap.title), base);
      svg.setAttribute('viewBox', printVb);
    });
  } catch (err) {
    restorePrintState();
    throw err;
  }
});
window.addEventListener('afterprint', () => {
  // 印刷ダイアログが閉じたタイミングで印刷モーダルも閉じる。
  // click ハンドラ内で閉じると iOS で user-activation を消費して
  // window.print() が "自動印刷" 扱いになるため、ここに移動している。
  printModal.classList.remove('show');
  restorePrintState();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('保存済みデータをすべて消去してリセットしますか？\nこの操作は元に戻せません。')) return;
  // ベータ版告知の "了解しました" フラグはリセットで消さない
  // (ユーザーが何度も告知を見させられないようにするため)。
  // 他のルートは将来増える可能性があるので、保持したいものを退避して
  // clear → 復元、という方式にしておく。
  const KEEP_KEYS = [ALPHA_NOTICE_KEY];
  const backup = {};
  for (const k of KEEP_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) backup[k] = v;
  }
  localStorage.clear();
  for (const [k, v] of Object.entries(backup)) localStorage.setItem(k, v);
  location.reload();
});
