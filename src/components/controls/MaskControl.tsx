import { useFretboardStore } from '../../store/fretboardStore';
import { FRET_START, FRET_END } from '../../domain/constants';

export function MaskControl() {
  const mask           = useFretboardStore(s => s.mask);
  const setMaskEnabled = useFretboardStore(s => s.setMaskEnabled);
  const setMaskMin     = useFretboardStore(s => s.setMaskMin);
  const setMaskMax     = useFretboardStore(s => s.setMaskMax);

  return (
    <section className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Fret Mask</span>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setMaskEnabled(!mask.enabled)}
          className={[
            'px-4 py-2.5 rounded-md text-[13px] font-bold border transition-colors min-h-[44px]',
            mask.enabled
              ? 'bg-violet-700 border-violet-700 text-white'
              : 'bg-white border-stone-300 text-stone-500 hover:border-stone-400',
          ].join(' ')}
        >
          {mask.enabled ? 'Mask ON' : 'Mask OFF'}
        </button>

        {mask.enabled && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wide text-stone-400 w-7">Min</label>
              <input
                type="range"
                min={FRET_START}
                max={FRET_END}
                value={mask.min}
                onChange={e => setMaskMin(Number(e.target.value))}
                className="w-28 accent-violet-700 cursor-pointer h-6"
              />
              <span className="w-6 text-center font-mono font-bold text-[14px] text-violet-700">{mask.min}</span>
            </div>
            <span className="text-stone-300 text-lg">—</span>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wide text-stone-400 w-7">Max</label>
              <input
                type="range"
                min={FRET_START}
                max={FRET_END}
                value={mask.max}
                onChange={e => setMaskMax(Number(e.target.value))}
                className="w-28 accent-violet-700 cursor-pointer h-6"
              />
              <span className="w-6 text-center font-mono font-bold text-[14px] text-violet-700">{mask.max}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
