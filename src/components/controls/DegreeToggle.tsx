import { DEGREE_INFO } from '../../domain/constants';
import { useFretboardStore } from '../../store/fretboardStore';
import type { DegreeIndex } from '../../domain/types';

export function DegreeToggle() {
  const activeDegrees = useFretboardStore(s => s.activeDegrees);
  const toggleDegree  = useFretboardStore(s => s.toggleDegree);

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Degrees</span>
      <div className="flex flex-wrap gap-1.5">
        {DEGREE_INFO.map((info, i) => {
          const isRoot   = i === 0;
          const isActive = activeDegrees.has(i as DegreeIndex);

          return (
            <button
              key={info.name}
              onClick={() => !isRoot && toggleDegree(i as DegreeIndex)}
              disabled={isRoot}
              className={[
                'flex items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all',
                'font-mono text-[12px] font-bold',
                isRoot ? 'cursor-default' : 'cursor-pointer',
                isActive
                  ? 'shadow-sm'
                  : 'bg-white border-stone-200 text-stone-300 hover:border-stone-300',
              ].join(' ')}
              style={isActive ? {
                background: info.color.fill,
                borderColor: info.color.stroke,
                color: info.color.text,
              } : undefined}
            >
              {/* Color dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0 border"
                style={isActive ? {
                  background: info.color.stroke,
                  borderColor: info.color.stroke,
                } : {
                  background: '#e2e8f0',
                  borderColor: '#cbd5e1',
                }}
              />
              {info.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
