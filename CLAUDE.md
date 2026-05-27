# スケールジェネレータ — Claude Code Instructions

## Tech Stack
- Vanilla HTML5 + ES2022 modules (no framework)
- Vite (dev server / production build)
- Vitest (unit testing, Node environment)
- ESLint (code quality)
- GitHub Pages deployment

## Node Version
Always use Node 20+ (nvm: `~/.nvm/versions/node/v20.20.0`).
Use `PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH` prefix for npm/node commands.

## JavaScript Rules
- Pure ES modules everywhere (`export` / `import`)
- No TypeScript — plain JS with JSDoc annotations where helpful
- Immutable patterns: never mutate state in place
- No external runtime dependencies (no Tonal.js, no React, no frameworks)

## Degree Notation (CRITICAL)
Use exactly this notation everywhere (jazz tension style):
```
R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7
```
Semitone mapping: R=0, b9=1, 9=2, m3=3, M3=4, 11=5, #11=6, P5=7, b13=8, 13=9, m7=10, M7=11

## Architecture Rules

**Module dependency direction:**
```
ui/* → state/store + domain/*
domain/* → (pure, no DOM, no deps)
state/* → domain/* (optional)
main.js → orchestrates all
```

- `domain/*` — pure functions only, no DOM/window/document (testable in Node)
- `ui/*` — DOM manipulation; must not import other `ui/*` directly (use store)
- `state/store.js` — minimal pub/sub store (get/set/subscribe)
- `state/persist.js` — localStorage read/write with debounce

**Key files:**
- `index.html` — markup only, no inline scripts
- `src/main.js` — entry point, initializes all UI modules
- `src/domain/constants.js` — NOTES, DEGREES, PRESETS, SVG dimensions
- `src/domain/fretboard.js` — `computeFretNotes()`, `diffFretNotes()`
- `src/ui/fretboardSvg.js` — SVG rendering, diff-apply, mask overlay
- `src/styles/main.css` — all screen styles
- `src/print/printCss.js` — dynamic @page CSS generation

## Testing
- TDD: write tests first (RED → GREEN → REFACTOR)
- Unit tests in `__tests__/domain/` — domain layer only (pure functions)
- 90%+ coverage on `src/domain/**`
- Run: `npm test` (vitest run), `npm run test:watch`

## File Size
- Max 400 lines per file; extract if larger
- One concern per file

## Commands
```bash
npm run dev      # Vite dev server (port 5173)
npm run build    # dist/ production build
npm run preview  # serve dist/ locally
npm test         # Vitest once
npm run lint     # ESLint
```
