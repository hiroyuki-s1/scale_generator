# スケールジェネレータ (Scale Generator)

ギター指板上にスケールを可視化・印刷するWebアプリ。

https://hiroyuki-s1.github.io/scale_generator/

Jazz tension表記（R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7）で度数を表示。
キー・スケール/コードトーンを選択して指板にプロットし、A4印刷できる。

## Stack

- Vanilla HTML5 + ES2022 modules（フレームワークなし）
- Vite（ビルド / dev server）
- Vitest（ユニットテスト）
- GitHub Pages 自動デプロイ（`.github/workflows/deploy.yml`）

## Development

```bash
npm install
npm run dev      # dev server (port 5173)
npm run build    # dist/ 生成
npm run preview  # dist/ をローカル確認
npm test         # Vitest
npm run lint     # ESLint
```

## 仕様

[`specs/SPEC.md`](specs/SPEC.md) を参照。
