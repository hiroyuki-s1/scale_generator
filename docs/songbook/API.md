# ソングブック API 仕様

## 共通

- **Base URL**: `/api/songbooks`
- **認証**: `Authorization: Bearer <Clerk JWT>` 必須（全エンドポイント）

---

## GET /api/songbooks
ログインユーザーのソングブック一覧を取得。

**レスポンス**
```json
{
  "songbooks": [
    {
      "id": 1,
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

## GET /api/songbooks/:id
特定のソングブックを取得（スケールデータ込み）。

**レスポンス**
```json
{
  "id": 1,
  "name": "Autumn Leaves",
  "scales": [...],
  "scale_count": 6,
  "created_at": 1234567890,
  "updated_at": 1234567890
}
```

---

## POST /api/songbooks
現在のソングファイルをソングブックとして保存。

**リクエスト**
```json
{
  "name": "Autumn Leaves",
  "scales": [...]
}
```

**レスポンス** `201 Created`
```json
{ "id": 42 }
```

---

## PUT /api/songbooks/:id
ソングブックを更新（名前変更 or スケール内容の上書き）。

**リクエスト**
```json
{
  "name": "Autumn Leaves 改",
  "scales": [...]
}
```

**レスポンス** `200 OK`
```json
{ "ok": true }
```

---

## DELETE /api/songbooks/:id
ソングブックを削除。

**レスポンス** `200 OK`
```json
{ "ok": true }
```
