import './styles/main.css';

import { DEFAULT_COLORS, SVG, FRET_START, FRET_END } from './domain/constants.js';
import { MOBILE_EDITOR_FRETBOARD_WIDTH, MOBILE_ZOOM_BREAKPOINT } from './config.js';
import { buildTitle } from './domain/title.js';
import { localizeTitle } from './domain/i18n.js';
import { createStore } from './state/store.js';
import { attachPersist, restoreFromStorage } from './state/persist.js';
import { cloneColors } from './state/snapshot.js';
import {
  allActivePositionKeys, toggleVisible, reconcileVisible,
} from './domain/positionVisibility.js';

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
import { initInstallPrompt }    from './ui/installPrompt.js';
import { initReleaseNotes }      from './ui/releaseNotesModal.js';
import { exportAllScalesPng }    from './ui/imageExport.js';
import { showToast }             from './ui/toast.js';
import { initAuthButton }        from './ui/authButton.js';
import { initProfileUi }         from './ui/profileModal.js';
import { initCloud }             from './state/cloudSync.js';
import { initSongbookTab }       from './ui/songbookTab.js';
import { initShareUi }           from './ui/shareModal.js';
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
      visiblePositions: null, // null = 全表示（未カスタマイズ）
    },
    saved: [],
    layout: { orientation: 'landscape', cols: 2, rows: 3 },
    activeTab: 'edit',
    nextId: 1,
    songfileTitle: '',   // ソングファイル全体の名前（任意・いつでも編集可）
  };
}

const store = createStore(restoreFromStorage() || defaultState());
attachPersist(store);

// ── 表示ポジションの集中リコンサイル ───────────────────────────────────
// プリセット選択/ルート・楽器変更で表示集合を全アクティブ位置に再構築し、
// カスタム度数トグルで増減させる（docs/features/POSITION_VISIBILITY.md）。
// 個別タップ（visiblePositions のみ変化）では再構築しない。各ピッカーを
// 触らず store 購読1か所で吸収する。
const setsEqual = (a, b) => {
  if (a === b) return true;
  if (!(a instanceof Set) || !(b instanceof Set)) return false;
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
};
let prevEditForReconcile = store.get().edit;
// スナップショット読込時はその visiblePositions を尊重し、1サイクルだけ再構築を抑止する。
let suppressReconcileOnce = false;
// 自身の書き戻し（updateEdit）による再入で他購読者を二度発火させないためのガード。
let reconcilingNow = false;
store.subscribe(s => {
  if (reconcilingNow) return;
  const prev = prevEditForReconcile;
  const next = s.edit;
  if (prev === next) return;
  prevEditForReconcile = next;
  if (suppressReconcileOnce) { suppressReconcileOnce = false; return; }
  const desired = reconcileVisible(prev, next);
  if (!setsEqual(desired, next.visiblePositions)) {
    reconcilingNow = true;
    store.updateEdit({ visiblePositions: desired });
    reconcilingNow = false;
  }
});

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

// ── 表示ポジション編集モード ──────────────────────────────────────────
// ON 時: 指板のドットをタップで表示/非表示トグル。OFF 時: 通常操作（タップで全画面）。
let posEditMode = false;
const posModeBtn  = document.getElementById('posModeBtn');
const posResetBtn = document.getElementById('posResetBtn');
const posModeHint = document.getElementById('posModeHint');

let zoomBeforePosEdit = null;
function setPosEditMode(on) {
  posEditMode = on;
  posModeBtn?.classList.toggle('active', on);
  posModeBtn?.setAttribute('aria-pressed', String(on));
  posResetBtn?.classList.toggle('hidden', !on);
  posModeHint?.classList.toggle('hidden', !on);
  editFbWrapEl.classList.toggle('posmode', on);
  // posmode 中はモバイルでも必ず「拡大」表示に強制する。
  // 理由: 全体表示だとドットが小さすぎてタップが当てづらく操作にならない
  // (PC は元々十分大きいので何もしない)。横スクロール状態でもタップは
  // click として届く (touch-action: manipulation でタップ遅延も無し)。
  const isMobile = window.innerWidth <= MOBILE_ZOOM_BREAKPOINT;
  // posmode 中はスケール設定/全体/マスク など編集を変えるボタンを無効化
  // (誤操作で visiblePositions が再構築されてしまう/混乱するのを防ぐ)。
  const degPickerBtn = document.getElementById('degPickerBtn');
  const maskControl  = document.getElementById('maskControl');
  if (degPickerBtn) degPickerBtn.disabled = on;
  if (maskControl) {
    maskControl.classList.toggle('disabled-during-posmode', on);
    maskControl.querySelectorAll('button, input').forEach(el => { el.disabled = on; });
  }
  if (on) {
    zoomBeforePosEdit = mobileZoomed;
    if (isMobile && !mobileZoomed) toggleMobileZoom();   // → 拡大表示
    if (fbZoomBtn) fbZoomBtn.disabled = true;
  } else {
    if (fbZoomBtn) fbZoomBtn.disabled = false;
    // 入った時の状態に戻す (元が全体ならまた全体へ、元が拡大なら拡大のまま)
    if (isMobile && zoomBeforePosEdit === false && mobileZoomed) toggleMobileZoom();
    zoomBeforePosEdit = null;
  }
}
posModeBtn?.addEventListener('click', () => setPosEditMode(!posEditMode));
posResetBtn?.addEventListener('click', () => {
  // 現在アクティブな全ポジションで再構築（全表示に戻す）
  store.updateEdit({ visiblePositions: allActivePositionKeys(store.get().edit) });
});

