import { useFretboardStore } from '../../store/fretboardStore';

const PRESET_GROUPS = [
  { label: 'Penta',    presets: ['Major Penta', 'Minor Penta', 'Blues'] },
  { label: 'Diatonic', presets: ['Major', 'Natural Minor', 'Dorian', 'Mixolydian'] },
  { label: 'Advanced', presets: ['Lydian Dom', 'Altered', 'Harmonic Min'] },
] as const;

export function ScaleSelector() {
  const presetName  = useFretboardStore(s => s.presetName);
  const applyPreset = useFretboardStore(s => s.applyPreset);

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Scale</span>
      <div className="flex flex-col gap-2">
        {PRESET_GROUPS.map(group => (
          <div key={group.label} className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-300 w-14 shrink-0">
              {group.label}
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {group.presets.map(name => {
                const active = name === presetName;
                return (
                  <button
                    key={name}
                    onClick={() => applyPreset(name)}
                    className={[
                      'px-3 py-2 rounded-lg text-[12px] font-medium border transition-colors whitespace-nowrap',
                      active
                        ? 'bg-[#b54a1f] border-[#b54a1f] text-white font-semibold'
                        : 'bg-white border-stone-200 text-stone-600 hover:border-stone-400 hover:bg-stone-50',
                    ].join(' ')}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
