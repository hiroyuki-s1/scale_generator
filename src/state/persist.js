import { cloneColors } from './snapshot.js';

const KEY = 'sg.v1.state';
const DEBOUNCE_MS = 200;

const editForJson = e => ({
  rootIndex: e.rootIndex,
  activeDegrees: [...e.activeDegrees],
  presetName: e.presetName,
  mode: e.mode || 'scale',
  mask: { ...e.mask },
  degreeColors: cloneColors(e.degreeColors),
  instrument: e.instrument || null,
});

export function snapshotForStorage(state) {
  return {
    edit: editForJson(state.edit),
    saved: state.saved.map(s => ({ id: s.id, title: s.title, ...editForJson(s) })),
    layout: { ...state.layout },
    activeTab: state.activeTab,
    nextId: state.nextId,
  };
}

export function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      edit: {
        ...data.edit,
        activeDegrees: new Set(data.edit.activeDegrees),
        mode: data.edit.mode || 'scale',
        instrument: data.edit.instrument || null,
      },
      saved: data.saved.map(s => ({
        ...s,
        activeDegrees: new Set(s.activeDegrees),
        mode: s.mode || 'scale',
        instrument: s.instrument || 'guitar',
      })),
      layout: data.layout,
      activeTab: data.activeTab || 'edit',
      nextId: data.nextId || 1,
    };
  } catch (e) {
    console.warn('Failed to restore state:', e);
    return null;
  }
}

export function attachPersist(store) {
  let timer = null;
  store.subscribe(state => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshotForStorage(state)));
      } catch (e) {
        console.warn('Failed to persist state:', e);
      }
    }, DEBOUNCE_MS);
  });
}
