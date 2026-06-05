# API 仕様

> ⚠️ **`/api/scales`・`/api/settings`（個別スケール同期）は旧設計**。現行はソングブック方式
> （[songbook/API.md](../songbook/API.md)）。スケール/ソングファイルは localStorage に置き、
> D1 にはソングブックのスナップショットのみ保存する。以下のスケール系エンドポイントは
> 「スケール個別同期」を再導入する場合の参考として残す。
> **現行で必要なのは下記「Clerk Webhook（退会クリーンアップ）」と songbook/API.md。**

---

## Clerk Webhook（退会時クリーンアップ）

ユーザーが Clerk アカウントを削除すると、D1 側の `user_id` 行が孤児として残る
（D1 に users 表を持たないため CASCADE できない）。これを Clerk の Webhook で掃除する。

### POST /api/webhooks/clerk

- **認証**: JWT ではなく **Svix 署名**（`svix-id` / `svix-timestamp` / `svix-signature`
  ヘッダー）を `CLERK_WEBHOOK_SIGNING_SECRET` で検証する。署名不一致は 400
- **冪等**: 同じイベントが再送されても安全（既に削除済みなら 0 件削除で 200）
- **処理**: `type === "user.deleted"` のとき、その `data.id`（= `user_id`）の行を
  **物理削除**（退会＝データ消去なので論理削除ではなくハード DELETE）

```sql
DELETE FROM songbooks     WHERE user_id = ?;
DELETE FROM user_settings WHERE user_id = ?;
```

**レスポンス** `200 OK`
```json
{ "ok": true, "deleted": { "songbooks": 3, "user_settings": 1 } }
```

| ステータス | 意味 |
|-----------|------|
| 200 | 処理成功（削除0件含む） |
| 400 | 署名検証失敗・ペイロード不正 |
| 500 | サーバーエラー |

> ⚠️ 退会クリーンアップは取り消せない。Svix 署名検証を必ず通すこと（未署名の偽リクエストで
> 他人のデータを消されないため）。`example.com` 等のテストイベントは無視する。

---

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
