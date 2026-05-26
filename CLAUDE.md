# Guitar Scale Trainer — Claude Code Instructions

## Tech Stack
- React 19 + TypeScript (strict) + Vite
- Capacitor (iOS / Android native wrapping)
- Zustand (state management)
- Tailwind CSS + shadcn/ui
- Tonal.js (music theory calculations)
- Vitest + Testing Library + Playwright

## Node Version
Always use Node 20+ (nvm: `~/.nvm/versions/node/v20.20.0`).
Use `PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH` prefix for npm/node commands.

## TypeScript Rules
- Strict mode always on — no `any`, no `as unknown`
- Use `type` over `interface` unless extending
- Immutable patterns: never mutate state in place

## Degree Notation (CRITICAL)
Use exactly this notation everywhere (jazz tension style):
```
R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7
```
Type definition: `type Degree = "R" | "b9" | "9" | "m3" | "M3" | "11" | "#11" | "P5" | "b13" | "13" | "m7" | "M7"`

Semitone mapping:
- R=0, b9=1, 9=2, m3=3, M3=4, 11=5, #11=6, P5=7, b13=8, 13=9, m7=10, M7=11

## Architecture Rules
- UI components MUST NOT call Tonal.js directly
- All music theory goes through `src/domain/ScaleService.ts`
- State lives in `src/store/` (Zustand)
- SVG fretboard rendering in `src/components/Fretboard/`

## Testing
- TDD: write tests first (RED → GREEN → REFACTOR)
- 80% coverage minimum
- Unit tests in `__tests__/` alongside source files

## File Size
- Max 400 lines per file; extract if larger
- One component per file
