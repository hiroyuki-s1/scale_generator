# 曲共有機能（ソングファイル共有） 仕様書

## 1. 概要

現在のソングファイルを **URL / 短いID** で他人に渡せる機能。受け取った人は
ブラウザでURLを開くか、アプリ内でIDを貼り付けて読み込む。

- **作成**: ログイン必須（右上「…」→「共有」）
- **受け取り**: ログイン不要（URL or ID から誰でも読み込める）
- **中身**: ソングファイルの凍結スナップショット（度数色・異弦同音の表示/非表示も含む）
- **有効期限**: 自動失効（既定 90 日）

---

## 2. 用語

| 用語 | 説明 |
|------|------|
| 共有 (share) | ソングファイルの読み取り専用スナップショットを D1 に保存したもの |
| share_id | 共有を指す短い公開ID（URL安全・推測不能・例 `k7Qm2x...`） |
| 共有URL | `https://kami-scale-trainer.org/?share=<share_id>` |

---

## 3. UI フロー

### 3.1 作成（右上「…」→「共有」）

```
「共有」をタップ（ログイン必須。未ログインならログインを促す）
    ↓
現在のソングファイルを D1 に保存 → share_id 発行
    ↓
共有モーダル表示:
  ┌─────────────────────────────────────┐
  │ ソングファイルを共有            [ × ] │
  ├─────────────────────────────────────┤
  │ URL: https://….org/?share=k7Qm2x…  [コピー] │
  │ ID:  k7Qm2x…                        [コピー] │
  │                                              │
  │ ※ このリンクは90日後に失効します            │
  └─────────────────────────────────────┘
```

- URL と ID の両方を表示し、それぞれにコピー ボタン
- 失効日を明示

### 3.2 受け取り（2通り）

**(a) URL アクセス**
```
ブラウザで ?share=<id> を開く
    ↓
アプリ起動時に share パラメータを検出 → GET /api/shares/:id
    ↓
確認ダイアログ（データ消失警告）:
「共有されたソングファイルを読み込みます。
 現在編集中のソングファイルは上書きされます。よろしいですか？」
    ↓
OK → localStorage に展開 → ソングファイルタブへ
キャンセル → 何もしない（URLパラメータは消す）
```

**(b) ID から読み込み（右上「…」→「IDから読み込み」）**
```
「IDから読み込み」をタップ → ID入力フィールド
    ↓
share_id を貼り付け → 「読み込み」
    ↓
GET /api/shares/:id → 同じ確認ダイアログ → 読み込み
```

⚠️ どちらも**現在のソングファイルを失う破壊的操作**のため確認ダイアログ必須。

---

## 4. DB スキーマ

マイグレーション `migrations/0002_create_shares.sql`。

```sql
CREATE TABLE shares (
  id             INTEGER PRIMARY KEY,
  share_id       TEXT    NOT NULL UNIQUE,    -- 公開ID（推測不能の短い文字列）
  user_id        TEXT    NOT NULL,           -- 作成者 Clerk user ID（作成はログイン必須）
  scales         TEXT    NOT NULL,           -- JSON snapshot（songbooks.scales と同形式・"v"内包）
  schema_version INTEGER NOT NULL DEFAULT 1,
  scale_count    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,           -- 自動失効（created_at + 90日）
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (expires_at > created_at)
) STRICT;

CREATE INDEX idx_shares_expires ON shares (expires_at);          -- 期限切れバッチ削除用
CREATE INDEX idx_shares_user    ON shares (user_id, expires_at); -- 作成上限チェック用
```

`scales` の JSON 構造は [songbook/SCHEMA.md](../songbook/SCHEMA.md) と同一
（`degree_colors` 12要素・`visible_positions`（表示する `g{fret}s{string}` の集合 or null）を含む）。

### share_id の生成

- **サーバ側（Pages Function）で生成**。`crypto.getRandomValues` で URL安全・
  手入力しやすい文字種（曖昧な `0/O/I/l` を除いた base58 系）から 10 桁程度。
