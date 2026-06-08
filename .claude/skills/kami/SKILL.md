---
name: kami
description: 神スケールトレーナー(kami-scale-trainer)のクラウド機能 — Clerk認証 + Cloudflare Pages Functions + D1 + 曲共有 — の設計・実装・セットアップ・デプロイ・検証の運用ランブック。ログイン/ソングブック/共有を触る、staging/本番にデプロイする、D1やClerkを設定する、env/wranglerで詰まったときに使う。
---

# 神スケールトレーナー クラウド機能スキル

ギター/ベース指板スケール可視化アプリ「神スケールトレーナー」の **クラウド層**
（ログイン・ソングブック保存・曲共有）の設計と運用を1枚に凝縮したスキル。
どのAI/担当でもこのファイルだけで再現・継続できるようにしてある。

リポジトリ: `git@github.com:hiroyuki-s1/scale_generator.git` / プロジェクトパス: `/home/fig/ws/guitar_train`
（push は SSH 鍵: `GIT_SSH_COMMAND="ssh -i ~/.ssh/hiroyuki-s1 -o IdentitiesOnly=yes"`）

---

## 0. 最初に読む（絶対制約）

- **[/CLAUDE.md](../../../CLAUDE.md) がプロジェクト憲法**。技術スタック・度数表記・印刷の地雷・デプロイ運用はそこが一次ソース。
- **src/ はランタイム依存ゼロ**（フレームワーク/ライブラリ禁止・Vanilla ES2022）。**ただし `functions/`（サーバ）は別レイヤーで Clerk 等のサーバ依存は可**。Clerk JS SDK はフロントでも **npm せず CDN 動的読込**で入れる（src を import フリーに保つ）。
- **TypeScript 不使用**（plain JS + JSDoc）。**不変パターン**（store は新オブジェクトを返す）。
- **度数表記厳守**: `R, b9, 9, m3, M3, 11, #11, 5, b13, 13, m7, M7`。
- **push ≠ 本番反映**。本番 Cloudflare は人間が手動デプロイした時だけ反映。

---

## 1. アーキテクチャ全体像

```
ブラウザ(Vanilla JS, PWA)
  ├─ Clerk JS SDK（CDN動的読込・Google/FB/X/メール）
  └─ fetch /api/*  (Authorization: Bearer <Clerk JWT>)
        Cloudflare Pages Functions (/functions/api/) … JWT を JWKS で検証・WHERE user_id=? で D1 アクセス
              Cloudflare D1 (SQLite)
                ├ songbooks      ソングファイル(saved[])の名前付きスナップショット
                ├ user_settings  ユーザー設定
                └ shares         公開共有スナップショット(90日失効)
```

概念階層: **スケール(1枚) → ソングファイル(localStorage, 旧"登録スケール") → ソングブック(D1, ログイン時)**。
共有は「保存済みソングブックを1つ公開リンク化」（凍結スナップショット）。

### 3層の実行環境（超重要・混同しやすい）

| 環境 | バックエンド(/api) | ログイン/ソングブック/共有 | 用途 |
|------|------|------|------|
| **GitHub Pages**（ミラー・静的のみ・base `/scale_generator/`） | ❌ 無い | ❌ **原理的に動かない**（「ログイン利用不可」は正常な劣化） | ローカル完結機能(MVP-0)の確認のみ |
| **ローカル `wrangler pages dev`** | ✅ | ✅ | 日常の開発・検証 |
| **Cloudflare Pages**（staging / 本番・base `/`） | ✅ | ✅ | 実機・スマホ・共有リンク検証 / 公開 |

→ **クラウド機能は GitHub Pages では検証できない**。必ず `wrangler pages dev` か Cloudflare 上で。

---

## 2. Node バージョンの罠（必ず守る）

- アプリのビルド/テスト/lint = **Node 20**: `PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH` 前置。
- **wrangler は Node ≥22 が必要**（プロジェクト常用の v20 では動かない）→ `wrangler login` / `d1` / `pages dev` / `pages deploy` は **Node 23** で: `PATH=~/.nvm/versions/node/v23.3.0/bin:$PATH`。
- Bash ツールのデフォルトシェルは古い Node(v12) を拾うことがある → **必ず PATH を前置**。

