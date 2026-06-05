# 実装引き継ぎ手順書（神スケールトレーナー / クラウド機能）

このドキュメントは、**仕様（md）から実装を行う担当（人/AI）向けの単一エントリポイント**。
ここから読み始め、リンク先の各仕様 md に従って実装する。

> 現状: **仕様（md）と D1 マイグレーションは完成・検証済み。アプリ実装コードは未着手。**
> `functions/api/*`・認証 UI・各機能の実装はこれから。

---

## 0. まず最初に読むもの（順番）

1. **[/CLAUDE.md](../CLAUDE.md)** — プロジェクト憲法（**最重要**）。技術スタック・度数表記・
   アーキテクチャルール・印刷の地雷・デプロイ運用。**ここの制約は絶対**。
2. **本ファイル（HANDOVER.md）** — 全体像・読む順・実装フェーズ。
3. **[docs/auth/ARCHITECTURE.md](auth/ARCHITECTURE.md)** — クラウド構成（Clerk + Pages Functions + D1）と
   ローカル開発手順、段階的実装フェーズ。
4. 以降、実装する機能の仕様 md（§3 のリスト）。

---

## 1. 絶対に守る制約（CLAUDE.md の要約・違反厳禁）

- **ランタイム依存ゼロ（src/）**: フレームワーク/外部ライブラリを入れない（Tonal.js/React等も不可）。
  Pure ES2022 modules + Vanilla。Vite/Vitest/ESLint は開発ツールなのでOK。
  ※ サーバ側 `functions/`（Pages Functions）は別レイヤーで、Clerk SDK 等のサーバ依存は許容。
- **TypeScript 不使用**: plain JS + JSDoc。
- **不変パターン**: state を破壊的変更しない。store は必ず新オブジェクトを返す。
- **度数表記（厳守）**: `R, b9, 9, m3, M3, 11, #11, 5, b13, 13, m7, M7`。
  一次ソースは [src/config.js](../src/config.js) の `DEGREE_NAMES`。`activeDegrees` は度数インデックス(0–11)の Set。
