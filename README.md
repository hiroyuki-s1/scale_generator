# 神スケールトレーナー (Kami Scale Trainer)

ギター/ベース指板上にスケール・コードを可視化・印刷するWebアプリ。

**🚀 https://kami-scale-trainer.org/** (本番)

- ミラー (GitHub Pages): https://hiroyuki-s1.github.io/scale_generator/

Jazz tension 表記（R, b9, 9, m3, M3, 11, #11, 5, b13, 13, m7, M7）で度数を表示。
ルート × スケール/コードを指板にプロット → 複数登録 → A4印刷。

## Stack

- Vanilla HTML5 + ES2022 modules（フレームワークなし、ランタイム依存ゼロ）
- Vite（ビルド / dev server）
- Vitest（ユニットテスト）
- ESLint

## Development

```bash
npm install
npm run dev      # dev server (port 5173)
npm run build    # dist/ 生成
npm run preview  # dist/ をローカル確認
npm test         # Vitest
npm run lint     # ESLint
```

## 本番デプロイ手順（手動）

> 本番は **Cloudflare Pages** でホスト。`main` への push は自動反映されない。
> テスト完了後に以下の手順で手動デプロイする。

1. **ローカルでビルド**
   ```bash
   npm run build
   ```

2. **Cloudflare ダッシュボード** → Workers & Pages → **「kami-scale-trainer」** を開く

3. 上部タブ **「Deployments」** をクリック

4. 右上 **「Create deployment」** をクリック

5. `dist/` フォルダをドラッグ＆ドロップ → **「Deploy site」**

デプロイ後、本番サイトのフッターにコミットハッシュが表示され、
最新コミットの番号と一致していれば反映完了。

詳細は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照。

## 仕様

[`specs/SPEC.md`](specs/SPEC.md) を参照。
