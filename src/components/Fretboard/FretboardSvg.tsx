import { useMemo } from 'react';
import { computeFretNotes } from '../../domain/ScaleService';
import { DEGREE_INFO, STRING_LABELS, FRET_START, FRET_END } from '../../domain/constants';
import type { DegreeIndex, FretNote, MaskRange } from '../../domain/types';

// ---- SVG layout constants ----
const SVG_W  = 940;
const SVG_H  = 240;
const ML = 52, MT = 22, MR = 12, MB = 44;
const BOARD_W = SVG_W - ML - MR;
const BOARD_H = SVG_H - MT - MB;
const FRET_W  = BOARD_W / (FRET_END - FRET_START + 1);
const STR_H   = BOARD_H / 5;
const CR      = 13;

const noteX = (f: number) => ML + (f - FRET_START) * FRET_W + FRET_W / 2;
const noteY = (s: number) => MT + s * STR_H;

// ---- Sub-components ----
function FretboardBody() {
  return (
    <>
      <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="#fff" />
      <rect x={ML} y={MT} width={BOARD_W} height={BOARD_H}
        fill="#fdf6e3" stroke="#d4b896" strokeWidth={1.5} rx={3} />
    </>
  );
}

function InlayDots() {
  return (
    <>
      {[3, 5, 7, 9].map(f => (
        <circle key={f} cx={noteX(f)} cy={MT + BOARD_H / 2} r={5} fill="#e8d5b0" />
      ))}
      {[MT + BOARD_H / 3, MT + BOARD_H * 2 / 3].map((cy, i) => (
        <circle key={i} cx={noteX(12)} cy={cy} r={5} fill="#e8d5b0" />
      ))}
    </>
  );
}

function Nut() {
  return <rect x={ML - 4} y={MT} width={5} height={BOARD_H} fill="#c8b898" rx={1} />;
}

function FretLines() {
  return (
    <>
      {Array.from({ length: FRET_END - FRET_START + 2 }, (_, i) => i + FRET_START).map(f => {
        const x = ML + (f - FRET_START) * FRET_W;
        return (
          <line key={f} x1={x} y1={MT} x2={x} y2={MT + BOARD_H}
            stroke={f === 12 ? '#9c7a50' : '#c4a870'}
            strokeWidth={f === 12 ? 2.5 : 1} />
        );
      })}
    </>
  );
}

function FretLabels() {
  return (
    <>
      {[3, 5, 7, 9, 12, 15].filter(f => f >= FRET_START && f <= FRET_END).map(f => (
        <g key={f}>
          <text x={noteX(f)} y={MT + BOARD_H + 18}
            textAnchor="middle" fill="#999" fontSize={11} fontFamily="monospace">
            {f}
          </text>
          <circle cx={noteX(f)} cy={MT + BOARD_H + 30} r={4}
            fill={f === 12 ? '#aaa' : '#bbb'} />
        </g>
      ))}
      {/* double dot at 12 */}
      {[-5, 5].map((dx, i) => (
        <circle key={i} cx={noteX(12) + dx} cy={MT + BOARD_H + 30} r={4} fill="#bbb" />
      ))}
    </>
  );
}

function Strings() {
  return (
    <>
      {STRING_LABELS.map((label, s) => {
        const y = noteY(s);
        const thick = 0.7 + s * 0.45;
        const gray  = Math.round(140 + s * 10);
        return (
          <g key={s}>
            <line x1={ML} y1={y} x2={ML + BOARD_W} y2={y}
              stroke={`rgb(${gray},${gray},${gray})`} strokeWidth={thick} />
            <text x={ML - 6} y={y + 4}
              textAnchor="end" fill="#aaa" fontSize={10} fontFamily="monospace">
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
}

function NoteCircle({ note }: { note: FretNote }) {
  const cx   = noteX(note.fret);
  const cy   = noteY(note.string);
  const info = DEGREE_INFO[note.degree];
  const name = info.name;
  const isRoot = note.degree === 0;

  const fontSize = name.length >= 4 ? 9 : name.length === 1 ? 17 : 13;

  return (
    <g>
      {/* drop shadow */}
      <circle cx={cx + 1} cy={cy + 1.5} r={CR} fill="rgba(0,0,0,0.08)" />
      {/* body */}
      <circle cx={cx} cy={cy} r={CR}
        fill={info.color.fill}
        stroke={info.color.stroke}
        strokeWidth={isRoot ? 2.5 : 1.8} />
      {/* root ring */}
      {isRoot && (
        <circle cx={cx} cy={cy} r={CR - 3.5}
          fill="none" stroke={info.color.stroke} strokeWidth={1} opacity={0.5} />
      )}
      {/* label */}
      <text x={cx} y={cy + 4.5}
        textAnchor="middle"
        fill={info.color.text}
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="'Courier New', monospace">
        {name}
      </text>
    </g>
  );
}

function MaskOverlay({ mask }: { mask: MaskRange }) {
  if (!mask.enabled) return null;
  const rangeX = ML + (mask.min - FRET_START) * FRET_W;
  const rangeW = (mask.max - mask.min + 1) * FRET_W;
  return (
    <>
      {mask.min > FRET_START && (
        <rect x={ML} y={MT}
          width={(mask.min - FRET_START) * FRET_W} height={BOARD_H}
          fill="rgba(200,200,200,0.70)" />
      )}
      {mask.max < FRET_END && (
        <rect x={ML + (mask.max - FRET_START + 1) * FRET_W} y={MT}
          width={(FRET_END - mask.max) * FRET_W} height={BOARD_H}
          fill="rgba(200,200,200,0.70)" />
      )}
      <rect x={rangeX} y={MT - 2} width={rangeW} height={BOARD_H + 4}
        fill="none" stroke="#6d28d9" strokeWidth={2.5} rx={3} />
    </>
  );
}

// ---- Main component ----
interface FretboardSvgProps {
  readonly rootIndex: number;
  readonly activeDegrees: ReadonlySet<DegreeIndex>;
  readonly mask: MaskRange;
}

export function FretboardSvg({ rootIndex, activeDegrees, mask }: FretboardSvgProps) {
  const notes = useMemo(
    () => computeFretNotes(rootIndex, activeDegrees),
    [rootIndex, activeDegrees],
  );

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <FretboardBody />
      <InlayDots />
      <Nut />
      <FretLines />
      <FretLabels />
      <Strings />
      {notes.map((note, i) => <NoteCircle key={i} note={note} />)}
      <MaskOverlay mask={mask} />
    </svg>
  );
}
