# 曲共有機能（ソングファイル共有） 仕様書

## 1. 概要

保存済みソングブック（＝ソングファイルのスナップショット）を **URL / 短いID** で他人に渡せる機能。
受け取った人はブラウザでURLを開くか、アプリ内でIDを貼り付けて読み込む。

- **作成**: ログイン必須。**ソングブックタブの各行（1曲ずつ）の「共有」ボタン**から
- **受け取り**: ログイン不要。**右上「…」→「IDから読み込み」** または 共有URL を開く
- **中身**: ソングブックの凍結スナップショット（度数色・異弦同音の表示ポジションも含む）
- **有効期限**: 自動失効（既定 90 日）

> 共有はソングブック単位。共有したいソングファイルは先にソングブックとして保存しておく。
> 「現在編集中のソングファイルを直接共有」はしない（保存 → 共有 の順に統一してシンプルに）。

---

## 2. 用語

| 用語 | 説明 |
|------|------|
| 共有 (share) | ソングファイルの読み取り専用スナップショットを D1 に保存したもの |
| share_id | 共有を指す短い公開ID（URL安全・推測不能・例 `k7Qm2x...`） |
| 共有URL | `https://kami-scale-trainer.org/?share=<share_id>` |

---

## 3. UI フロー

### 3.1 作成（ソングブックタブの各行「共有」ボタン）

ソングブック一覧の各カードに「共有」ボタンを追加（→ [songbook/SPEC.md](../songbook/SPEC.md)）。

```
┌─────────────────────────────────────────┐
│ 🎵 Autumn Leaves            [共有] ─ 🗑 │
│    6スケール  最終更新 06/01 14:32        │
└─────────────────────────────────────────┘
        │ 「共有」をタップ
        ↓
そのソングブックのスナップショットから share_id 発行（POST /api/shares）
        ↓
共有モーダル表示:
  ┌─────────────────────────────────────┐
  │ "Autumn Leaves" を共有          [ × ] │
  ├─────────────────────────────────────┤
  │ URL: https://….org/?share=k7Qm2x…  [コピー] │
  │ ID:  k7Qm2x…                        [コピー] │
  │                                              │
  │ ※ このリンクは90日後に失効します            │
  └─────────────────────────────────────┘
```

- 共有はそのソングブックの**スナップショットを別途複製**（以後ソングブックを編集しても
  既に発行した共有は変わらない＝凍結）。
- URL と ID の両方を表示し、それぞれにコピー ボタン。失効日を明示。
- ソングブックタブはログイン時のみ表示なので、作成は実質ログイン必須が保証される。

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

### 3.3 共有の管理・取り消し（右上「…」→「共有を管理」／ログイン時）

自分が作成した有効な共有を一覧し、不要なものを取り消す。

```
┌─────────────────────────────────────────┐
│ 共有を管理                          [ × ] │
├─────────────────────────────────────────┤
│ Autumn Leaves   残り83日   [取り消し]    │
│ Blue Bossa      残り12日   [取り消し]    │
└─────────────────────────────────────────┘
```

- `GET /api/shares/mine` で一覧。各行に失効までの残り日数と「取り消し」ボタン。
- 「取り消し」→ 確認 → `DELETE /api/shares/:share_id` → 一覧から除去（以後その URL/ID は 404）。
- 誤共有・限定共有を 90日 を待たず撤回できる。

---

## 4. DB スキーマ

マイグレーション `migrations/0002_create_shares.sql`。

