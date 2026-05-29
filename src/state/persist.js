import { cloneColors } from './snapshot.js';
import {
  DEFAULT_COLORS, FRET_START, FRET_END,
} from '../domain/constants.js';

const KEY = 'sg.v1.state';
const DEBOUNCE_MS = 200;

// 旧プリセット名 → 現行名のマイグレーション。Major / Natural Minor 等を
// チャーチモード正式名に統一したため、古い保存データの presetName を
// 救済する。
const PRESET_NAME_MIGRATIONS = {
  'Major': 'Ionian',
  'Natural Minor': 'Aeolian',
};

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

// ── 入力サニタイズ・clamp ──────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isInt = v => Number.isInteger(v);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const safeHex = (v, fallback) => (typeof v === 'string' && HEX_RE.test(v) ? v : fallback);

function migratePresetName(name) {
  if (typeof name !== 'string') return null;
  return PRESET_NAME_MIGRATIONS[name] ?? name;
}

function sanitizeDegrees(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(d => isInt(d) && d >= 0 && d <= 11))];
}

function sanitizeColors(raw) {
  if (!Array.isArray(raw) || raw.length !== DEFAULT_COLORS.length) {
    return cloneColors(DEFAULT_COLORS);
  }
  return raw.map((c, i) => {
    const fb = DEFAULT_COLORS[i];
    if (!c || typeof c !== 'object') return { ...fb };
    return {
      solid: typeof c.solid === 'boolean' ? c.solid : fb.solid,
      color: safeHex(c.color, fb.color),
      text:  safeHex(c.text,  fb.text),
    };
  });
}

function sanitizeMask(raw) {
  const fb = { enabled: false, min: FRET_START, max: FRET_END };
  if (!raw || typeof raw !== 'object') return fb;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false;
  let min = isInt(raw.min) ? clamp(raw.min, FRET_START, FRET_END) : FRET_START;
  let max = isInt(raw.max) ? clamp(raw.max, FRET_START, FRET_END) : FRET_END;
  if (min > max) [min, max] = [max, min];
  return { enabled, min, max };
}

function sanitizeInstrument(raw, fallback = null) {
  return raw === 'guitar' || raw === 'bass' ? raw : fallback;
}

function sanitizeEdit(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      rootIndex: 0,
      activeDegrees: new Set(),
      presetName: null,
      mode: 'scale',
      mask: { enabled: false, min: FRET_START, max: FRET_END },
      degreeColors: cloneColors(DEFAULT_COLORS),
      instrument: null,
    };
  }
  return {
    rootIndex: isInt(raw.rootIndex) ? clamp(raw.rootIndex, 0, 11) : 0,
    activeDegrees: new Set(sanitizeDegrees(raw.activeDegrees)),
    presetName: migratePresetName(raw.presetName),
    mode: raw.mode === 'chord' ? 'chord' : 'scale',
    mask: sanitizeMask(raw.mask),
    degreeColors: sanitizeColors(raw.degreeColors),
    instrument: sanitizeInstrument(raw.instrument, null),
  };
}

function sanitizeSaved(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(s => s && typeof s === 'object' && isInt(s.id))
    .map(s => ({
      ...sanitizeEdit(s),
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '無題',
      // saved snapshot は楽器が必ず確定している必要がある
      instrument: sanitizeInstrument(s.instrument, 'guitar'),
    }));
}

function sanitizeLayout(raw) {
  const fb = { orientation: 'landscape', cols: 2, rows: 3 };
  if (!raw || typeof raw !== 'object') return fb;
  return {
    orientation: raw.orientation === 'portrait' ? 'portrait' : 'landscape',
    cols: isInt(raw.cols) ? clamp(raw.cols, 1, 6) : fb.cols,
    rows: isInt(raw.rows) ? clamp(raw.rows, 1, 6) : fb.rows,
  };
}

/** 公開: 任意の生データを正規化済み state にする (テスト容易性のため export) */
export function sanitizeStoredState(data) {
  return {
    edit: sanitizeEdit(data?.edit),
    saved: sanitizeSaved(data?.saved),
    layout: sanitizeLayout(data?.layout),
    activeTab: data?.activeTab === 'saved' ? 'saved' : 'edit',
    nextId: isInt(data?.nextId) && data.nextId >= 1 ? data.nextId : 1,
  };
}

export function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return sanitizeStoredState(JSON.parse(raw));
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
