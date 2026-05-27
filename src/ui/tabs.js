export function initTabs(store) {
  const btnEdit   = document.getElementById('tabBtnEdit');
  const btnSaved  = document.getElementById('tabBtnSaved');
  const paneEdit  = document.getElementById('tabEdit');
  const paneSaved = document.getElementById('tabSaved');
  const badge     = document.getElementById('savedBadge');

  btnEdit.addEventListener('click',  () => store.set({ activeTab: 'edit' }));
  btnSaved.addEventListener('click', () => store.set({ activeTab: 'saved' }));

  function sync(scrollToTop) {
    const { activeTab, saved } = store.get();
    paneEdit.classList.toggle('hidden',  activeTab !== 'edit');
    paneSaved.classList.toggle('hidden', activeTab !== 'saved');
    btnEdit.classList.toggle('active',  activeTab === 'edit');
    btnSaved.classList.toggle('active', activeTab === 'saved');
    badge.textContent = saved.length;
    badge.style.display = saved.length > 0 ? '' : 'none';
    if (scrollToTop) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  sync(false);
  store.subscribe((s, p) => {
    if (p && s.activeTab === p.activeTab && s.saved.length === p.saved.length) return;
    sync(p && s.activeTab !== p.activeTab);
  });
}