---

## 3. 現在のクラウド資産（2026-06-05 時点・実在）

| 資産 | 値 |
|------|----|
| 本番 D1 | `kami_db` / database_id `f6d363a6-92b6-405d-ab0f-36874b47f0ce`（wrangler.toml・binding `DB`）。**リモートはスキーマ未適用**（本番デプロイ時に `--remote`）|
| staging D1 | `kami_db_staging` / database_id `3ab1441f-8d9b-4d6c-aa5c-5462173dcad1`（wrangler.staging.toml・リモート適用済み）|
| staging Pages | プロジェクト `kami-scale-trainer-staging` → https://kami-scale-trainer-staging.pages.dev |
| 本番 Pages | プロジェクト `kami-scale-trainer` → 独自ドメイン `kami-scale-trainer.org`（手動デプロイ）|
| Clerk(dev) | Issuer `https://set-turkey-55.clerk.accounts.dev` / `pk_test_…`（公開）。ローカル+staging が共有 |
| Clerk(prod) | **未作成**（本番デプロイ時に Production インスタンス有効化 → `pk_live_`）|

> `*.pages.dev` は Cloudflare が**無料で自動付与**するサブドメイン（プロジェクト名＝サブドメイン）。
> 独自ドメイン `kami-scale-trainer.org` は本番にのみ紐付けた購入ドメイン。

---

## 4. 主要ファイル

**サーバ (`functions/`)**
- `_lib/auth.js` … Clerk JWT を JWKS(RS256)で検証（`requireUserId`）。exp/iss 必須・JWKS TTL10分+kidミス再取得。`env.CLERK_ISSUER` を読む（SECRET は使わない）。
- `_lib/validation.js` … 入力検証（名前1-100・scales≤200・JSON≤500KB）。`_lib/responses.js` … 401/403/400/404/429/500 の封筒。`_lib/ids.js` … share_id(棄却サンプリング)/public_id。`_lib/svix.js` … Webhook HMAC 検証。
- `api/public-config/index.js` … 公開設定(`{clerkPublishableKey}`)を配る。**フロントは pk をここから取得**（src にハードコードしない）。
- `api/songbooks/{index,[public_id]}.js` / `api/shares/{index,[share_id],mine}.js` / `api/settings/index.js` / `api/webhooks/clerk.js`。**全保護APIで requireUserId + `WHERE user_id=?` + placeholder bind**。

**フロント (`src/`)**
- `state/cloudSync.js` … ClerkJS を CDN 動的読込・認証状態購読・`authedFetch`(Bearer付与・401再試行)・songbook/share CRUD・`songfileToCloud`/`cloudToSongfile`(保存形式を localStorage と共用・版管理 "v")。
- `domain/clerkPublishableKey.js` … pk → Frontend API ホスト導出(pure)。
- `ui/authButton.js`(ヘッダ ログイン/UserButton) / `ui/songbookTab.js`(3つ目タブ・保存/読込/削除・取り込みナッジ) / `ui/shareModal.js`(共有作成/受け取り/管理・`?share=`) / `ui/editPreview.js`(SPEC §6 編集中プレビュー)。
- `state/persist.js` の `snapshotForStorage`/`sanitizeStoredState` を cloudSync が再利用（Set⇄Array・色・visiblePositions も round-trip）。

**設定**: `wrangler.toml`(本番) / `wrangler.staging.toml`(staging) / `.dev.vars`(ローカル秘密・gitignore) / `.dev.vars.example`(テンプレ・`CLERK_ISSUER` 必須)。
**スキーマ**: `migrations/0001_*.sql`(songbooks,user_settings) `0002_*.sql`(shares)。STRICT・CHECK・非部分カバリング索引。検証 `npm run test:db`(依存ゼロ python3・37項目)。

---

## 5. セットアップ手順（ゼロから / 新環境）

