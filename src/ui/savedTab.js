import { SVG } from '../domain/constants.js';
import { localizeTitle } from '../domain/i18n.js';
import {
  CARD_TITLE_SVG_FONT_SIZE_PC,
  CARD_TITLE_SVG_FONT_SIZE_MOBILE,
  CARD_TITLE_SVG_LETTER_SPACING,
  CARD_TITLE_BG_HEIGHT,
  MOBILE_ZOOM_BREAKPOINT,
} from '../config.js';
import { savedListChanged, colorOnlyUpdate } from '../state/savedList.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';
import { exportSavedScalePng } from './imageExport.js';
import { showToast } from './toast.js';

const NS = 'http://www.w3.org/2000/svg';


const WARN_KEY = 'deleteWarnDisabled';

/** カスタム削除確認ダイアログ。resolve(true)=削除OK、resolve(false)=キャンセル */
function confirmDelete(message) {
  return new Promise(resolve => {
    const modal    = document.getElementById('deleteConfirmModal');
    const msgEl    = document.getElementById('deleteConfirmMsg');
    const checkbox = document.getElementById('deleteWarnDontShow');
    const okBtn    = document.getElementById('deleteConfirmOk');
    const cancelBtn = document.getElementById('deleteConfirmCancel');

    msgEl.textContent = message;
    checkbox.checked = false;
    modal.classList.add('show');

    function finish(result) {
      modal.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      if (result && checkbox.checked) {
        localStorage.setItem(WARN_KEY, '1');
        updateRestoreBtn();
      }
      resolve(result);
    }
    const onOk      = () => finish(true);
    const onCancel  = () => finish(false);
    const onOverlay = e => { if (e.target === modal) finish(false); };
    const onKey     = e => { if (e.key === 'Escape') finish(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

function updateRestoreBtn() {
  const restoreEl = document.getElementById('savedWarnRestore');
  if (restoreEl) restoreEl.classList.toggle('hidden', !localStorage.getItem(WARN_KEY));
}

// ── カード操作メニュー（「設定」ボタンから開くドロップダウン・共有1インスタンス） ──
let cardMenuEl = null;
function closeCardMenu() {
  if (!cardMenuEl) return;
  cardMenuEl.remove();
  cardMenuEl = null;
  document.removeEventListener('click', onCardMenuDocClick, true);
  document.removeEventListener('keydown', onCardMenuEsc);
  window.removeEventListener('scroll', closeCardMenu, true);
  window.removeEventListener('resize', closeCardMenu);
}
function onCardMenuDocClick(e) { if (cardMenuEl && !cardMenuEl.contains(e.target)) closeCardMenu(); }
function onCardMenuEsc(e) { if (e.key === 'Escape') closeCardMenu(); }

/**
 * カードの操作メニューを開く。
 * @param {HTMLElement} anchorEl 「設定」ボタン
 * @param {string} title スケール名
 * @param {{label:string, icon?:string, danger?:boolean, onClick:Function}[]} items
 */
function openCardMenu(anchorEl, title, items) {
  closeCardMenu();
  const menu = document.createElement('div');
  menu.className = 'card-menu';
  menu.setAttribute('role', 'menu');
  const head = document.createElement('div');
  head.className = 'card-menu-title';
  head.textContent = title || 'スケール';
  menu.appendChild(head);
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card-menu-item' + (it.danger ? ' danger' : '');
    b.innerHTML = `${it.icon || ''}<span>${it.label}</span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); closeCardMenu(); it.onClick(); });
    menu.appendChild(b);
  });
  document.body.appendChild(menu);

  // 位置: アンカーの下・画面内に収める（position:fixed）。
  const r = anchorEl.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  left = Math.max(8, left);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  cardMenuEl = menu;
  setTimeout(() => {
    document.addEventListener('click', onCardMenuDocClick, true);
    document.addEventListener('keydown', onCardMenuEsc);
    window.addEventListener('scroll', closeCardMenu, true);
    window.addEventListener('resize', closeCardMenu);
  }, 0);
}

// メニュー項目のアイコン（11px）。
const ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/></svg>';
const ICON_PRACTICE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 0-2 2v6a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2zM3.5 6.5A.5.5 0 0 1 4 7v2a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v2a5 5 0 0 1-4.5 4.975V15h2a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1h2v-1.025A5 5 0 0 1 3 9V7a.5.5 0 0 1 .5-.5z"/></svg>';
const ICON_COLOR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 0-5 .5.5 0 0 1 0-1h.01A9 9 0 0 0 12 3zM3 12a9 9 0 0 1 9-9 9 9 0 1 1-9 9zm5-1a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm4 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm3 3a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>';
const ICON_IMAGE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/><path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/></svg>';
const ICON_DELETE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/></svg>';

export function initSavedTab(container, store, openFullscreen, onEditMode = null, onColorEdit = null, onPractice = null) {
  const emptyEl = document.getElementById('savedEmpty');
  // 直前に描画した saved 配列（位置ごとの参照で再描画要否を判定）
  let lastRendered = [];

  // 再有効化ボタン
  updateRestoreBtn();
  const restoreBtn = document.getElementById('savedWarnRestoreBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      localStorage.removeItem(WARN_KEY);
      updateRestoreBtn();
    });
  }

  // 画面用のグリッド設定は CSS (`#savedGrid.screen-grid`) に集約。
  // インラインスタイルにすると印刷用 `@media print` の grid-template-columns が
  // 詳細度で常に負け、印刷時にレイアウトピッカーの選択が反映されないため。
  container.classList.add('screen-grid');

  // ── ドラッグ&ドロップ並べ替え ──────────────────────────────────────
  // タッチ: touchmove の preventDefault でスクロール停止(ポインターイベントより確実)。
  //   300ms 長押し確定 → 次の touchmove で drag 開始・スクロール停止。
  //   300ms 前に 10px 以上動いたらスクロール意図として取消。
  // マウス: pointermove 5px でドラッグ開始（従来通り）。
  let draggingId   = null;
  let dropTargetEl = null;
  let dragState    = null;
  // dragState: null | { card, startX, startY, pending:bool, timer,
  //                     touchId?:number, pointerId?:number }

  function clearDropTarget() {
    dropTargetEl?.classList.remove('drop-target');
    dropTargetEl = null;
  }

  /** ポインター位置に基づいてスワップ先カードを探す (dragging カード除外) */
  function findDropTarget(x, y) {
    const els = [...container.querySelectorAll('.saved-card:not(.dragging)')];
    let bestEl = null, bestDist = Infinity;
    for (const el of els) {
      const box = el.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      const dist = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (dist < bestDist) { bestDist = dist; bestEl = el; }
    }
    return bestEl;
  }

  /** DOM順を store に反映 */
  function commitOrder() {
    const orderedIds = [...container.querySelectorAll('.saved-card')]
      .map(c => Number(c.dataset.id));
    const cur = store.get().saved;
    if (orderedIds.join(',') === cur.map(s => s.id).join(',')) return;
    const byId = new Map(cur.map(s => [s.id, s]));
    const reordered = orderedIds.map(id => byId.get(id)).filter(Boolean);
    // DOM はすでに並べ替え済み → 再描画をスキップさせるため lastRendered を先に更新
    lastRendered = reordered;
    store.set(state => ({ ...state, saved: reordered }));
  }

  /** 2つのカードの位置を DOM でスワップ */
  function swapCards(a, b) {
    const marker = document.createComment('swap');
    a.parentNode.insertBefore(marker, a);
    b.parentNode.insertBefore(a, b.nextSibling);
    marker.parentNode.insertBefore(b, marker);
    marker.remove();
  }

  /** ドラッグ確定 (300ms 長押し後 or マウス5px移動後に呼ぶ) */
  function activateDrag() {
    if (!dragState || !dragState.pending) return;
    dragState.pending = false;
    draggingId = Number(dragState.card.dataset.id);
    dragState.card.classList.add('dragging');
    navigator.vibrate?.(40);
    // マウスのみ: pointermove ハンドラ内で呼ぶので setPointerCapture が有効
    if (dragState.pointerId !== undefined) {
      dragState.card.setPointerCapture(dragState.pointerId);
    }
  }

  function endDrag(cancelled = false) {
    if (!dragState) return;
    const { card, pending } = dragState;
    if (pending && dragState.timer) clearTimeout(dragState.timer);
    card.classList.remove('dragging');
    const wasActive = !pending;
    if (wasActive && !cancelled && dropTargetEl && dropTargetEl !== card) {
      swapCards(card, dropTargetEl);
    }
    clearDropTarget();
    const savedId = draggingId;
    dragState = null;
    draggingId = null;
    if (wasActive && savedId != null) commitOrder();
  }

  // ── タッチイベント (iOS/Android): touchmove+preventDefault でスクロール抑制 ──
  container.addEventListener('touchstart', e => {
    if (dragState) return;
    if (e.target.closest('.btn-settings-saved')) return;
    const card = e.target.closest('.saved-card');
    if (!card) return;
    const t = e.changedTouches[0];
    dragState = {
      card,
      touchId: t.identifier,
      startX: t.clientX,
      startY: t.clientY,
      pending: true,
      timer: setTimeout(activateDrag, 300),
    };
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!dragState || dragState.touchId === undefined) return;
    const touch = [...e.changedTouches].find(t => t.identifier === dragState.touchId);
    if (!touch) return;

    if (dragState.pending) {
      // 300ms 前に 10px 以上動いたらスクロール意図 → ドラッグ取消
      const dist = Math.hypot(touch.clientX - dragState.startX, touch.clientY - dragState.startY);
      if (dist > 10) {
        clearTimeout(dragState.timer);
        dragState = null;
      }
      return; // pending 中はスクロールを妨げない
    }

    // ドラッグ確定後: スクロール抑制 + ドロップターゲット更新
    e.preventDefault();
    const vy = touch.clientY, vh = window.innerHeight, edgeZone = 80;
    if (vy < edgeZone)           window.scrollBy({ top: -8, behavior: 'instant' });
    else if (vy > vh - edgeZone) window.scrollBy({ top:  8, behavior: 'instant' });

    const candidate = findDropTarget(touch.clientX, touch.clientY);
    if (candidate !== dropTargetEl) {
      clearDropTarget();
      dropTargetEl = candidate;
      dropTargetEl?.classList.add('drop-target');
    }
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (!dragState || dragState.touchId === undefined) return;
    const touch = [...e.changedTouches].find(t => t.identifier === dragState.touchId);
    if (!touch) return;
    endDrag();
  }, { passive: true });

  // 別の指の touchcancel でも、待機中の長押しタイマーが取り残されると
  // 既に指が離れたカードに対して activateDrag が走るリスクがあるため、
  // 識別子に関係なく pending タイマーは常にクリアする。
  container.addEventListener('touchcancel', () => {
    if (!dragState) return;
    if (dragState.pending && dragState.timer) {
      clearTimeout(dragState.timer);
      dragState = null;
      return;
    }
    if (dragState.touchId === undefined) return;
    endDrag(true);
  }, { passive: true });

  // ── マウスイベント: pointerType === 'mouse' のみ ──
  container.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    if (dragState) return;
    if (e.target.closest('.btn-settings-saved')) return;
    const card = e.target.closest('.saved-card');
    if (!card) return;
    dragState = {
      card,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pending: true,
      timer: null,
    };
  });

  container.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    if (!dragState || e.pointerId !== dragState.pointerId) return;

    if (dragState.pending) {
      const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
      if (dist > 5) activateDrag();
      return;
    }

    const edgeZone = 80, vy = e.clientY, vh = window.innerHeight;
    if (vy < edgeZone)           window.scrollBy({ top: -8, behavior: 'instant' });
    else if (vy > vh - edgeZone) window.scrollBy({ top:  8, behavior: 'instant' });

    const candidate = findDropTarget(e.clientX, e.clientY);
    if (candidate !== dropTargetEl) {
      clearDropTarget();
      dropTargetEl = candidate;
      dropTargetEl?.classList.add('drop-target');
    }
  }, { passive: false });

  container.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') return;
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    endDrag();
  });

  container.addEventListener('pointercancel', e => {
    if (e.pointerType !== 'mouse') return;
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    endDrag(true);
  });

  function render() {
    const { saved } = store.get();
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = saved.length === 0 ? '' : 'none';
    lastRendered = [...saved];
    saved.forEach(snap => {
      try {
        container.appendChild(renderCard(snap, store, openFullscreen, onEditMode, () => currentEditingId, onColorEdit, onPractice));
      } catch (e) {
        console.warn('savedTab: failed to render card', snap.id, e);
      }
    });
  }

  let currentEditingId = null;
  let currentNewId = null;

  function applyEditingHighlight(editingId) {
    currentEditingId = editingId;
    container.querySelectorAll('.saved-card').forEach(c => {
      const match = editingId != null && Number(c.dataset.id) === editingId;
      c.classList.toggle('editing-target', match);
      c.querySelector('.edit-badge')?.remove();
      if (match) {
        const badge = document.createElement('div');
        // screen-only: 印刷時に必ず非表示にするマーカー (CSS @media print)
        badge.className = 'edit-badge screen-only';
        badge.textContent = 'EDIT!';
        c.appendChild(badge);
      }
    });
  }

  function spawnParticles(card) {
    const rect = card.getBoundingClientRect();
    const colors = ['#22c55e','#86efac','#4ade80','#fbbf24','#34d399','#a3e635'];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'particle-burst';
      const angle = (i / 28) * 360;
      const dist  = 40 + Math.random() * 60;
      const size  = 4 + Math.random() * 6;
      const color = colors[i % colors.length];
      const delay = Math.random() * 0.15;
      p.style.cssText = [
        `left:${rect.left + rect.width/2}px`,
        `top:${rect.top + rect.height/2}px`,
        `width:${size}px`,
        `height:${size}px`,
        `background:${color}`,
        `--dx:${Math.cos(angle*Math.PI/180)*dist}px`,
        `--dy:${Math.sin(angle*Math.PI/180)*dist}px`,
        `animation-delay:${delay}s`,
      ].join(';');
      document.body.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }
  }

  function highlightNewCard(id, isUpdate = false) {
    currentNewId = id;
    container.querySelectorAll('.saved-card').forEach(c => {
      const match = Number(c.dataset.id) === id;
      c.classList.toggle('newly-added', match);
      if (match) {
        spawnParticles(c);
        c.querySelector('.new-badge, .update-badge')?.remove();
        const badge = document.createElement('div');
        // screen-only: 印刷時に必ず非表示にするマーカー (CSS @media print)
        badge.className = (isUpdate ? 'update-badge' : 'new-badge') + ' screen-only';
        badge.textContent = isUpdate ? 'UPDATE!' : 'NEW!';
        c.appendChild(badge);
      }
    });
  }

  function clearNewlyAdded() {
    currentNewId = null;
    container.querySelectorAll('.newly-added').forEach(c => {
      c.classList.remove('newly-added');
      c.querySelector('.new-badge, .update-badge')?.remove();
    });
  }

  render();
  store.subscribe(s => {
    if (!savedListChanged(lastRendered, s.saved)) return;
    // 色だけ変わった場合: カードを作り直さず、SVG とレジェンドだけその場で
    // 塗り直す（fadeUp 等のアニメ無し、ジッターも回避）
    if (colorOnlyUpdate(lastRendered, s.saved)) {
      const prevById = new Map(lastRendered.map(p => [p.id, p]));
      s.saved.forEach(snap => {
        const card = container.querySelector(`.saved-card[data-id="${snap.id}"]`);
        if (!card) return;
        const svg = card.querySelector('svg.fb');
        const prev = prevById.get(snap.id);
        if (svg && prev) applyFretboardDiff(svg, snap, prev); // → repaintDotColors
        const leg = card.querySelector('.legend');
        if (leg) renderLegend(leg, snap);
      });
      lastRendered = [...s.saved];
      return;
    }
    render();
    applyEditingHighlight(currentEditingId);
    if (currentNewId != null) highlightNewCard(currentNewId);
  });

  function scrollToCard(id) {
    const card = container.querySelector(`.saved-card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return { applyEditingHighlight, highlightNewCard, clearNewlyAdded, scrollToCard };
}

function renderCard(snap, store, openFullscreen, onEditMode, getEditingId, onColorEdit, onPractice) {
  const snapId = snap.id;
  // colorOnlyUpdate パスはカードを再生成しないため、クリック時に常に最新 snap を参照する
  const liveSnap = () => store.get().saved.find(s => s.id === snapId) ?? snap;

  const card = document.createElement('div');
  card.className = 'saved-card';
  card.dataset.id = snap.id;

  // 通し番号バッジ（1始まり）。番号は CSS counter で DOM 順に自動採番（並べ替えにも追従）。
  // 「設定」ボタンの隣（ヘッダー内）に配置（左上だと NEW! バッジと重なるため）。
  const numBadge = document.createElement('span');
  numBadge.className = 'saved-card-num screen-only';
  numBadge.setAttribute('aria-hidden', 'true');

  // ── ヘッダー (通し番号 / 設定ボタン) ──
  // ドラッグハンドル(⋮⋮)は廃止。カード全体がドラッグ対象なので見た目の掴みどころは不要（ユーザー要望）。
  const hdr = document.createElement('div');
  hdr.className = 'saved-card-header';

  // 操作（編集/練習/色/画像出力/削除）は「設定」メニューに集約。
  async function doImage() {
    try { await exportSavedScalePng(liveSnap()); }
    catch (e) { console.error('画像の出力に失敗しました:', e); showToast('画像の出力に失敗しました'); }
  }
  async function doDelete() {
    if (snap.id === getEditingId?.()) {
      alert('編集中のスケールは削除できません。\n一度編集を終了してください。');
      return;
    }
    if (localStorage.getItem(WARN_KEY)) {
      store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
      return;
    }
    const ok = await confirmDelete(`「${snap.title}」を削除しますか？`);
    if (ok) store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
  }

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn-settings-saved';
  settingsBtn.title = '操作メニュー';
  settingsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>設定`;
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCardMenu(settingsBtn, snap.title, [
      { label: '編集', icon: ICON_EDIT, onClick: () => onEditMode?.(liveSnap()) },
      { label: '練習', icon: ICON_PRACTICE, onClick: () => onPractice?.(liveSnap()) },
      { label: '色', icon: ICON_COLOR, onClick: () => onColorEdit?.(snapId) },
      { label: '画像出力', icon: ICON_IMAGE, onClick: () => doImage() },
      { label: '削除', icon: ICON_DELETE, danger: true, onClick: () => doDelete() },
    ]);
  });

  hdr.appendChild(numBadge);
  hdr.appendChild(settingsBtn);
  card.appendChild(hdr);

  // ── 印刷専用タイトル (画面では非表示、印刷時のみ指板の上に印字) ──
  const printTitle = document.createElement('div');
  printTitle.className = 'saved-print-title';
  printTitle.textContent = localizeTitle(snap.title);
  card.appendChild(printTitle);

  // ── 指板 (クリックで全画面) ──
  const wrap = document.createElement('div');
  wrap.className = 'fb-wrap saved-fb-wrap';
  wrap.title = 'タップで全画面表示';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fb');
  svg.setAttribute('id', 'sv' + snap.id);
  svg.setAttribute('viewBox', `0 0 ${SVG.W} ${SVG.H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  wrap.appendChild(svg);
  card.appendChild(wrap);

  // 全画面クリック — liveSnap() で最新の degreeColors を取得（色変更後に古い色が出るバグ対策）
  wrap.addEventListener('click', () => {
    if (!openFullscreen) return;
    const cur = liveSnap();
    openFullscreen(cur, cur.title);
  });

  const leg = document.createElement('div');
  leg.className = 'legend';
  card.appendChild(leg);

  drawFretboardBase(svg, snap.instrument || 'guitar');

  // Title overlay: large elegant text spanning the fretboard width
  const cx = SVG.ML + SVG.FBW / 2;
  const cy = SVG.MT + SVG.FBH / 2;
  const defs = svg.querySelector('defs');
  const clipId = 'tclip-' + snap.id;
  const clipPath = document.createElementNS(NS, 'clipPath');
  clipPath.setAttribute('id', clipId);
  const clipRect = document.createElementNS(NS, 'rect');
  clipRect.setAttribute('x', SVG.ML);
  clipRect.setAttribute('y', SVG.MT);
  clipRect.setAttribute('width', SVG.FBW);
  clipRect.setAttribute('height', SVG.FBH);
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  // Blurred background band filter
  const bgFiltId = 'bgfilt-' + snap.id;
  const bgFilter = document.createElementNS(NS, 'filter');
  bgFilter.setAttribute('id', bgFiltId);
  bgFilter.setAttribute('x', '-2%'); bgFilter.setAttribute('y', '-40%');
  bgFilter.setAttribute('width', '104%'); bgFilter.setAttribute('height', '180%');
  const bgBlur = document.createElementNS(NS, 'feGaussianBlur');
  bgBlur.setAttribute('in', 'SourceGraphic'); bgBlur.setAttribute('stdDeviation', '10');
  bgFilter.appendChild(bgBlur);
  defs.appendChild(bgFilter);

  // Drop-shadow filter for the text
  const filterId = 'tfilt-' + snap.id;
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-5%'); filter.setAttribute('y', '-30%');
  filter.setAttribute('width', '110%'); filter.setAttribute('height', '160%');
  const shadow = document.createElementNS(NS, 'feDropShadow');
  shadow.setAttribute('dx', '0'); shadow.setAttribute('dy', '2');
  shadow.setAttribute('stdDeviation', '3');
  shadow.setAttribute('flood-color', 'rgba(0,0,0,0.4)');
  filter.appendChild(shadow);
  defs.appendChild(filter);

  // Overlay group — appended LAST so it renders above dots.
  // class="title-overlay" lets print CSS hide it (print shows the plain
  // .saved-print-title above the board instead).
  const overlayGroup = document.createElementNS(NS, 'g');
  overlayGroup.setAttribute('class', 'title-overlay');
  overlayGroup.setAttribute('clip-path', `url(#${clipId})`);

  const bgRect = document.createElementNS(NS, 'rect');
  bgRect.setAttribute('x', String(SVG.ML));
  bgRect.setAttribute('y', String(cy - 46));
  bgRect.setAttribute('width', String(SVG.FBW));
  bgRect.setAttribute('height', String(CARD_TITLE_BG_HEIGHT));
  bgRect.setAttribute('fill', 'rgba(252,238,205,0.78)');
  bgRect.setAttribute('filter', `url(#${bgFiltId})`);
  overlayGroup.appendChild(bgRect);

  const titleOverlay = document.createElementNS(NS, 'text');
  titleOverlay.setAttribute('x', String(cx));
  titleOverlay.setAttribute('y', String(cy));
  titleOverlay.setAttribute('text-anchor', 'middle');
  titleOverlay.setAttribute('dominant-baseline', 'middle');
  titleOverlay.setAttribute('fill', 'rgba(28,12,2,0.88)');
  const titleFontSize = window.innerWidth <= MOBILE_ZOOM_BREAKPOINT
    ? CARD_TITLE_SVG_FONT_SIZE_MOBILE : CARD_TITLE_SVG_FONT_SIZE_PC;
  titleOverlay.setAttribute('font-size', String(titleFontSize));
  titleOverlay.setAttribute('font-weight', '600');
  titleOverlay.setAttribute('letter-spacing', String(CARD_TITLE_SVG_LETTER_SPACING));
  titleOverlay.setAttribute('font-family', 'Space Grotesk, Inter, system-ui, sans-serif');
  titleOverlay.setAttribute('filter', `url(#${filterId})`);
  titleOverlay.textContent = localizeTitle(snap.title);
  overlayGroup.appendChild(titleOverlay);

  svg.appendChild(overlayGroup);  // frontmost — above all dots

  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
