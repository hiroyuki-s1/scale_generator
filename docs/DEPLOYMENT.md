# デプロイ手順（本番公開ランブック）

> **このドキュメントの目的**
> 本番環境はクライアントに提供するため、**AIや人の誤操作で開発中のコードが
> 本番に出る事故を防ぐ**。そのため本番デプロイは「手動トリガー」にする。
>
> **AI（Claude等）への重要な指示:**
> - `main` への push やマージ＝本番反映ではない。**本番公開は人間が
>   Cloudflare ダッシュボードで手動デプロイした時だけ**起きる。
> - コードを push しても「本番に反映されました」と報告してはいけない。
>   「本番に出すには Cloudflare で手動デプロイが必要」と案内すること。
> - このファイルの手順を勝手に実行しない（ダッシュボード操作は人間が行う）。

## 本番ホスティング

- **本番**: Cloudflare Pages プロジェクト `kami-scale-trainer` → https://kami-scale-trainer.org/
- **ミラー**: GitHub Pages（`.github/workflows/deploy.yml`、こちらは自動）

---

## ① 初回セットアップ（自動デプロイをオフにする） — 一度だけ

> ステータス: **実施済み**。

Cloudflare の自動デプロイ（`main` push で即公開）を止めて、手動公開に切り替える：

1. Cloudflare → **Workers & Pages** → `kami-scale-trainer` → **Settings**
2. **Builds & deployments** → **Branch control**（自動デプロイの項目）
3. **Automatic deployments を無効化**（production branch の自動ビルドをオフ）

→ これ以降、`main` が更新されても本番には自動反映されなくなる。

---

## ② 毎回の本番公開手順（手動デプロイ）

本番に出したくなったら：

1. ローカルでビルド
   ```bash
   npm run build
   ```
2. Cloudflare → **Workers & Pages** → `kami-scale-trainer` → **Deployments** タブ
3. 右上 **「Create deployment」** をクリック
4. `dist/` フォルダをドラッグ＆ドロップ → **「Deploy site」**
5. 本番サイトのフッターのハッシュが最新コミットと一致していれば反映完了

---

## 全体フロー

```
開発・コミット・push
   ↓
（main にマージ）        ← ここではまだ本番に出ない
   ↓
Cloudflare で手動デプロイ ← ここで初めて本番反映（人間の操作）
```

「コードが main に入ること」と「本番に出ること」を分離しているのがポイント。

---

## ビルド設定（参考）

- Build command: `npm run build`
- Output directory: `dist`
- Node version: `.node-version`（= 20）
- 環境変数 `GITHUB_ACTIONS` は設定不要（未設定 → `base: '/'` が適用される）