- **アーキ方向**: `ui/* → store + domain/* + config`。`domain/*` は DOM 非依存（Node でテスト可）。
  **ui/* 同士の直接 import 禁止**（store 経由）。
- **Node 20+**: `PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH` を前置。
- **デプロイは手動**: push≠本番反映。本番は人間が Cloudflare で手動デプロイ。
  push 後に「本番反映済み」と報告しない（[docs/DEPLOYMENT.md](DEPLOYMENT.md)）。
- **ファイルサイズ**: 1ファイル 400行目安・最大800。多数の小ファイル > 少数の大ファイル。
- **TDD**: domain/state/print/config の pure 層は Vitest 先行。`npm test`。

---

## 2. アーキテクチャ全体像

```
ブラウザ（Vanilla JS, PWA）
  ├─ Clerk JS SDK（Google + メール/パスワード認証）
  └─ fetch /api/*
        Cloudflare Pages Functions（/functions/api/）  ← JWT検証・D1アクセス
              Cloudflare D1（SQLite）
                ├ songbooks       （ソングブック=ソングファイルのスナップショット）
                ├ user_settings   （ユーザー設定）
                └ shares          （共有スナップショット・90日失効）
        + Clerk Webhook（/api/webhooks/clerk）→ 退会時 D1 掃除
```

概念階層: **スケール(1枚) → ソングファイル(localStorage, 旧"登録スケール") → ソングブック(D1, ログイン時)**。
共有は「保存済みソングブックを1つ公開リンク化」。

---

## 3. 出力した md 一覧（どれを見るべきか）

### 3.1 入口・全体
| ファイル | 内容 |
|---------|------|
| [/CLAUDE.md](../CLAUDE.md) | プロジェクト憲法（最重要・最初に読む） |
| [docs/HANDOVER.md](HANDOVER.md) | 本ファイル |
| [docs/DEPLOYMENT.md](DEPLOYMENT.md) | デプロイ手順（本番は手動） |
| [docs/SECURITY.md](SECURITY.md) | CSP/レート制限/認可/シークレット/バックアップ |

### 3.2 認証・クラウド基盤（Clerk + D1）
| ファイル | 内容 |
|---------|------|
| [docs/auth/ARCHITECTURE.md](auth/ARCHITECTURE.md) | 構成図・データフロー・ファイル構成・**段階的実装フェーズ**・ローカル開発(wrangler) |
| [docs/auth/SPEC.md](auth/SPEC.md) | 認証 UI 要件・**パスワード再設定/アカウント削除(退会)**・法務リンク・受け入れ条件 |
| [docs/auth/API.md](auth/API.md) | API 一覧・エラー形式・**Clerk Webhook(退会クリーンアップ)**。※`/api/scales`系は旧設計(参考) |
| [docs/auth/SCHEMA.md](auth/SCHEMA.md) | D1 スキーマ全体像。※`scales`テーブルは旧設計(現行不採用)・`user_settings`が現行 |

### 3.3 ソングブック（D1 保存）
| ファイル | 内容 |
|---------|------|
| [docs/songbook/SPEC.md](songbook/SPEC.md) | タブ構成・一覧UI・保存/読込フロー(確認ダイアログ)・編集中プレビュー・制限・共有ボタン |
| [docs/songbook/SCHEMA.md](songbook/SCHEMA.md) | **`songbooks`テーブル**・**scales JSON の構造と版管理("v")**・度数色/表示ポジション |
| [docs/songbook/API.md](songbook/API.md) | `/api/songbooks` の GET/POST/PUT/DELETE・public_id・テナント分離 |

### 3.4 機能仕様（features/）
| ファイル | 内容 |
|---------|------|
| [docs/features/SHARE.md](features/SHARE.md) | **曲共有**: ソングブック行の共有ボタン→URL/ID発行、IDから読込、共有管理(取消/一覧)、`shares`テーブル、API |
| [docs/features/DEGREE_COLORS.md](features/DEGREE_COLORS.md) | 度数色をスケールごと個別+一括反映、UIをエディターへ |
| [docs/features/POSITION_VISIBILITY.md](features/POSITION_VISIBILITY.md) | 異弦同音の**表示ポジション**(`visiblePositions`)・更新ルール(プリセット選択で再構築 等) |
| [docs/features/IMAGE_EXPORT.md](features/IMAGE_EXPORT.md) | **PNG画像出力**(個別/一括)・SVG→Canvas→PNG・ゼロ依存 |
| [docs/features/RELEASE_NOTES.md](features/RELEASE_NOTES.md) | リリースノート表示・`public/release-notes.json` |
| [docs/features/EXCEPTION_HANDLING.md](features/EXCEPTION_HANDLING.md) | **全機能横断の例外処理方針**（実装時の必読） |

### 3.5 法務（公開前に運営者情報記入＋法務確認が必須）
| ファイル | 内容 |
|---------|------|
| [docs/legal/PRIVACY.md](legal/PRIVACY.md) | プライバシーポリシー（ドラフト） |
| [docs/legal/TERMS.md](legal/TERMS.md) | 利用規約（ドラフト） |

### 3.6 音楽理論（参考・既存）
| ファイル | 内容 |
|---------|------|
| [docs/theory/README.md](theory/README.md) ほか 01〜05 | 度数表記・スケール・CAGED・ジャズ理論・指板（ドメイン知識） |

### 3.7 実験（製品コードと隔離・未実装の検証用）
| ファイル | 内容 |
|---------|------|
| [experiments/README.md](../experiments/README.md) | 技術検証フォルダの憲章（src と隔離） |
| [experiments/note-detection/README.md](../experiments/note-detection/README.md) | 実験01: 単音ピッチ検出の検証計画（コード未着手） |

---

## 4. 実装フェーズ（推奨ビルド順）

> 各機能の AC（受け入れ条件）は対応 md の末尾にある。実装は **pure層→UI→API** の順、TDD で。

### MVP-0: ローカル完結（Clerk/D1 不要・すぐ着手可）
- **画像出力**（[IMAGE_EXPORT.md](features/IMAGE_EXPORT.md)）: ソングファイル各カードに「画像」+ 上部「一括出力」。
- **度数色のスケール別+一括反映**（[DEGREE_COLORS.md](features/DEGREE_COLORS.md)）。
- **表示ポジション**（[POSITION_VISIBILITY.md](features/POSITION_VISIBILITY.md)）。
- **リリースノート**（[RELEASE_NOTES.md](features/RELEASE_NOTES.md)）。
- ※ これらは localStorage/クライアント完結。`src/` 内で完結。

### Phase 1: D1 セットアップ（基盤）— **マイグレーションは作成済み**
1. `npx wrangler d1 create kami_db` → 出力の `database_id` を [wrangler.toml](../wrangler.toml) に記入（現在プレースホルダ）。
2. ローカル適用: `npx wrangler d1 migrations apply kami_db --local`。
3. 検証: `npm run test:db`（[scripts/validate_migrations.py](../scripts/validate_migrations.py)）。

### Phase 2: Clerk セットアップ（認証）
- Clerk dev インスタンス作成、**Google + メール/パスワード**を有効化。
- `.dev.vars`（[.dev.vars.example](../.dev.vars.example) をコピー）に dev キー記入。
- Clerk プリビルト `<SignIn>/<SignUp>/<UserProfile>` を使う（フォーム自作しない）。
- Dashboard でアカウント削除(self-service)を有効化、Webhook(`user.deleted`)を登録。

### Phase 3: Pages Functions API（CRUD）
実装する関数（[auth/ARCHITECTURE.md](auth/ARCHITECTURE.md) §5 + 各API md）:
- `/functions/api/songbooks/{index.js,[public_id].js}` — [songbook/API.md](songbook/API.md)
- `/functions/api/shares/{index.js,[share_id].js,mine.js}` — [SHARE.md](features/SHARE.md)
- `/functions/api/settings/index.js` — [auth/API.md](auth/API.md)
- `/functions/api/webhooks/clerk.js` — 退会クリーンアップ([auth/API.md](auth/API.md))
- **必須**: 全保護APIで JWT 検証、`WHERE user_id = ?`、プレースホルダbind、入力検証。

### Phase 4: フロント UI
- 認証ボタン/モーダル、ソングブックタブ、共有ボタン/モーダル/管理、ID読込（…メニュー）。

### Phase 5: 同期・移行
- localStorage ↔ D1、未ログイン→ログイン時のインポート確認。

### Phase 6: 拡散・差別化（任意・別途仕様化）
- 共有の活用、デイリーチャレンジ、練習モード（実験01の検証後）。

---

## 5. 状態と TODO（未完了・要対応）

| 項目 | 状態 |
|------|------|
| 仕様 md・D1 マイグレーション(0001,0002) | ✅ 完成・sqlite3 で検証済(37項目PASS) |
| **MVP-0 ローカル4機能**（画像出力/度数色個別化/表示ポジション/リリースノート） | ✅ **実装・検証済**（Vitest + Chromium/WebKit ブラウザ確認）|
| Functions API（functions/api + _lib） | 🟡 **スキャフォールド済**（pure 層 Vitest 済・JWT/WHERE user_id/bind/検証 実装）。実 Clerk/D1 で結合テスト要 |
| 認証 UI / フロント連携 (Phase 4-5) | ⛔ 未着手（Clerk セットアップ後） |
| レート制限 / CORS（Cloudflare WAF・`public/_headers`） | ⚠️ デプロイ前に設定（コードでは未強制） |
| `wrangler.toml` の `database_id` | ⚠️ プレースホルダ。`wrangler d1 create` 後に記入 |
| `.dev.vars` | ⚠️ 未作成。Clerk dev キーを記入（gitignore 済） |
| 法務 md（運営者情報・法務確認） | ⚠️ ドラフト。公開前に記入＋確認 |
| CSP（[public/_headers](../public/_headers)） | ⚠️ Report-Only。Clerk統合後に検証→強制へ昇格 |
| レート制限の具体値 | ⚠️ 運用後に実トラフィックで調整 |
| 練習モード/チューナー | 💡 実験01の検証後に仕様化（[experiments/note-detection](../experiments/note-detection/README.md)） |

---

## 6. 主要な決定事項（経緯・前提）

- **インフラ: Cloudflare D1 + Clerk**（Supabase不採用。D1は$5/月固定でアプリ数非依存）。
- **ログイン: Google + メール/パスワード**。Clerk プリビルトUIを使用（フォーム自作なし）。
  パスワード再設定は Clerk 標準、退会は Clerk self-service + Webhook で D1 掃除。
- **ソングブック=スナップショット方式**: スケール個別を D1 に正規化せず、ソングファイル丸ごとを
  `scales` JSON(TEXT) で保存（旧 `scales` テーブル設計は不採用）。
- **共有=ソングブック単位**: ソングブックタブの各行「共有」ボタンから。受け取りは「…→IDから読み込み」or URL。
  作成ログイン必須/受け取り公開、**90日自動失効**、取り消し可。
- **表示ポジション(`visiblePositions`)**: 「非表示の差分」ではなく**表示する位置を明示**
  （カスタムスケールで「大半は表示」前提が崩れるため）。プリセット選択で全再構築、度数トグルで増減。
- **D1スキーマは拡張性重視**: STRICT・CHECK・`public_id`(共有用)・`schema_version`(JSON版管理)・
  `deleted_at`(論理削除)・カバリングインデックス。

## 7. 検証で判明した重要な技術知見（踏襲すること）

- **SQLite(3.37系)は部分索引をカバリングにしない** → 一覧は `deleted_at` を索引キーに入れた
  **非部分のカバリングインデックス**にしてある（[songbook/SCHEMA.md](songbook/SCHEMA.md)）。
  新しい索引/クエリは `EXPLAIN QUERY PLAN` で `USING COVERING INDEX` を確認すること。
- **マイグレーション検証**: `npm run test:db`（依存ゼロの python3 sqlite3）。新マイグレーション追加時は
  [scripts/validate_migrations.py](../scripts/validate_migrations.py) にアサートを足す。D1 にロールバックは無い
  （打ち消しマイグレーションを足す前方運用）。
- **画像出力/印刷のフォント**: canvas/SVG 経由でWebフォントが乗らないことがある→実機確認必須。
- **印刷の改ページ・予約量は実機(特にiOS)でしか詰められない**（[/CLAUDE.md](../CLAUDE.md) の印刷節）。

---

## 8. 開発コマンド

```bash
PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH   # 前置必須
npm run dev      # Vite dev（UI開発）
npm run build    # dist/ 本番ビルド
npm test         # Vitest（pure層）
npm run test:db  # D1マイグレーション検証（python3 sqlite3）
npm run lint     # ESLint（src __tests__）
# クラウドAPIのローカル実行（Functions + ローカルD1）:
npx wrangler pages dev -- npm run dev
npx wrangler d1 migrations apply kami_db --local
```

## 9. リポジトリ / デプロイ

- リポジトリ: `git@github.com:hiroyuki-s1/scale_generator.git`（push は SSH 鍵
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/hiroyuki-s1 -o IdentitiesOnly=yes"`）。
- 本番: Cloudflare Pages プロジェクト `kami-scale-trainer`（**手動デプロイ**）。
- ミラー: GitHub Pages（`.github/workflows/deploy.yml` で自動）。
- **push＝本番反映ではない**。本番公開は人間が Cloudflare で手動デプロイした時のみ。
