# セキュリティ方針

クラウド機能（Clerk 認証・D1・共有）追加に伴うセキュリティの集約ドキュメント。

---

## 1. セキュリティヘッダー（[public/_headers](../public/_headers)）

Cloudflare Pages が配信時に付与（GitHub Pages ミラーは無視）。

| ヘッダー | 値 | 目的 |
|---------|-----|------|
| `X-Content-Type-Options` | `nosniff` | MIME スニッフィング防止 |
| `X-Frame-Options` | `SAMEORIGIN` | クリックジャッキング防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラ漏洩抑制 |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` | 不要な権限は無効化。マイクはチューナー機能のため自オリジンのみ許可（camera/geolocation は無効のまま） |
| `Content-Security-Policy-Report-Only` | （下記） | XSS 緩和（まず観察モード） |

### CSP の段階導入（重要）

1. **Report-Only で配信**（現状）。何もブロックせず違反だけ報告 → 現行サイトを壊さない。
2. ブラウザコンソール / レポートで違反を観察し、必要ドメインを allowlist に反映。
3. 問題が無いことを確認したら `Content-Security-Policy`（強制）へ**昇格**。

許可している主なドメイン:
- GA4: `googletagmanager.com`（script）/ `google-analytics.com`（connect, img）
- Google Fonts: `fonts.googleapis.com`（style）/ `fonts.gstatic.com`（font）
- Google OAuth: `accounts.google.com`（frame）
- Clerk: `*.clerk.accounts.dev`（dev）ほか。**本番は `clerk.<独自ドメイン>` 等に変わる**

> ⚠️ Clerk 統合時は **Clerk 公式の CSP 要件**で allowlist を検証してから強制に切り替える。
> `script-src` に `'unsafe-inline'` を許しているのは index.html の GA4 インラインスニペットのため。
> 将来 nonce 化できれば `'unsafe-inline'` を外して強度を上げる。

---

## 2. レート制限

濫用・課金（D1 書き込み）対策。多層で防ぐ。

### 2.1 アプリ層（Pages Functions 内で実装）

| 対象 | 上限 |
|------|------|
| ソングブック数 / ユーザー | 50 |
| 1ソングブックのスケール数 | 200 |
| 有効な共有数 / ユーザー | 100 |

→ いずれも超過時に `400 limit_reached`。書き込み前にカウントで検査（`idx_*` を使用）。

### 2.2 エッジ層（Cloudflare Rate Limiting Rules・ダッシュボード設定）

書き込み系エンドポイントに IP ベースのレート制限を設定:

| ルール | 目安 |
|--------|------|
| `POST /api/shares` | 例: 10 req / min / IP |
| `POST /api/songbooks` | 例: 20 req / min / IP |
| `POST/PUT/DELETE /api/*`（全書き込み） | 例: 60 req / min / IP |

- 超過は Cloudflare が `429` を返す（アプリに届く前に遮断）。
- 公開 GET（`GET /api/shares/:id`）は読み取りなので緩めでよいが、極端な乱打のみ制限。
- 数値は運用開始後に実トラフィックを見て調整（headless では決められない）。

---

## 3. 認証・認可

- **JWT 検証**: 全保護 API で Clerk JWT を検証。未認証は `401`。
- **テナント分離**: マルチユーザー表は必ず `WHERE user_id = ?`。`user_id` は**認証情報から取得**し
  クライアント入力を信用しない（→ `db` スキル / [auth/ARCHITECTURE.md](auth/ARCHITECTURE.md)）。
- **所有権チェック**: 個別操作（songbook/share の取得・更新・削除）は `AND user_id = ?` を併用。
- **公開エンドポイント**: `GET /api/shares/:share_id` のみ認証不要。推測不能 ID + 失効で保護。

---

## 4. シークレット管理

- 秘密鍵（Clerk secret / webhook signing secret）は **`.dev.vars`（gitignore 済み）** と
  Cloudflare の環境変数に置く。**コード/リポジトリにハードコードしない**。
- `.dev.vars.example` はダミーのみ（GitHub のシークレットスキャンに引っかからない形）。
- 公開可能な publishable key と secret key を取り違えない。

---

## 5. 入力バリデーション

- 全 API 入力をサーバ側で検証（型・長さ・列挙値・上限）。異常は `400`。
- D1 は**プレースホルダ + bind** のみ（SQL 文字列連結禁止）。
- スナップショット JSON はサイズ/スケール数を検査。`JSON.parse` 失敗は `400`。

---

## 6. プライバシー / 退会

- 収集データ・保存先・削除手段は [legal/PRIVACY.md](legal/PRIVACY.md) に明記。
- 退会（`user.deleted` webhook）で D1 の該当 `user_id` を全テーブル物理削除
  （`songbooks` / `user_settings` / `shares`）→ [auth/API.md](auth/API.md)。

---

## 7. バックアップ / 復旧

- **D1 Time Travel**: D1 は直近（既定 30 日）への point-in-time 復元が標準。
  破壊的マイグレーション前後はこれで巻き戻せることを確認しておく（D1 はロールバック機能が無いため）。
