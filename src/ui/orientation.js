export function initOrientation(store) {
  const land = document.getElementById('orientLand');
  const port = document.getElementById('orientPort');
  land.addEventListener('click', () => store.updateLayout({ orientation: 'landscape' }));
  port.addEventListener('click', () => store.updateLayout({ orientation: 'portrait' }));

  function sync() {
    const o = store.get().layout.orientation;
    land.classList.toggle('active', o === 'landscape');
    port.classList.toggle('active', o === 'portrait');
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.layout.orientation === p.layout.orientation) return;
    sync();
  });
}
