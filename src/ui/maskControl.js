export function initMaskControl(container, store) {
  container.innerHTML = `
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

  const toggle   = container.querySelector('[data-el="toggle"]');
  const sliders  = container.querySelector('[data-el="sliders"]');
  const minIn    = container.querySelector('[data-el="min"]');
  const maxIn    = container.querySelector('[data-el="max"]');
  const minLabel = container.querySelector('[data-el="minVal"]');
  const maxLabel = container.querySelector('[data-el="maxVal"]');

  toggle.addEventListener('click', () => {
    store.updateEdit(edit => ({ mask: { ...edit.mask, enabled: !edit.mask.enabled } }));
  });

  minIn.addEventListener('input', () => updateFromInputs(true));
  maxIn.addEventListener('input', () => updateFromInputs(false));

  function updateFromInputs(minTouched) {
    let lo = parseInt(minIn.value);
    let hi = parseInt(maxIn.value);
    if (lo > hi) { if (minTouched) hi = lo; else lo = hi; }
    store.updateEdit(edit => ({ mask: { ...edit.mask, min: lo, max: hi } }));
  }

  function sync() {
    const { mask } = store.get().edit;
    toggle.textContent = mask.enabled ? 'Mask ON' : 'Mask OFF';
    toggle.classList.toggle('on', mask.enabled);
    sliders.style.display = mask.enabled ? 'flex' : 'none';
    minIn.value = mask.min;
    maxIn.value = mask.max;
    minLabel.textContent = mask.min;
    maxLabel.textContent = mask.max;
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.edit.mask === p.edit.mask) return;
    sync();
  });
}
