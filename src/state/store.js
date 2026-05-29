/**
 * pub/sub store。listenerは (state, prev) を受け取り、スライス比較で
 * 自分が関心ない更新を早期returnできる。
 */
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  const set = (patch) => {
    if (patch === state) return;
    const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    if (next === state) return;
    const prev = state;
    state = next;
    listeners.forEach(fn => fn(state, prev));
  };
  return {
    get() { return state; },
    set,
    updateEdit(patch) {
      set(s => ({ ...s, edit: { ...s.edit, ...(typeof patch === 'function' ? patch(s.edit) : patch) } }));
    },
    updateLayout(patch) {
      set(s => ({ ...s, layout: { ...s.layout, ...patch } }));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
