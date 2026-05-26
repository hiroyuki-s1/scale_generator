import { DEGREE_INFO, NOTE_NAMES } from '../../domain/constants';
import { useFretboardStore } from '../../store/fretboardStore';
import type { DegreeIndex } from '../../domain/types';

export function Legend() {
  const activeDegrees = useFretboardStore(s => s.activeDegrees);
  const rootIndex     = useFretboardStore(s => s.rootIndex);

  return (
    <div className="flex flex-wrap gap-3 items-center mt-3">
      {[...activeDegrees]
        .sort((a, b) => a - b)
        .map(i => {
          const info  = DEGREE_INFO[i as DegreeIndex];
          const label = i === 0 ? `R (${NOTE_NAMES[rootIndex]})` : info.name;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <svg width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9"
                  fill={info.color.fill}
                  stroke={info.color.stroke}
                  strokeWidth="2" />
                <text x="10" y="14"
                  textAnchor="middle"
                  fontSize={info.name.length > 2 ? 7 : 8.5}
                  fontWeight="bold"
                  fontFamily="'Courier New', monospace"
                  fill={info.color.text}>
                  {info.name}
                </text>
              </svg>
              <span
                className="text-[11px] font-bold font-mono"
                style={{ color: info.color.text }}
              >
                {label}
              </span>
            </div>
          );
        })}
    </div>
  );
}
