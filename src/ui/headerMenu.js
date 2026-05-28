/**
 * Mobile "more" header menu. On phones the header can't fit all of the
 * controls, so Color / Orient / Reset move into a single dropdown reached
 * from a ⋮ trigger. Desktop hides the trigger and menu via CSS.
 */
export function initHeaderMenu(store) {
  const trigger = document.getElementById('moreTrigger');
  const menu = document.getElementById('moreMenu');
  if (!trigger || !menu) return;

  const colorBtn = document.getElementById('colorBtn');
  const resetBtn = document.getElementById('resetBtn');

  function close() {
    trigger.classList.remove('open');
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', isOpen);
    trigger.classList.toggle('open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
    }
  });

  menu.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'color')        colorBtn?.click();
    else if (act === 'orient-land') store.updateLayout({ orientation: 'landscape' });
    else if (act === 'orient-port') store.updateLayout({ orientation: 'portrait' });
    else if (act === 'reset')   resetBtn?.click();
    close();
  });

  function syncOrient() {
    const o = store.get().layout.orientation;
    const bl = menu.querySelector('[data-act="orient-land"]');
    const bp = menu.querySelector('[data-act="orient-port"]');
    if (bl) bl.classList.toggle('active', o === 'landscape');
    if (bp) bp.classList.toggle('active', o === 'portrait');
  }
  syncOrient();
  store.subscribe((s, p) => {
    if (p && s.layout.orientation === p.layout.orientation) return;
    syncOrient();
  });
}