### 5.1 Cloudflare D1
```bash
N23=~/.nvm/versions/node/v23.3.0/bin
PATH=$N23:$PATH npx wrangler login                       # ブラウザでOAuth
PATH=$N23:$PATH npx wrangler d1 create <db_name>          # 出力 database_id を wrangler.toml に記入(binding は DB のまま)
PATH=$N23:$PATH npx wrangler d1 migrations apply <db_name> --local    # ローカル
# リモート(staging/本番)は --remote。wrangler.toml に無いDBは --config <file> で指定:
PATH=$N23:$PATH npx wrangler d1 migrations apply <db_name> --remote --config wrangler.staging.toml
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run test:db          # 37項目PASS確認
```

### 5.2 Clerk（dev インスタンス）
1. https://dashboard.clerk.com でアプリ作成。Sign-in options で Google / メール+パスワード（必要なら FB/X）を有効化。Username は不要。
2. **Configure → API Keys** から `Publishable key`(`pk_test_`) と **Frontend API URL(=Issuer)** を控える。Secret は `.dev.vars` に直接。
3. `.dev.vars` を作成（gitignore 済み）。**JWKS検証なので最低限必要なのは `CLERK_ISSUER`**:
   ```
   CLERK_ISSUER=https://<slug>.clerk.accounts.dev
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...                # 現状コードは未使用・将来用
   CLERK_WEBHOOK_SIGNING_SECRET=whsec_...      # 退会Webhook(本番時)
   ```
4. ⚠️ Clerk は **Next.js 等のクイックスタートに乗らない**（このアプリは Vanilla）。キーを取るだけ。

### 5.3 ローカル起動 & API スモークテスト
```bash
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run build
PATH=~/.nvm/versions/node/v23.3.0/bin:$PATH npx wrangler pages dev dist --port 8788 --compatibility-date=2025-01-01
# 別シェルで:
curl -s localhost:8788/api/public-config         # {"clerkPublishableKey":"pk_test_..."}
curl -s -o/dev/null -w "%{http_code}" localhost:8788/api/songbooks   # 401
curl -s localhost:8788/api/shares/nope            # 404
```
ブラウザは **http://localhost:8788**（Vite の 5173 ではない）。

---

## 6. staging へのデプロイ（本番と完全分離）

**自動デプロイ（既定）**: `main` への push で `.github/workflows/staging.yml` が
`lint → test → build(base '/') → wrangler pages deploy` を実行し staging へ反映する。
要 GitHub シークレット: `CLOUDFLARE_API_TOKEN`（Account > Cloudflare Pages > Edit）・
`CLOUDFLARE_ACCOUNT_ID`。**注意**: GH Actions は `GITHUB_ACTIONS=true` を自動設定し
vite が base を `/scale_generator/` にしてしまうため、staging ビルドだけ step env で
`GITHUB_ACTIONS: ''` にして base `/` を強制している。D1 マイグレーションは自動化していない
（必要時のみ §5 の `--config wrangler.staging.toml --remote` を手動実行）。本番には一切触れない。

**手動デプロイ（CI を使わない場合）。ハマりどころ: `wrangler pages deploy` は `--config` 非対応。** デプロイ時だけ `wrangler.toml` を staging 内容に一時差替え→**必ず復元**する:

```bash
N23=~/.nvm/versions/node/v23.3.0/bin
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run build      # GITHUB_ACTIONS 未設定 → base '/'
cp wrangler.toml /tmp/p.toml && cp wrangler.staging.toml wrangler.toml
PATH=$N23:$PATH npx wrangler pages deploy dist --project-name kami-scale-trainer-staging --branch main --commit-dirty=true
cp /tmp/p.toml wrangler.toml      # ★本番configを必ず戻す（最重要）
```
`wrangler.staging.toml` は binding `DB`→`kami_db_staging` と `[vars]`(CLERK_ISSUER, CLERK_PUBLISHABLE_KEY=どちらも公開)を持つ。Pages プロジェクトは `wrangler pages project create kami-scale-trainer-staging` で作成済み。

検証: `curl https://kami-scale-trainer-staging.pages.dev/api/public-config` 等。Playwright で `window.Clerk` ロード・「ログイン」表示・コンソールエラー0 を確認。

---

## 7. 本番デプロイ（手動・人間が実施／AIは代行しない）

