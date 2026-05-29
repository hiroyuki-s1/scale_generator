const FRET_MIN = 0;
const FRET_MAX = 22;

export function initMaskControl(container, store) {
  container.innerHTML = `<button class="btn-mask" id="maskModalTrigger">マスクOFF</button>`;

  const triggerBtn = document.getElementById('maskModalTrigger');
  const modal      = document.getElementById('maskModal');
  const closeBtn   = document.getElementById('maskModalClose');
  const toggleBtn  = document.getElementById('maskToggle');
  const rangeEl    = document.getElementById('maskModalRange');
  const minDecBtn  = document.getElementById('maskMinDec');
  const minIncBtn  = document.getElementById('maskMinInc');
  const maxDecBtn  = document.getElementById('maskMaxDec');
  const maxIncBtn  = document.getElementById('maskMaxInc');
  const minValEl   = document.getElementById('maskMinVal');
  const maxValEl   = document.getElementById('maskMaxVal');

  triggerBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  toggleBtn.addEventListener('click', () => {
    store.updateEdit(edit => ({ mask: { ...edit.mask, enabled: !edit.mask.enabled } }));
  });

  minDecBtn.addEventListener('click', () => step('min', -1));
  minIncBtn.addEventListener('click', () => step('min', +1));
  maxDecBtn.addEventListener('click', () => step('max', -1));
  maxIncBtn.addEventListener('click', () => step('max', +1));

  function step(which, delta) {
    const { mask } = store.get().edit;
    let lo = mask.min, hi = mask.max;
    if (which === 'min') lo = Math.max(FRET_MIN, Math.min(hi - 1, lo + delta));
    else                 hi = Math.min(FRET_MAX, Math.max(lo + 1, hi + delta));
    store.updateEdit(edit => ({ mask: { ...edit.mask, min: lo, max: hi } }));
  }

  function openModal() {
    syncModal();
    modal.classList.add('show');
  }
  function closeModal() { modal.classList.remove('show'); }

  function syncTrigger() {
    const { mask } = store.get().edit;
    if (mask.enabled) {
      triggerBtn.textContent = `フレット ${mask.min}〜${mask.max}`;
      triggerBtn.classList.add('on');
    } else {
      triggerBtn.textContent = 'マスクOFF';
      triggerBtn.classList.remove('on');
    }
  }

  function syncModal() {
    const { mask } = store.get().edit;
    toggleBtn.textContent = mask.enabled ? 'マスクON' : 'マスクOFF';
    toggleBtn.classList.toggle('on', mask.enabled);
    rangeEl.style.display = mask.enabled ? 'flex' : 'none';
    minValEl.textContent = mask.min;
    maxValEl.textContent = mask.max;
    minDecBtn.disabled = mask.min <= FRET_MIN;
    minIncBtn.disabled = mask.min >= mask.max - 1;
    maxDecBtn.disabled = mask.max <= mask.min + 1;
    maxIncBtn.disabled = mask.max >= FRET_MAX;
  }

  syncTrigger();
  store.subscribe((s, p) => {
    if (p && s.edit.mask === p.edit.mask) return;
    syncTrigger();
    if (modal.classList.contains('show')) syncModal();
  });
}
