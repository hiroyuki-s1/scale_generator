# ソングブック API 仕様

## 共通

- **Base URL**: `/api/songbooks`
- **認証**: `Authorization: Bearer <Clerk JWT>` 必須（全エンドポイント）
- **実体**: Cloudflare Pages Functions（`/functions/api/songbooks/`）が D1 バインディング `env.DB` 経由で読み書き
- **ID**: 外部に出すのは `public_id`（推測不能ID）。内部連番 `id` は API に出さない
- **テナント分離**: 全クエリで `WHERE user_id = ?`（Clerk 認証から取得・クライアント入力を信用しない）
- **論理削除**: 一覧・取得は `deleted_at IS NULL` のみ対象

### エラー形式

```json
{ "error": "<code>", "message": "<人間向け説明>" }
```

| HTTP | error | 例 |
|------|-------|----|
| 401 | `unauthorized` | JWT 無効/期限切れ |
| 403 | `forbidden` | 他ユーザーの public_id を操作 |
| 400 | `invalid_body` | 必須欠落・JSON不正・名前長超過・上限超過 |
| 404 | `not_found` | 存在しない/削除済み public_id |
| 429 | `rate_limited` | レート制限 |
| 500 | `internal` | サーバ内部エラー（詳細はログのみ） |

---

## GET /api/songbooks
ログインユーザーのソングブック一覧を取得（有効な行のみ・更新日時の新しい順）。

**レスポンス** `200`
```json
{
  "songbooks": [
    {
      "public_id": "b1f0c2…",
      "name": "Autumn Leaves",
      "scale_count": 6,
      "created_at": 1234567890,
      "updated_at": 1234567890
    }
  ]
}
```
※ 一覧では `scales`（大きいJSON）は返さない。

---

## GET /api/songbooks/:public_id
特定のソングブックを取得（スケールデータ込み）。

**レスポンス** `200`
```json
{
  "public_id": "b1f0c2…",
  "name": "Autumn Leaves",
  "scales": { "v": 1, "scales": [ ... ] },
  "schema_version": 1,
  "scale_count": 6,
  "created_at": 1234567890,
  "updated_at": 1234567890
}
```

---

## POST /api/songbooks
現在のソングファイルをソングブックとして保存。`public_id` はサーバ側で生成。

**リクエスト**
```json
{
  "name": "Autumn Leaves",
  "scales": { "v": 1, "scales": [ ... ] }
}
```
- `name`: 1〜100文字（超過は 400）
- `scales`: JSON。`v` を含む。スケール数が上限（200）超過で 400
- ソングブック数が上限（50）に達していれば 400

**レスポンス** `201 Created`
```json
{ "public_id": "b1f0c2…" }
```

---

## PUT /api/songbooks/:public_id
ソングブックを更新（名前変更 or スケール内容の上書き）。`updated_at` を更新。

**リクエスト**
```json
{
  "name": "Autumn Leaves 改",
  "scales": { "v": 1, "scales": [ ... ] }
}
```

**レスポンス** `200 OK`
```json
{ "ok": true }
```

---

## DELETE /api/songbooks/:public_id
ソングブックを削除（論理削除: `deleted_at` を設定）。

**レスポンス** `200 OK`
```json
{ "ok": true }
```
