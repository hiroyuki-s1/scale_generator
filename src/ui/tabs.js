export function initTabs(store) {
  const btnEdit   = document.getElementById('tabBtnEdit');
  const btnSaved  = document.getElementById('tabBtnSaved');
  const btnIreal  = document.getElementById('tabBtnIreal');
  const paneEdit  = document.getElementById('tabEdit');
  const paneSaved = document.getElementById('tabSaved');
  const paneIreal = document.getElementById('tabIreal');
  const badge     = document.getElementById('savedBadge');

  btnEdit.addEventListener('click',  () => store.set({ activeTab: 'edit' }));
  btnSaved.addEventListener('click', () => store.set({ activeTab: 'saved' }));
  btnIreal.addEventListener('click', () => store.set({ activeTab: 'ireal' }));

  function sync() {
    const { activeTab, saved } = store.get();
    paneEdit.classList.toggle('hidden',  activeTab !== 'edit');
    paneSaved.classList.toggle('hidden', activeTab !== 'saved');
    paneIreal.classList.toggle('hidden', activeTab !== 'ireal');
    btnEdit.classList.toggle('active',  activeTab === 'edit');
    btnSaved.classList.toggle('active', activeTab === 'saved');
    btnIreal.classList.toggle('active', activeTab === 'ireal');
    badge.textContent = saved.length;
    badge.style.display = saved.length > 0 ? '' : 'none';
  }
  sync();
  store.subscribe((s, p) => {
    if (p && s.activeTab === p.activeTab && s.saved.length === p.saved.length) return;
    sync();
  });
}