/** クリック座標に最も近いドットのキーを返す（ドット間に落ちても拾えるよう近傍許容）。 */
function nearestDotKey(clientX, clientY) {
  let bestKey = null;
  let bestDist = Infinity;
  fretboardEl.querySelectorAll('circle[data-pos-key]').forEach(c => {
    const r = c.getBoundingClientRect();
    if (r.width === 0) return;
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d < bestDist) { bestDist = d; bestKey = c.getAttribute('data-pos-key'); }
  });
  // しきい値: ドット直径ぶん程度まで許容（指/マウスのズレを吸収）
  return bestDist <= 44 ? bestKey : null;
}

// capture フェーズで拾い、posmode 中は wrap の click→全画面を必ず抑止する
fretboardEl.addEventListener('click', e => {
  if (!posEditMode) return;
  e.stopPropagation();
  // 直接ヒット → そのドット。外していても近傍のドットを拾う。
  const direct = e.target.closest?.('[data-pos-key]');
  const key = direct ? direct.getAttribute('data-pos-key') : nearestDotKey(e.clientX, e.clientY);
  if (!key) return;
  const edit = store.get().edit;
  // 未設定(null)なら全アクティブで材化してからトグル
  const base = edit.visiblePositions instanceof Set
    ? edit.visiblePositions
    : allActivePositionKeys(edit);
  store.updateEdit({ visiblePositions: toggleVisible(base, key) });
}, true);

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
  // degreeColors はスケールごとの個別設定 (docs/features/DEGREE_COLORS.md)。
  // 読み込み時はそのスケールの色をエディターへ引き継ぐ。
  // 表示ポジションも読み込んだ値を尊重する（再構築で消さない）。
  suppressReconcileOnce = true;
  store.updateEdit({
    rootIndex: snap.rootIndex,
    activeDegrees: new Set(snap.activeDegrees),
    presetName: snap.presetName,
    mode: snap.mode,
    mask: { ...snap.mask },
    degreeColors: cloneColors(snap.degreeColors || DEFAULT_COLORS),
    instrument: snap.instrument || 'guitar',
    visiblePositions: snap.visiblePositions ? new Set(snap.visiblePositions) : null,
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

const colorModal = initColorModal(store);
const savedTab = initSavedTab(
  document.getElementById('savedGrid'),
  store,
  (state, title) => openFbFullscreen(state, title),
  loadSnapToEditor,
  (id) => colorModal.openForSaved(id),
);

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
document.getElementById('editorColorBtn')?.addEventListener('click', () => colorModal.openForEdit());
initLayoutPicker(store);
initHeaderMenu(store);
initPrintCss(store);
initInstrumentPicker(
  document.getElementById('instrumentBtn'),
  document.getElementById('instrumentModal'),
  store,
);
initInstallPrompt();
initReleaseNotes(typeof __VERSION__ !== 'undefined' ? __VERSION__ : '');

// ── クラウド認証（Clerk）: 非同期初期化。失敗してもローカル機能は継続。 ──
// 表示名（オンボーディング/編集）を先に用意し、UserButton メニューへ連携する。
// onAuthChange の購読は initCloud 前に済ませておく。
const profileUi = initProfileUi();
initAuthButton(document.getElementById('authSlot'), {
  onEditProfile: profileUi.openEdit,
  getDisplayName: profileUi.getDisplayName,
  onProfileChange: profileUi.onProfileChange,
});
initCloud();

// ── タブナビゲーション ─────────────────────────────────────────────────
const tabNav      = document.getElementById('tabNav');
const panelEditor = document.getElementById('panelEditor');
const panelSaved  = document.getElementById('panelSaved');
const panelSongbook = document.getElementById('panelSongbook');
const panelsByTab = { editor: panelEditor, saved: panelSaved, songbook: panelSongbook };
tabNav.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabNav.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    Object.entries(panelsByTab).forEach(([t, p]) => p?.classList.toggle('hidden', t !== tab));
    if (tab !== 'saved') savedTab.clearNewlyAdded();
    // スライドアニメーション（エディターは左から、それ以外は右から）
    const panel = panelsByTab[tab];
    if (panel) {
      panel.classList.remove('slide-in-left', 'slide-in-right');
      requestAnimationFrame(() => panel.classList.add(tab === 'editor' ? 'slide-in-left' : 'slide-in-right'));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});

// ── ソングブック（クラウド保存）/ 共有 ────────────────────────────────
// 読込確定の共通処理: store.saved を置換 → ソングファイルタブへ。
const applyCloudSongfile = (savedArray, title) => {
  store.set(s => ({
    ...s,
    saved: savedArray,
    songfileTitle: typeof title === 'string' ? title : s.songfileTitle,
  }));
  tabNav.querySelector('[data-tab="saved"]')?.click();
};
const shareUi = initShareUi(store, applyCloudSongfile);
initSongbookTab(store, applyCloudSongfile, (book) => shareUi.shareSongbook(book));
// 起動時の共有URL（?share=<id>）受け取り
shareUi.checkUrlParam();

// ── ソングファイル名（任意・いつでも編集可・localStorage 永続） ──────────
const songfileTitleEl = document.getElementById('songfileTitleInput');
if (songfileTitleEl) {
  songfileTitleEl.value = store.get().songfileTitle || '';
  songfileTitleEl.addEventListener('input', () => {
    store.set(s => ({ ...s, songfileTitle: songfileTitleEl.value }));
  });
  store.subscribe((s, p) => {
    if (p && s.songfileTitle === p.songfileTitle) return;
    if (document.activeElement !== songfileTitleEl) songfileTitleEl.value = s.songfileTitle || '';
  });
}


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
const exportAllBtn = document.getElementById('exportAllImagesBtn');
function updateExportAllBtn(n) {
  if (exportAllBtn) exportAllBtn.disabled = n === 0;
}
updateSavedCount(store.get().saved.length);
updateExportAllBtn(store.get().saved.length);
store.subscribe((s, p) => {
  if (p && s.saved.length === p.saved.length) return;
  updateSavedCount(s.saved.length);
  updateExportAllBtn(s.saved.length);
});

// ── 画像 一括出力 ──────────────────────────────────────────────────────
let exportingAll = false;
exportAllBtn?.addEventListener('click', async () => {
  if (exportingAll) return;
  const saved = store.get().saved;
  if (saved.length === 0) return;
  exportingAll = true;
  exportAllBtn.disabled = true;
  showToast(`画像を出力中… (0/${saved.length})`);
  try {
    const { ok, fail } = await exportAllScalesPng(
      saved,
      (done, total) => showToast(`画像を出力中… (${done}/${total})`),
    );
    showToast(fail > 0 ? `${ok}件出力（${fail}件失敗）` : `${ok}件の画像を出力しました`);
  } catch (e) {
    console.error('画像一括出力でエラー:', e);
    showToast('画像の出力に失敗しました');
  } finally {
    exportingAll = false;
    exportAllBtn.disabled = store.get().saved.length === 0;
  }
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

function openFbFullscreen(state, displayTitle) {
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

// 編集指板クリックで全画面（ポジション編集モード中は無効＝誤爆で全画面が開かない）
document.getElementById('editFbWrap').addEventListener('click', () => {
  if (posEditMode) return;
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
let printOriginalDocTitle = null; // 印刷中だけ document.title を退避 (印刷ヘッダーに出る <title> を消す)
function restorePrintState() {
  // 退避した document.title を戻す (印刷後)
  if (printOriginalDocTitle !== null) {
    document.title = printOriginalDocTitle;
    printOriginalDocTitle = null;
  }
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
    // 印刷ヘッダー(ブラウザの「ヘッダーとフッター」)に出る <title> を一時的に消す。
    // 空文字 '' は一部ブラウザで URL にフォールバックするのでスペースにする。
    printOriginalDocTitle = document.title;
    document.title = ' ';
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

/** 保存データを全消去してリロード。… メニューから呼ぶ (ヘッダのリセットボタンは廃止)。 */
function performHardReset() {
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
}
// … メニューの「保存データをリセット」項目から直接呼ぶ。
document.querySelectorAll('[data-act="reset"]').forEach(el => {
  el.addEventListener('click', performHardReset);
});
