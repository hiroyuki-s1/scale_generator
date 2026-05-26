import { create } from 'zustand';
import type { DegreeIndex, MaskRange } from '../domain/types';
import { SCALE_PRESETS } from '../domain/constants';

interface FretboardState {
  readonly rootIndex: number;
  readonly activeDegrees: ReadonlySet<DegreeIndex>;
  readonly presetName: string | null;
  readonly mask: MaskRange;

  // actions
  setRoot: (rootIndex: number) => void;
  applyPreset: (presetName: string) => void;
  toggleDegree: (degree: DegreeIndex) => void;
  setMaskEnabled: (enabled: boolean) => void;
  setMaskMin: (min: number) => void;
  setMaskMax: (max: number) => void;
}

const DEFAULT_PRESET = SCALE_PRESETS.find(p => p.name === 'Minor Penta')!;

export const useFretboardStore = create<FretboardState>((set) => ({
  rootIndex:     9, // A
  activeDegrees: new Set(DEFAULT_PRESET.degrees as DegreeIndex[]),
  presetName:    DEFAULT_PRESET.name,
  mask: { enabled: false, min: 1, max: 15 },

  setRoot: (rootIndex) =>
    set(() => ({ rootIndex })),

  applyPreset: (presetName) => {
    const preset = SCALE_PRESETS.find(p => p.name === presetName);
    if (!preset) return;
    set(() => ({
      presetName,
      activeDegrees: new Set(preset.degrees as DegreeIndex[]),
    }));
  },

  toggleDegree: (degree) =>
    set((state) => {
      if (degree === 0) return state; // root is always on
      const next = new Set(state.activeDegrees);
      if (next.has(degree)) next.delete(degree);
      else next.add(degree);
      return { activeDegrees: next, presetName: null };
    }),

  setMaskEnabled: (enabled) =>
    set((state) => ({ mask: { ...state.mask, enabled } })),

  setMaskMin: (min) =>
    set((state) => ({
      mask: { ...state.mask, min: Math.min(min, state.mask.max) },
    })),

  setMaskMax: (max) =>
    set((state) => ({
      mask: { ...state.mask, max: Math.max(max, state.mask.min) },
    })),
}));
