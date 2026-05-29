import { SVG } from '../domain/constants.js';
import { localizeTitle } from '../domain/i18n.js';
import { drawFretboardBase, applyFretboardDiff } from './fretboardSvg.js';
import { renderLegend } from './legend.js';

const NS = 'http://www.w3.org/2000/svg';

/** ひらがな → カタカナ変換 (U+3041–U+3096 → +0x60) */
function toKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

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
      if (result && checkbox.checked) {
        localStorage.setItem(WARN_KEY, '1');
        updateRestoreBtn();
      }
      resolve(result);
    }
    const onOk      = () => finish(true);
    const onCancel  = () => finish(false);
    const onOverlay = e => { if (e.target === modal) finish(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
  });
}

function updateRestoreBtn() {
  const restoreEl = document.getElementById('savedWarnRestore');
  if (restoreEl) restoreEl.classList.toggle('hidden', !localStorage.getItem(WARN_KEY));
}

export function initSavedTab(container, store, openFullscreen, onEditMode = null) {
  const emptyEl = document.getElementById('savedEmpty');
  let lastIdsKey = '';

  // 再有効化ボタン
  updateRestoreBtn();
  const restoreBtn = document.getElementById('savedWarnRestoreBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      localStorage.removeItem(WARN_KEY);
      updateRestoreBtn();
    });
  }

  container.classList.add('screen-grid');
  container.style.gridTemplateColumns = 'repeat(2, 1fr)';
  container.style.gap = '16px';

  // ── ドラッグ&ドロップ並べ替え (Pointer Events) ───────────────────────
  // タッチ: 400ms 長押し → ドラッグ開始。マウス: 5px 移動 → ドラッグ開始。
  // setPointerCapture でブラウザのスクロール乗っ取りを防ぐ。
  let draggingId  = null;
  let dropTargetEl = null;
  let dragState   = null; // { card, pointerId, pointerType, startX, startY, active, timer }

  function clearDropTarget() {
    dropTargetEl?.classList.remove('drop-target');
    dropTargetEl = null;
  }

  /** ポインター位置に基づいてスワップ先カードを探す (dragging カード除外) */
  function findDropTarget(x, y) {
    const els = [...container.querySelectorAll('.saved-card:not(.dragging)')];
    let bestEl   = null;
    let bestDist = Infinity;
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
    lastIdsKey = orderedIds.join(',');
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

  /** スワップ直後に両カードを緑フラッシュ */
  function animateSwap(a, b) {
    [a, b].forEach(card => {
      card.classList.remove('swap-flash');
      void card.offsetWidth;
      card.classList.add('swap-flash');
      card.addEventListener('animationend', () => card.classList.remove('swap-flash'), { once: true });
    });
  }

  function startDrag() {
    if (!dragState || dragState.active) return;
    dragState.active = true;
    draggingId = Number(dragState.card.dataset.id);
    dragState.card.classList.add('dragging');
    navigator.vibrate?.(40);
    // ポインターキャプチャ: ブラウザがスクロールを奪うのを防ぐ
    dragState.card.setPointerCapture(dragState.pointerId);
  }

  function endDrag(cancelled = false) {
    if (!dragState) return;
    const { card, active } = dragState;
    card.classList.remove('dragging');
    if (active && !cancelled && dropTargetEl && dropTargetEl !== card) {
      swapCards(card, dropTargetEl);
      animateSwap(card, dropTargetEl);
    }
    clearDropTarget();
    const wasActive = active;
    const savedId = draggingId;
    dragState = null;
    draggingId = null;
    if (wasActive && savedId != null) commitOrder();
  }

  container.addEventListener('pointerdown', e => {
    if (dragState) return;
    if (e.target.closest('.btn-edit-saved, .btn-delete')) return;
    const card = e.target.closest('.saved-card');
    if (!card) return;

    dragState = {
      card,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      timer: e.pointerType === 'touch' ? setTimeout(startDrag, 400) : null,
    };
  });

  container.addEventListener('pointermove', e => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;

    if (dragState.active) {
      e.preventDefault(); // スクロール抑制
      const candidate = findDropTarget(e.clientX, e.clientY);
      if (candidate !== dropTargetEl) {
        clearDropTarget();
        dropTargetEl = candidate;
        dropTargetEl?.classList.add('drop-target');
      }
      return;
    }

    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    if (dragState.pointerType !== 'touch') {
      if (dist > 5) startDrag();
    } else if (dist > 8) {
      // スクロール判定: タイマーキャンセル
      clearTimeout(dragState.timer);
      dragState = null;
    }
  }, { passive: false });

  container.addEventListener('pointerup', e => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    clearTimeout(dragState.timer);
    endDrag();
  });

  container.addEventListener('pointercancel', e => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    clearTimeout(dragState.timer);
    endDrag(true);
  });

  function render() {
    const { saved } = store.get();
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = saved.length === 0 ? '' : 'none';
    lastIdsKey = saved.map(s => s.id).join(',');
    saved.forEach(snap => {
      try {
        container.appendChild(renderCard(snap, store, openFullscreen, onEditMode));
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
        badge.className = 'edit-badge';
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
        badge.className = isUpdate ? 'update-badge' : 'new-badge';
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
    const idsKey = s.saved.map(c => c.id).join(',');
    if (idsKey === lastIdsKey) return;
    render();
    applyEditingHighlight(currentEditingId);
    if (currentNewId != null) highlightNewCard(currentNewId);
  });

  return { applyEditingHighlight, highlightNewCard, clearNewlyAdded };
}

function renderCard(snap, store, openFullscreen, onEditMode) {
  const card = document.createElement('div');
  card.className = 'saved-card';
  card.dataset.id = snap.id;

  // ── ヘッダー (ドラッグハンドル / 編集 / 削除ボタン) ──
  const hdr = document.createElement('div');
  hdr.className = 'saved-card-header';

  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.title = 'ドラッグして並べ替え';
  dragHandle.setAttribute('aria-hidden', 'true');
  dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
    <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
    <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
  </svg>`;
  hdr.appendChild(dragHandle);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-edit-saved';
  editBtn.title = '編集エリアに読み込む';
  editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10z"/>
  </svg>編集`;
  editBtn.addEventListener('click', () => onEditMode?.(snap));

  const del = document.createElement('button');
  del.className = 'btn-delete';
  del.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1 0-2h3.5V1h3v1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118z"/>
  </svg>削除`;
  del.addEventListener('click', async () => {
    if (localStorage.getItem(WARN_KEY)) {
      store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
      return;
    }
    const ok = await confirmDelete(`「${snap.title}」を削除しますか？`);
    if (ok) store.set(state => ({ ...state, saved: state.saved.filter(s => s.id !== snap.id) }));
  });

  hdr.appendChild(editBtn);
  hdr.appendChild(del);
  card.appendChild(hdr);

  // ── 印刷専用タイトル (画面では非表示、印刷時のみ指板の上に印字) ──
  const printTitle = document.createElement('div');
  printTitle.className = 'saved-print-title';
  printTitle.textContent = toKatakana(localizeTitle(snap.title));
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

  // 全画面クリック
  wrap.addEventListener('click', () => {
    if (openFullscreen) openFullscreen(snap, snap.title);
  });

  const leg = document.createElement('div');
  leg.className = 'legend';
  card.appendChild(leg);

  drawFretboardBase(svg);

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
  bgRect.setAttribute('height', '92');
  bgRect.setAttribute('fill', 'rgba(252,238,205,0.78)');
  bgRect.setAttribute('filter', `url(#${bgFiltId})`);
  overlayGroup.appendChild(bgRect);

  const titleOverlay = document.createElementNS(NS, 'text');
  titleOverlay.setAttribute('x', String(cx));
  titleOverlay.setAttribute('y', String(cy));
  titleOverlay.setAttribute('text-anchor', 'middle');
  titleOverlay.setAttribute('dominant-baseline', 'middle');
  titleOverlay.setAttribute('fill', 'rgba(28,12,2,0.88)');
  titleOverlay.setAttribute('font-size', '58');
  titleOverlay.setAttribute('font-weight', '600');
  titleOverlay.setAttribute('letter-spacing', '5');
  titleOverlay.setAttribute('font-family', 'Space Grotesk, Inter, system-ui, sans-serif');
  titleOverlay.setAttribute('filter', `url(#${filterId})`);
  titleOverlay.textContent = toKatakana(localizeTitle(snap.title));
  overlayGroup.appendChild(titleOverlay);

  svg.appendChild(overlayGroup);  // frontmost — above all dots

  applyFretboardDiff(svg, snap, null);
  renderLegend(leg, snap);

  return card;
}
