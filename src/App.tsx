import { useFretboardStore } from './store/fretboardStore';
import { buildTitle } from './domain/ScaleService';
import { FretboardSvg } from './components/Fretboard/FretboardSvg';
import { Legend } from './components/Fretboard/Legend';
import { KeySelector } from './components/controls/KeySelector';
import { ScaleSelector } from './components/controls/ScaleSelector';
import { DegreeToggle } from './components/controls/DegreeToggle';
import { MaskControl } from './components/controls/MaskControl';

export default function App() {
  const rootIndex     = useFretboardStore(s => s.rootIndex);
  const activeDegrees = useFretboardStore(s => s.activeDegrees);
  const presetName    = useFretboardStore(s => s.presetName);
  const mask          = useFretboardStore(s => s.mask);

  const title = buildTitle(rootIndex, presetName, activeDegrees);

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      {/* ---- Top bar ---- */}
      <header className="bg-white border-b border-stone-200 px-4 py-2 flex items-center gap-3 print:hidden">
        <div className="text-[13px] font-bold tracking-wide text-[#b54a1f] border-2 border-[#b54a1f] px-2 py-0.5 rounded-sm flex-shrink-0">
          GST
        </div>
        <span className="text-stone-300 text-lg">|</span>
        <h1 className="text-[13px] font-semibold text-stone-600 tracking-tight">
          Guitar Scale Trainer
        </h1>
        <button
          onClick={() => window.print()}
          className="ml-auto text-[11px] font-semibold text-stone-500 border border-stone-300 bg-white px-3 py-1 rounded hover:bg-stone-50 hover:border-stone-400 transition-colors flex-shrink-0"
        >
          Print A4
        </button>
      </header>

      {/* ---- Control panel ---- */}
      <div className="bg-white border-b border-stone-200 px-5 py-4 flex flex-col gap-5 print:hidden">
        {/* Row 1: Key + Scale */}
        <div className="flex gap-8 items-start flex-wrap">
          <KeySelector />
          <div className="w-px self-stretch bg-stone-100" />
          <ScaleSelector />
        </div>
        {/* Row 2: Degrees + Mask */}
        <div className="flex gap-8 items-start flex-wrap border-t border-stone-100 pt-4">
          <DegreeToggle />
          <div className="w-px self-stretch bg-stone-100" />
          <MaskControl />
        </div>
      </div>

      {/* ---- Fretboard ---- */}
      <main className="flex-1 px-4 py-5">
        <h2 className="text-[19px] font-bold tracking-tight text-stone-800 mb-3">{title}</h2>
        <FretboardSvg
          rootIndex={rootIndex}
          activeDegrees={activeDegrees}
          mask={mask}
        />
        <Legend />
      </main>
    </div>
  );
}