- UNIQUE 衝突時は再生成（確率は天文学的に低いが念のためリトライ）。
- 連番 `id` は外部に出さない。

---

## 5. API

### POST /api/shares （作成・**認証必須**）

**リクエスト**
```json
{ "scales": { "v": 1, "scales": [ ... ] } }
```
- `scales`: 現在のソングファイルのスナップショット。スケール数上限 200（超過 400）
- 1ユーザーの有効な共有数が上限（既定 100）に達していれば 400

**レスポンス** `201 Created`
```json
{
  "share_id": "k7Qm2xR9pT",
  "url": "https://kami-scale-trainer.org/?share=k7Qm2xR9pT",
  "expires_at": 1730000000000
}
```

### GET /api/shares/:share_id （受け取り・**認証不要・公開**）

**レスポンス** `200`
```json
{
  "share_id": "k7Qm2xR9pT",
  "scales": { "v": 1, "scales": [ ... ] },
  "schema_version": 1,
  "scale_count": 6,
  "created_at": 1722000000000,
  "expires_at": 1730000000000
}
```
- 期限切れ（`expires_at <= now`）は **404**（存在しないものとして扱う）
- 読み取り専用。`scales` 本体を返す

| HTTP | error | 例 |
|------|-------|----|
| 401 | `unauthorized` | 作成時に未認証 |
| 400 | `invalid_body` / `limit_reached` / `too_large` | JSON不正・作成上限・スケール超過 |
| 404 | `not_found` | 不正/失効した share_id |
| 429 | `rate_limited` | 作成のレート制限 |
| 500 | `internal` | サーバ内部エラー |

### 期限切れのクリーンアップ

- GET は `expires_at <= now` を即 **404** にするので、削除が遅れても期限切れデータは露出しない
  （＝遅延クリーンアップで安全）。
- 物理削除は `DELETE FROM shares WHERE expires_at < ?`（`idx_shares_expires` を使用）。
  **注意**: 本プロジェクトは **Pages** で、Pages Functions は Cron Triggers を持てない。
  定期削除は次のいずれか:
  1. 同じ D1 をバインドした**別の小さな Worker（cron trigger 付き）**を1本立てる、
  2. もしくは当面は**遅延クリーンアップのみ**（GET の 404 で安全）にして、容量が増えたら 1 を追加。
  小さな共有が90日で自然減衰するため、初期は 2 で十分。

---

## 6. 例外処理（→ [EXCEPTION_HANDLING.md](./EXCEPTION_HANDLING.md) §共有 に集約）

| ケース | 挙動 |
|--------|------|
| 作成時に未ログイン | 共有ボタンでログインを促す（モーダル）。ローカル機能は継続 |
| 作成API失敗 | トースト「共有の作成に失敗しました」。リトライ可 |
| 受け取り: 不正/失効ID | 「この共有は存在しないか、有効期限が切れています」 |
| 受け取り: 取得成功前にローカルを消さない | GET 成功を確定してから localStorage 展開（途中失敗でデータ喪失しない） |
| `?share=` が不正形式 | 無視してURLパラメータを除去・通常起動 |
| オフライン | 「オフラインです」を表示し送信/取得しない |

---

## 7. 受け入れ条件

| # | 条件 |
|---|------|
| AC-01 | 右上「…」に「共有」「IDから読み込み」がある |
| AC-02 | 未ログインで共有を押すとログインを促される |
| AC-03 | 共有作成で URL と ID が表示され、各コピーボタンで写せる |
| AC-04 | 共有モーダルに失効日（90日後）が表示される |
| AC-05 | 共有URLを開くと確認ダイアログ後にソングファイルが読み込まれる |
| AC-06 | IDを貼り付けても同様に読み込める |
| AC-07 | 受け取りはログイン不要 |
| AC-08 | 失効/不正IDはエラー表示され、現在のソングファイルは保持される |
| AC-09 | 読み込んだソングファイルに度数色・異弦同音の表示/非表示が反映される |
