# スケールジェネレータ (Scale Generator)

ギター指板上にスケールを可視化・印刷するWebアプリ。
Jazz tension表記（R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7）で度数を表示。

## Stack
- React 18 + TypeScript (strict) + Vite
- Zustand / Tailwind CSS v4 / Tonal.js
- GitHub Pagesに自動デプロイ (`.github/workflows/deploy.yml`)

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # production build
npm run lint
```

## 仕様

実装仕様は [`specs/SPEC.md`](specs/SPEC.md) を参照。
リファレンス実装は [`demo/fretboard.html`](demo/fretboard.html)（vanilla HTML/JS）。
