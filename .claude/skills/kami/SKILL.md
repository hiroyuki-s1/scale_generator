---
name: kami
description: 神スケールトレーナー(kami-scale-trainer)のクラウド機能 — Clerk認証 + Cloudflare Pages Functions + D1 + 曲共有 — の設計・実装・セットアップ・デプロイ・検証の運用ランブック。ログイン/ソングブック/共有を触る、staging/本番にデプロイする、D1やClerkを設定する、env/wranglerで詰まったときに使う。
---

# 神スケールトレーナー クラウド機能スキル

ギター/ベース指板スケール可視化アプリ「神スケールトレーナー」の **クラウド層**
（ログイン・ソングブック保存・曲共有）の設計と運用を1枚に凝縮したスキル。
どのAI/担当でもこのファイルだけで再現・継続できるようにしてある。

リポジトリ: `git@github.com:hiroyuki-s1/scale_generator.git`
（push は SSH 鍵: `GIT_SSH_COMMAND="ssh -i ~/.ssh/hiroyuki-s1 -o IdentitiesOnly=yes"`）
※ プロジェクトパス・nvm パスは担当マシン依存（例: Linux `/home/fig/ws/guitar_train`、Windows `c:\Users\natuk\ws\scale_generator`）。本ファイルのコマンドは Linux/nvm 例。

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
  └─ fetch /api/*  (Authorization: Bearer <Clerk JWT>・共有受取と行動ログは認証任意)
        Cloudflare Pages Functions (/functions/api/) … JWT を JWKS で検証・WHERE user_id=? で D1 アクセス
              Cloudflare D1 (SQLite) … migration 0001–0006
                ├ songbooks         ソングファイル(saved[])の名前付きスナップショット。public_id(UUID)で公開読取
                ├ user_settings     ユーザー設定(汎用JSON: layout / tunerTheme / tunerOffsets …)
                ├ shares            旧共有スナップショット（0003で90日失効を廃止・レガシー互換用に残存）
                ├ user_profiles     公開表示名(display_name・0005・コミュニティ用)
                ├ user_events       起動ログ(0004・匿名可・DAU/リテンション用の粗い粒度)
                └ analytics_events  行動ファネルログ(0006・⚠️一時的/後で消す前提の独立feature)
```

概念階層: **スケール(1枚) → ソングファイル(localStorage, 旧"登録スケール") → ソングブック(D1, ログイン時)**。

**共有モデルの転換（重要・migration 0003 で刷新）**:
- **現行**: ソングブックの `public_id`（`crypto.randomUUID`・122bit・推測不能）を**そのまま共有キー**にする
  unlisted リンク方式。共有 URL は `?share=<public_id>` 1本で、**ソングブックが存在する限り無期限**
  （論理削除 `deleted_at` で即停止）。**別途の「共有を作成」操作・期限・取り消しは不要**。受け取りは
  `GET /api/public/songbooks/:public_id`（認証不要・`user_id` は露出しない）。
- **旧**: `shares` テーブル（短い `share_id`・**90日失効**・所有者検証してスナップショット凍結複製）。
  0003 で失効を廃止し、共有キー自体も public_id 方式へ移行。旧 `?share=<短いID>` リンクは
  `getLegacyShare`/`GET /api/shares/:share_id` の**フォールバックで生かし続ける**（配布済みを壊さない）。

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

## 3. 現在のクラウド資産（2026-07-12 時点・実在）

| 資産 | 値 |
|------|----|
| 本番 D1 | `kami_db` / database_id `f6d363a6-92b6-405d-ab0f-36874b47f0ce`（wrangler.toml・binding `DB`）。**本番デプロイ時に手動で `--remote` 適用**（0001–0006 が反映済みかは Cloudflare 側で要確認）|
| staging D1 | `kami_db_staging` / database_id `3ab1441f-8d9b-4d6c-aa5c-5462173dcad1`（wrangler.staging.toml・**CI が push 毎に自動適用**）|
| staging Pages | プロジェクト `kami-scale-trainer-staging` → https://kami-scale-trainer-staging.pages.dev |
| 本番 Pages | プロジェクト `kami-scale-trainer` → 独自ドメイン `kami-scale-trainer.org`（手動デプロイ）|
| Clerk(dev) | Issuer `https://set-turkey-55.clerk.accounts.dev` / `pk_test_c2V0LXR1cmtleS01NS5jbGVyay5hY2NvdW50cy5kZXYk`（公開）。ローカル+staging が共有 |
| Clerk(prod) | **未作成**（本番デプロイ時に Production インスタンス有効化 → `pk_live_`）|

**D1 マイグレーション（migrations/・順に適用）**:
| # | ファイル | 内容 |
|---|---------|------|
| 0001 | `create_songbooks_and_settings` | `songbooks`(public_id・deleted_at論理削除・カバリング索引 `idx_songbooks_user_list`) + `user_settings`(1ユーザー1行の汎用JSON) |
| 0002 | `create_shares` | `shares`（旧共有・当初は expires_at 90日失効あり） |
| 0003 | `drop_share_expiry` | **shares の expires_at/失効を廃止**（テーブル再作成でカラム除去・共有は明示削除まで永続） |
| 0004 | `create_user_events` | `user_events`（起動ログ・user_id NULLABLE で匿名 anon_id 可・PII 無し） |
| 0005 | `create_user_profiles` | `user_profiles`（公開表示名・重複可・PK=user_id・コミュニティ投稿者名用） |
| 0006 | `create_analytics_events` | `analytics_events`（⚠️**一時的・後で消す前提の独立feature**・ファネル計測・削除手順は SQL 冒頭コメント） |

> `*.pages.dev` は Cloudflare が**無料で自動付与**するサブドメイン（プロジェクト名＝サブドメイン）。
> 独自ドメイン `kami-scale-trainer.org` は本番にのみ紐付けた購入ドメイン。

---

## 4. 主要ファイル

**サーバ (`functions/`)**
- `_lib/auth.js` … Clerk JWT を JWKS(RS256)で検証（`requireUserId`）。exp/iss 必須・JWKS TTL10分+kidミス再取得。`env.CLERK_ISSUER` を読む（SECRET は使わない）。
- `_lib/validation.js` … 入力検証。`MAX_NAME_LEN=100`・`MAX_DISPLAY_NAME_LEN=50`・`MAX_SCALES=200`・`MAX_SCALES_JSON_BYTES=500_000`・`MAX_SONGBOOKS=50`・`MAX_SHARES=100`。`validateName`/`validateDisplayName`/`validateScales`/`validateSongbookBody`/`validateShareBody`。`_lib/responses.js` … 401/403/400/404/429/500 の封筒。`_lib/ids.js` … share_id(棄却サンプリング)/public_id。`_lib/svix.js` … Webhook HMAC 検証。
- `api/public-config/index.js` … 公開設定(`{clerkPublishableKey}`)を配る。**フロントは pk をここから取得**（src にハードコードしない）。
- **保護API（要 requireUserId + `WHERE user_id=?` + placeholder bind）**: `api/songbooks/{index,[public_id]}.js` / `api/shares/{index,[share_id],mine}.js`(レガシー) / `api/settings/index.js`(GET/PUT upsert・汎用JSON) / `api/profile/index.js`(表示名 GET/PUT upsert・0005) / `api/webhooks/clerk.js`(user.deleted → songbooks/user_settings/shares/user_profiles を物理削除。**user_events/analytics_events は残す=匿名集計**)。
- **認証任意API**: `api/public/songbooks/[public_id].js`(共有受取・**認証不要**・deleted_at 有効行のみ・user_id 非露出) / `api/events/launch.js`(起動ログ→user_events) / `api/events/index.js`(汎用行動ログ→analytics_events・⚠️後で消す)。いずれも失敗しても `204`/安全側で返しユーザー体験を止めない。

**フロント (`src/`)**
- `state/cloudSync.js` … ClerkJS を CDN 動的読込・認証状態購読・`authedFetch`(Bearer付与・401再試行)・songbook CRUD・`getSharedSongbook`(public_id共有受取)/`getLegacyShare`(旧share_idフォールバック)・`getProfile`/`setProfile`・`getSettings`/`putSettings`/**`patchSettings`(get→merge→put の部分更新)**・`recordLaunch`(6h dedupe・匿名ID `sg.v1.anonId`)・`songfileToCloud`/`cloudToSongfile`(保存形式を localStorage と共用・版管理 "v")。
- `state/track.js` … 汎用行動ログ `track(type, props)`（fire-and-forget・`POST /api/events`・⚠️0006 と対で後で消す。呼び出しは main.js onSaved / shareModal / profileModal の3か所）。
- `state/tunerTheme.js` / `state/tunerOffsets.js` … **チューナー設定を localStorage 常時保存＋ログイン時 D1 同期**（`user_settings.settings.tunerTheme`/`.tunerOffsets` に `patchSettings` でマージ・`pull*`/`push*`）。既定テーマは `light`（本体と一体）。
- `domain/clerkPublishableKey.js` … pk → Frontend API ホスト導出(pure)。
- `ui/authButton.js`(ヘッダ ログイン/UserButton) / `ui/songbookTab.js`(3つ目タブ・保存/読込/削除・取り込みナッジ) / `ui/shareModal.js`(共有受取/管理・`?share=<public_id>`・X投稿ボタン) / `ui/profileModal.js`(初回ログイン後オンボーディングの表示名設定・0005)。
- `state/persist.js` の `snapshotForStorage`/`sanitizeStoredState` を cloudSync が再利用（Set⇄Array・色・visiblePositions も round-trip）。

> **クラウド非依存の新機能**（tuner/練習系。D1 とは tuner設定同期のみ接点）: `ui/tuner.js`・`domain/{pitch,polyphonic,noteDetect,strobe,tunings}.js`・`domain/dsp/`（低レイテンシ AudioWorklet ピッチ検出）／`ui/scaleTrainer.js`・`ui/scaleTrainGame.js`・`domain/{scalePractice,scaleGame}.js`・`audio/metronome.js`（スケール練習・テンポ同期ゲーム）。

**設定**: `wrangler.toml`(本番) / `wrangler.staging.toml`(staging) / `.dev.vars`(ローカル秘密・gitignore) / `.dev.vars.example`(テンプレ・`CLERK_ISSUER` 必須)。
**スキーマ**: `migrations/0001–0006`（§3 の表）。STRICT・CHECK・非部分カバリング索引。検証 `npm run test:db`(依存ゼロ python3・`scripts/validate_migrations.py`・0001–0006 を15セクションで検査)。

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
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH npm run test:db          # 0001–0006 の15セクションPASS確認
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
curl -s localhost:8788/api/public-config                                   # {"clerkPublishableKey":"pk_test_..."}
curl -s -o/dev/null -w "%{http_code}" localhost:8788/api/songbooks          # 401 (保護API)
curl -s -o/dev/null -w "%{http_code}" localhost:8788/api/profile            # 401 (保護API)
curl -s localhost:8788/api/public/songbooks/nope                           # 404 (認証不要の共有受取)
curl -s localhost:8788/api/shares/nope                                     # 404 (レガシー共有)
curl -s -o/dev/null -w "%{http_code}" -X POST localhost:8788/api/events/launch  # 204 (匿名で起動ログ)
```
ブラウザは **http://localhost:8788**（Vite の 5173 ではない）。

---

## 6. staging へのデプロイ（本番と完全分離）

**自動デプロイ（既定）**: `main` への push で `.github/workflows/staging.yml` が
`lint → test → build → d1 migrations apply(staging) → wrangler pages deploy` を実行し staging へ反映する
（wrangler は `cloudflare/wrangler-action@v3` 経由なので CI では Node バージョンを気にしなくてよい）。
要 GitHub シークレット: `CLOUDFLARE_API_TOKEN`（Account > Cloudflare Pages > Edit ＋
Account > D1 > Edit）・`CLOUDFLARE_ACCOUNT_ID`。**注意**: GH Actions は `GITHUB_ACTIONS=true`
を自動設定し vite が base を `/scale_generator/` にしてしまうため、staging ビルドだけ step env で
**`BASE_PATH: '/'`**（非予約の環境変数）を渡して base `/` を強制している。**D1 マイグレーションも staging 限定で
自動適用**（`d1 migrations apply kami_db_staging --remote --config wrangler.staging.toml` を deploy 前に実行・
追加が無ければ no-op）。`--config` で対象を staging DB に固定しているので**本番 (kami_db) には一切触れない**。
デプロイ直前に `cp wrangler.staging.toml wrangler.toml`（`pages deploy` が `--config` 非対応のため・CI は使い捨てなので復元不要）。

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
6. CSP(`public/_headers`) を Report-Only → 強制へ昇格。レート制限(Cloudflare WAF・特に**認証不要の公開 `GET /api/public/songbooks/:public_id`** とレガシー `GET /api/shares/:share_id`・`POST /api/events*`)を設定。
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
- **共有は public_id 方式へ移行済み（0003）**: 現行はソングブックの `public_id` をそのまま共有キーにする無期限 unlisted リンク（`?share=<public_id>`・別途の作成/期限/取消し操作なし）。旧 `POST /api/shares`(`{songbook_id}` を送りサーバが所有者検証してスナップショット凍結複製) と短い share_id はレガシー互換で残すだけ。**expires_at/90日失効は廃止**（`shares` テーブルからカラムごと除去）。
- **Pages Functions は Cron 不可** → だが共有は無期限化したので TTL 遅延クリーンアップも不要になった。論理削除 `deleted_at IS NULL` の判定で共有停止を即時反映する（GET が 404）。user_events の間引きが要るなら月1で `wrangler d1 execute`。
- **user_settings は汎用JSON**（layout / tunerTheme / tunerOffsets …）。追加キーは**必ず `patchSettings`（get→merge→put）で部分更新**し他キーを消さない。`putSettings` は全置換なので注意。
- **行動ログ2系統は別物**: `POST /api/events/launch`→`user_events`(起動粒度・恒久) と `POST /api/events`→`analytics_events`(ファネル・**⚠️後で消す前提**・削除手順は 0006 SQL 冒頭)。どちらも 204 固定でアプリを止めない。PII は入れない。
- **退会Webhookは user_events/analytics_events を消さない**（匿名集計として残す設計）。songbooks/user_settings/shares/user_profiles のみ物理削除。

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