CLAUDE.md / docs/DEPLOYMENT.md に従う。要点:
1. **本番 D1 にスキーマ適用**: `wrangler d1 migrations apply kami_db --remote`（本番configで）。
2. **Clerk Production インスタンスを有効化** → `kami-scale-trainer.org` に Clerk 指定の DNS(CNAME) 追加 → `pk_live_`/`sk_live_` と本番 Issuer(`clerk.kami-scale-trainer.org`)を取得。**本番で `pk_test_`(dev)を使わない**（混在防止の唯一の鍵）。
3. ソーシャルログインは**本番では自前 OAuth アプリ登録が必要**（Google Cloud / Meta / X）。dev は Clerk 共有資格情報なので本番不可。
4. 本番 Pages プロジェクト(`kami-scale-trainer`)の env に `CLERK_ISSUER`(prod)・`CLERK_PUBLISHABLE_KEY`(pk_live_)・必要なら `CLERK_SECRET_KEY`・`CLERK_WEBHOOK_SIGNING_SECRET` を設定。D1 binding `DB`→`kami_db`。
5. Clerk Webhook(`user.deleted`) を `https://kami-scale-trainer.org/api/webhooks/clerk` に登録（Signing Secret を env へ）。
6. CSP(`public/_headers`) を Report-Only → 強制へ昇格。レート制限(Cloudflare WAF・特に公開 `GET /api/shares/:id`)を設定。
7. Cloudflare ダッシュボードで**手動 Deploy**。

### dev と prod が混ざらない理由（質問頻出）
dev/prod は**別 Clerk インスタンス=別ユーザープール=別 user_id**。さらに D1 も別(`kami_db_staging` vs `kami_db`)。二重に隔離。**唯一の事故は本番に dev キーを挿すこと**だけ。

---

## 8. 検証方針

- **pure 層は Vitest**（`__tests__/domain|state|print|config|functions`）。DOM/D1非依存のロジック(検証/サニタイズ/Set⇄Array/JWT分解/Svix HMAC など)を網羅。`npm test`。
- **API 分岐**は `wrangler pages dev` + curl で 401/403/400/404 を確認（実トークンの200はログイン必須=実ブラウザ or staging）。
- **DOM/canvas/Clerk** は Playwright(headless, chromium/webkit)で起動・主要要素・コンソールエラー0 を確認。Clerk CDN はネット到達可なら headless でもロードする。
- D1 索引は `EXPLAIN QUERY PLAN` で `USING COVERING INDEX` を確認。

---

## 9. このプロジェクトで踏んだ罠（再発防止）

- **GitHub Pages でログイン不可は正常**（Functions が無い）。クラウド機能は wrangler/Cloudflare で検証。
- **wrangler は Node≥22**。v20 だと "requires at least Node.js v22"。
- **`wrangler pages deploy` は `--config` 不可** → wrangler.toml 一時差替え+復元。
- **pk から Frontend API を導出**: `pk_(test|live)_<base64("host$")>` → `atob` して末尾 `$` を除去（`domain/clerkPublishableKey.js`）。
- **publishable key は単一ソース化**: `.dev.vars`/Pages vars に置き `/api/public-config` で配る（src にハードコードしない＝依存ゼロ維持）。
- **読込/受け取りは破壊的** → 確認ダイアログ + 取得成功確定後にローカル展開（途中失敗でデータ喪失しない）。
- **共有は `{songbook_id}` だけ送る**（サーバが所有者検証してスナップショット複製＝凍結。クライアントは scales 再送しない）。
- **Pages Functions は Cron 不可** → 共有の期限切れは GET 側 `expires_at<=now → 404` の遅延クリーンアップで安全。

---

## 10. コマンド早見表

```bash
# 通常開発(Node20)
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run dev      # Vite(UIのみ・/apiは無い)
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run build    # dist/
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm test         # Vitest
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run lint
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run test:db  # D1 migration 検証

# クラウド(Node23・要 wrangler login)
PATH=~/.nvm/versions/node/v23.3.0/bin:$PATH npx wrangler pages dev dist --port 8788 --compatibility-date=2025-01-01
PATH=~/.nvm/versions/node/v23.3.0/bin:$PATH npx wrangler d1 migrations apply <db> --remote --config wrangler.staging.toml
# staging deploy は §6 の差替え手順
```
