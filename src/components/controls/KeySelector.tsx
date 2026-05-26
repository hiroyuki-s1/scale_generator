import { useFretboardStore } from '../../store/fretboardStore';

const WHITE_KEYS = [
  { note: 'C',  index: 0  },
  { note: 'D',  index: 2  },
  { note: 'E',  index: 4  },
  { note: 'F',  index: 5  },
  { note: 'G',  index: 7  },
  { note: 'A',  index: 9  },
  { note: 'B',  index: 11 },
] as const;

// whiteIdx = index into WHITE_KEYS array after which this black key sits
const BLACK_KEYS = [
  { note: 'C#', index: 1,  whiteIdx: 0 },
  { note: 'D#', index: 3,  whiteIdx: 1 },
  { note: 'F#', index: 6,  whiteIdx: 3 },
  { note: 'G#', index: 8,  whiteIdx: 4 },
  { note: 'A#', index: 10, whiteIdx: 5 },
] as const;

const WW = 46; // white key width
const WH = 64; // white key height
const BW = 30; // black key width
const BH = 40; // black key height

export function KeySelector() {
  const rootIndex = useFretboardStore(s => s.rootIndex);
  const setRoot   = useFretboardStore(s => s.setRoot);

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Key</span>
      <div className="relative select-none" style={{ width: WHITE_KEYS.length * WW, height: WH }}>

        {/* White keys */}
        {WHITE_KEYS.map((key, i) => {
          const active = key.index === rootIndex;
          return (
            <button
              key={key.note}
              onClick={() => setRoot(key.index)}
              style={{ left: i * WW, width: WW - 2, height: WH, position: 'absolute', top: 0 }}
              className={[
                'rounded-b-lg border-x border-b flex items-end justify-center pb-2',
                'text-[12px] font-semibold transition-colors z-0',
                active
                  ? 'bg-stone-800 border-stone-800 text-white'
                  : 'bg-white border-stone-300 text-stone-500 hover:bg-stone-50',
              ].join(' ')}
            >
              {key.note}
            </button>
          );
        })}

        {/* Black keys */}
        {BLACK_KEYS.map(key => {
          const active = key.index === rootIndex;
          const x = (key.whiteIdx + 1) * WW - BW / 2 - 1;
          return (
            <button
              key={key.note}
              onClick={() => setRoot(key.index)}
              style={{ left: x, width: BW, height: BH, position: 'absolute', top: 0, zIndex: 10 }}
              className={[
                'rounded-b-md flex items-end justify-center pb-1',
                'text-[10px] font-bold transition-colors border',
                active
                  ? 'bg-[#b54a1f] border-[#9a3d18] text-white'
                  : 'bg-stone-800 border-stone-900 text-stone-300 hover:bg-stone-700',
              ].join(' ')}
            >
              {key.note}
            </button>
          );
        })}
      </div>
    </section>
  );
}
