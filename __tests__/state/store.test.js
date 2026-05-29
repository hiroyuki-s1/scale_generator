import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../../src/state/store.js';

const makeStore = (extra = {}) => createStore({
  edit: {
    rootIndex: 9,
    activeDegrees: new Set([0, 3, 5, 7, 10]),
    presetName: 'minor_pentatonic',
    mode: 'scale',
    mask: { enabled: false, min: 1, max: 15 },
    degreeColors: [],
    instrument: null,
  },
  saved: [],
  layout: { cols: 2, rows: 3 },
  activeTab: 'edit',
  nextId: 1,
  ...extra,
});

describe('createStore', () => {
  it('get() returns initial state', () => {
    const store = makeStore();
    expect(store.get().edit.rootIndex).toBe(9);
  });

  it('set() with object merges at top level', () => {
    const store = makeStore();
    store.set({ activeTab: 'saved' });
    expect(store.get().activeTab).toBe('saved');
    expect(store.get().edit.rootIndex).toBe(9); // edit intact
  });

  it('set() with function receives current state', () => {
    const store = makeStore();
    store.set(s => ({ ...s, nextId: s.nextId + 1 }));
    expect(store.get().nextId).toBe(2);
  });

  it('set() with same reference does not notify listeners', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const state = store.get();
    store.set(state); // same reference
    expect(listener).not.toHaveBeenCalled();
  });

  it('updateEdit() merges only the edit slice', () => {
    const store = makeStore();
    store.updateEdit({ rootIndex: 0 });
    expect(store.get().edit.rootIndex).toBe(0);
    expect(store.get().edit.presetName).toBe('minor_pentatonic'); // untouched
    expect(store.get().saved).toEqual([]); // top level untouched
  });

  it('updateEdit() accepts a function (s, prev) pattern', () => {
    const store = makeStore();
    store.updateEdit(edit => ({ mask: { ...edit.mask, enabled: true } }));
    expect(store.get().edit.mask.enabled).toBe(true);
    expect(store.get().edit.mask.min).toBe(1); // spread preserved
  });

  it('updateLayout() merges only the layout slice', () => {
    const store = makeStore();
    store.updateLayout({ cols: 3 });
    expect(store.get().layout.cols).toBe(3);
    expect(store.get().layout.rows).toBe(3); // untouched
  });

  it('subscribe() fires listener with (state, prev) on every change', () => {
    const store = makeStore();
    const calls = [];
    store.subscribe((state, prev) => calls.push({ state, prev }));
    store.set({ activeTab: 'saved' });
    expect(calls).toHaveLength(1);
    expect(calls[0].state.activeTab).toBe('saved');
    expect(calls[0].prev.activeTab).toBe('edit');
  });

  it('subscribe() returns an unsubscribe function', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.set({ activeTab: 'saved' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    store.set({ activeTab: 'edit' });
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it('multiple listeners all receive updates', () => {
    const store = makeStore();
    const a = vi.fn(), b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.set({ nextId: 99 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('state is immutable: updateEdit creates a new object reference', () => {
    const store = makeStore();
    const before = store.get();
    store.updateEdit({ rootIndex: 5 });
    const after = store.get();
    expect(after).not.toBe(before);
    expect(after.edit).not.toBe(before.edit);
  });
});
