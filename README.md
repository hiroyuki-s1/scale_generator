# 神スケールトレーナー (Kami Scale Trainer)

ギター/ベース指板上にスケールを可視化・印刷するWebアプリ。

**🚀 https://kami-scale-trainer.org/** (本番 / カスタムドメイン)

- Vercel 直アクセス: https://kami-scale-trainer.vercel.app/
- ミラー (GitHub Pages): https://hiroyuki-s1.github.io/scale_generator/

Jazz tension表記（R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7）で度数を表示。
キー × スケール/コードを指板にプロット → 複数登録 → A4印刷。

## Stack

- Vanilla HTML5 + ES2022 modules（フレームワークなし、依存ゼロ）
- Vite（ビルド / dev server）
- Vitest（ユニットテスト）
- 自動デプロイ:
  - Vercel（`main` push で本番更新）
  - GitHub Pages（`.github/workflows/deploy.yml`）

base path は環境変数で自動切替（[vite.config.js](vite.config.js)）。

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
