const FRET_MIN = 0;
const FRET_MAX = 22;

export function initMaskControl(container, store) {
  container.innerHTML = `
    <button class="btn-mask" data-el="toggle">マスクOFF</button>
    <div class="mask-panel" data-el="panel" style="display:none">
      <div class="mask-track-wrap">
        <div class="mask-track-fill" data-el="fill"></div>
      </div>
      <div class="mask-stepper-row">
        <div class="mask-stepper-group">
          <span class="mask-stepper-lbl">MIN</span>
          <div class="mask-stepper-ctrl">
            <button class="mask-step-lg" data-el="minDec">−</button>
            <span class="mask-val-lg" data-el="minVal">1</span>
            <button class="mask-step-lg" data-el="minInc">＋</button>
          </div>
        </div>
        <span class="mask-stepper-sep">〜</span>
        <div class="mask-stepper-group">
          <span class="mask-stepper-lbl">MAX</span>
          <div class="mask-stepper-ctrl">
            <button class="mask-step-lg" data-el="maxDec">−</button>
            <span class="mask-val-lg" data-el="maxVal">22</span>
            <button class="mask-step-lg" data-el="maxInc">＋</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const el = key => container.querySelector(`[data-el="${key}"]`);
  const toggle   = el('toggle');
  const panel    = el('panel');
  const fill     = el('fill');
  const minDecBtn = el('minDec');
  const minIncBtn = el('minInc');
  const maxDecBtn = el('maxDec');
  const maxIncBtn = el('maxInc');
  const minValEl  = el('minVal');
  const maxValEl  = el('maxVal');

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
    const on = mask.enabled;
    toggle.textContent = on ? `フレット ${mask.min}〜${mask.max}` : 'マスクOFF';
    toggle.classList.toggle('on', on);
    panel.style.display = on ? 'block' : 'none';
    if (!on) return;
    minValEl.textContent = mask.min;
    maxValEl.textContent = mask.max;
    fill.style.left  = `${(mask.min / FRET_MAX) * 100}%`;
    fill.style.width = `${((mask.max - mask.min) / FRET_MAX) * 100}%`;
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
