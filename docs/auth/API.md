# API 仕様

## 共通

- **Base URL**: `/api`
- **認証**: `Authorization: Bearer <Clerk JWT>` ヘッダー必須（全エンドポイント）
- **Content-Type**: `application/json`
- **エラーレスポンス**:

```json
{ "error": "エラーメッセージ" }
```

| ステータス | 意味 |
|-----------|------|
| 401 | 未認証（JWT なし or 無効） |
| 403 | 他ユーザーのリソースへのアクセス |
| 400 | バリデーションエラー |
| 404 | リソースが見つからない |
| 500 | サーバーエラー |

---

## スケール

### GET /api/scales
ログインユーザーの全スケールを取得。

**レスポンス**
```json
{
  "scales": [
    {
      "id": 1,
      "title": "C メジャーペンタ",
      "root_index": 0,
      "active_degrees": [0, 2, 4, 7, 9],
      "preset_name": "Major Penta",
      "mode": "scale",
      "mask": { "enabled": false, "min": 0, "max": 21 },
      "degree_colors": [...],
      "instrument": "guitar",
      "sort_order": 0,
      "created_at": 1234567890,
      "updated_at": 1234567890
    }
  ]
}
```

---

### POST /api/scales
スケールを新規登録。

**リクエスト**
```json
{
  "title": "C メジャーペンタ",
  "root_index": 0,
  "active_degrees": [0, 2, 4, 7, 9],
  "preset_name": "Major Penta",
  "mode": "scale",
  "mask": { "enabled": false, "min": 0, "max": 21 },
  "degree_colors": [...],
  "instrument": "guitar"
}
```

**レスポンス** `201 Created`
```json
{ "id": 42 }
```

---

### PUT /api/scales/:id
スケールを更新（タイトル・内容）。

**リクエスト**: POST と同形式（全フィールド）

**レスポンス** `200 OK`
```json
{ "ok": true }
```

---

### DELETE /api/scales/:id
スケールを削除。

**レスポンス** `200 OK`
```json
{ "ok": true }
```

---

### PUT /api/scales/reorder
並び替え（sort_order を一括更新）。

**リクエスト**
```json
{
  "order": [3, 1, 4, 2]
}
```
（スケール ID の配列。先頭が sort_order=0）

**レスポンス** `200 OK`
```json
{ "ok": true }
```

---

### POST /api/scales/import
localStorage のスケールを D1 に一括インポート。

**リクエスト**
```json
{
  "scales": [ ...POST /api/scales と同形式の配列... ]
}
```

**レスポンス** `200 OK`
```json
{ "imported": 4 }
```

---

## 設定

### GET /api/settings
ユーザーの印刷レイアウト設定を取得。

**レスポンス**
```json
{
  "layout": {
    "orientation": "landscape",
    "cols": 2,
    "rows": 3
  }
}
```
※ 未設定の場合はデフォルト値を返す。

---

### PUT /api/settings
設定を保存（upsert）。

**リクエスト**
```json
{
  "layout": {
    "orientation": "portrait",
    "cols": 2,
    "rows": 2
  }
}
```

**レスポンス** `200 OK`
```json
{ "ok": true }
```