```sql
CREATE TABLE shares (
  id             INTEGER PRIMARY KEY,
  share_id       TEXT    NOT NULL UNIQUE,    -- 公開ID（推測不能の短い文字列）
  user_id        TEXT    NOT NULL,           -- 作成者 Clerk user ID（作成はログイン必須）
  name           TEXT    NOT NULL,           -- 表示名（共有元ソングブック名のコピー・「自分の共有一覧」用）
  scales         TEXT    NOT NULL,           -- JSON snapshot（songbooks.scales と同形式・"v"内包）
  schema_version INTEGER NOT NULL DEFAULT 1,
  scale_count    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,           -- 自動失効（created_at + 90日）
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (length(name) BETWEEN 1 AND 100),
  CHECK (expires_at > created_at)
) STRICT;

CREATE INDEX idx_shares_expires ON shares (expires_at);          -- 期限切れバッチ削除用
CREATE INDEX idx_shares_user    ON shares (user_id, expires_at); -- 作成上限チェック・自分の共有一覧用
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

ソングブックを指定して共有を作成する。サーバはそのソングブック（**所有者一致**を検証）の
スナップショットを `shares` に複製する。クライアントは scales 本体を再送しない。

**リクエスト**
```json
{ "songbook_id": "<songbook の public_id>" }
```
- サーバ処理: `SELECT name, scales, scale_count, schema_version FROM songbooks
  WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL` で取得 →
  `name`（共有元の名前）ごとコピーし、新しい `share_id` と `expires_at`(=now+90日) で `shares` に INSERT
- 1ユーザーの有効な共有数が上限（既定 100）に達していれば 400

**レスポンス** `201 Created`
```json
{
  "share_id": "k7Qm2xR9pT",
  "url": "https://kami-scale-trainer.org/?share=k7Qm2xR9pT",
  "expires_at": 1730000000000
}
```

| HTTP | 例 |
|------|----|
| 404 | 指定 `songbook_id` が存在しない/削除済み |
| 403 | 他ユーザーのソングブックを指定 |

### GET /api/shares/mine （自分の共有一覧・**認証必須**）

ログインユーザーが作成した**有効な**共有の一覧（取り消し画面用）。

**レスポンス** `200`
```json
{
  "shares": [
    { "share_id": "k7Qm2xR9pT", "name": "Autumn Leaves", "scale_count": 6,
      "created_at": 1722000000000, "expires_at": 1730000000000 }
  ]
}
```
- `WHERE user_id = ? AND expires_at > now ORDER BY created_at DESC`（`idx_shares_user` 使用）
- `scales` 本体は返さない（一覧では不要）

### DELETE /api/shares/:share_id （取り消し・**認証必須**）

自分が作成した共有を**即時失効（物理削除）**する。

- `DELETE FROM shares WHERE share_id = ? AND user_id = ?`（他人の共有は消せない）
- 取り消し後はその share_id の GET は 404 になる

**レスポンス** `200 OK`
```json
{ "ok": true }
```
| HTTP | 例 |
|------|----|
| 404 | 自分の共有に該当 share_id が無い（既に失効/他人のもの） |

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
| 作成（ソングブックタブはログイン時のみ表示なので未ログインでは到達しない） | — |
| 作成対象のソングブックが直前に削除された | 404 → トースト「ソングブックが見つかりません」。一覧を再取得 |
| 作成API失敗 | トースト「共有の作成に失敗しました」。リトライ可 |
| 受け取り: 不正/失効ID | 「この共有は存在しないか、有効期限が切れています」 |
| 受け取り: 取得成功前にローカルを消さない | GET 成功を確定してから localStorage 展開（途中失敗でデータ喪失しない） |
| `?share=` が不正形式 | 無視してURLパラメータを除去・通常起動 |
| オフライン | 「オフラインです」を表示し送信/取得しない |

---

## 7. 受け入れ条件

| # | 条件 |
|---|------|
| AC-01 | ソングブックタブの各行に「共有」ボタンがある |
| AC-02 | 右上「…」に「IDから読み込み」がある |
| AC-03 | 「共有」で URL と ID が表示され、各コピーボタンで写せる |
| AC-04 | 共有モーダルに失効日（90日後）が表示される |
| AC-05 | 共有URLを開くと確認ダイアログ後にソングファイルが読み込まれる |
| AC-06 | IDを貼り付けても同様に読み込める |
| AC-07 | 受け取りはログイン不要 |
| AC-08 | 失効/不正IDはエラー表示され、現在のソングファイルは保持される |
| AC-09 | 読み込んだソングファイルに度数色・異弦同音の表示ポジションが反映される |
| AC-10 | 共有後に元ソングブックを編集しても、発行済み共有の内容は変わらない（凍結） |
| AC-11 | 「共有を管理」で自分の有効な共有が一覧表示される |
| AC-12 | 「取り消し」で共有が即失効し、その URL/ID は 404 になる |
