const FRET_MIN = 0;
const FRET_MAX = 22;

export function initMaskControl(container, store) {
  container.innerHTML = `
    <button class="btn-mask" data-el="toggle">マスクOFF</button>
    <div class="mask-steppers" data-el="steppers" style="display:none">
      <div class="mask-stepper-group">
        <span class="mslider-lbl">MIN</span>
        <button class="mask-step-btn" data-el="minDec">−</button>
        <span class="mval" data-el="minVal">1</span>
        <button class="mask-step-btn" data-el="minInc">＋</button>
      </div>
      <span class="msep">—</span>
      <div class="mask-stepper-group">
        <span class="mslider-lbl">MAX</span>
        <button class="mask-step-btn" data-el="maxDec">−</button>
        <span class="mval" data-el="maxVal">15</span>
        <button class="mask-step-btn" data-el="maxInc">＋</button>
      </div>
    </div>
  `;

  const toggle   = container.querySelector('[data-el="toggle"]');
  const steppers = container.querySelector('[data-el="steppers"]');
  const minDecBtn = container.querySelector('[data-el="minDec"]');
  const minIncBtn = container.querySelector('[data-el="minInc"]');
  const maxDecBtn = container.querySelector('[data-el="maxDec"]');
  const maxIncBtn = container.querySelector('[data-el="maxInc"]');
  const minLabel = container.querySelector('[data-el="minVal"]');
  const maxLabel = container.querySelector('[data-el="maxVal"]');

  toggle.addEventListener('click', () => {
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

  function sync() {
    const { mask } = store.get().edit;
    toggle.textContent = mask.enabled ? 'マスクON' : 'マスクOFF';
    toggle.classList.toggle('on', mask.enabled);
    steppers.style.display = mask.enabled ? 'flex' : 'none';
    minLabel.textContent = mask.min;
    maxLabel.textContent = mask.max;
    minDecBtn.disabled = mask.min <= FRET_MIN;
    minIncBtn.disabled = mask.min >= mask.max - 1;
    maxDecBtn.disabled = mask.max <= mask.min + 1;
    maxIncBtn.disabled = mask.max >= FRET_MAX;
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.edit.mask === p.edit.mask) return;
    sync();
  });
}
