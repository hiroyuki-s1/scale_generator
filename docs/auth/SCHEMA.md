# D1 データベーススキーマ

> ⚠️ **このドキュメントの `scales` テーブルは旧設計（スケール個別をD1同期）であり、
> 現行方針では採用しない。** 現行は「ソングファイルは localStorage、ログインユーザーが
> 丸ごと保存したスナップショットだけ `songbooks` テーブルに持つ」方式。
> 実際に作成する D1 テーブルは [songbook/SCHEMA.md](../songbook/SCHEMA.md) の
> `songbooks` ＋ 本ファイルの `user_settings`。マイグレーションは
> **`migrations/0001_create_songbooks_and_settings.sql`**。
> 以下の `scales` 定義は将来「スケール個別同期」を再導入する場合の参考として残す。

## テーブル一覧

| テーブル | 用途 | 現行採用 |
|---------|------|---------|
| `songbooks` | ソングファイルのスナップショット（→ songbook/SCHEMA.md） | ✅ |
| `user_settings` | ユーザーごとの印刷レイアウト設定 | ✅ |
| `scales` | 登録スケール個別同期（旧設計・参考） | ⛔ 現行では未採用 |

※ ユーザー管理（users / sessions）は Clerk が担うため D1 には持たない。

---

## scales

```sql
CREATE TABLE scales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL,        -- Clerk の user ID (user_xxxxxx)
  title          TEXT    NOT NULL,        -- スケール名（最大60文字）
  root_index     INTEGER NOT NULL,        -- 0〜11（C=0, C#=1 ... B=11）
  active_degrees TEXT    NOT NULL,        -- JSON 配列 例: [0,2,4,7,9]
  preset_name    TEXT,                    -- "Major Penta" 等、手動選択時は null
  mode           TEXT    NOT NULL DEFAULT 'scale',  -- 'scale' | 'chord'
  mask           TEXT    NOT NULL,        -- JSON 例: {"enabled":false,"min":0,"max":21}
  degree_colors  TEXT    NOT NULL,        -- JSON 配列（12要素の色設定）
  instrument     TEXT    NOT NULL,        -- 'guitar' | 'bass'
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,        -- Unix timestamp (ms)
  updated_at     INTEGER NOT NULL         -- Unix timestamp (ms)
);

CREATE INDEX idx_scales_user_id ON scales (user_id, sort_order);
```

---

## user_settings

```sql
CREATE TABLE user_settings (
  user_id  TEXT PRIMARY KEY,   -- Clerk の user ID
  settings TEXT NOT NULL       -- 汎用 JSON 例: {"layout":{"orientation":"landscape","cols":2,"rows":3},"theme":"dark"}
) STRICT;
```

※ 列名は `layout` ではなく汎用の `settings`。レイアウト以外（テーマ・既定楽器・locale 等）も
1列の JSON に入れられるようにしている（設定項目の追加でマイグレーション不要）。

---

## 制約・バリデーション

| フィールド | 制約 |
|-----------|------|
| `title` | 1〜60文字 |
| `root_index` | 0〜11 の整数 |
| `active_degrees` | 0〜11 の整数配列（JSON） |
| `mode` | `'scale'` または `'chord'` |
| `instrument` | `'guitar'` または `'bass'` |
| `sort_order` | 0 以上の整数 |

---

## マイグレーションファイル

現行マイグレーションは `songbooks` ＋ `user_settings` を作る
**`migrations/0001_create_songbooks_and_settings.sql`**（→ [songbook/SCHEMA.md](../songbook/SCHEMA.md)）。
下記の `scales` を含む定義は旧設計の参考。

```
migrations/
└── 0001_create_songbooks_and_settings.sql   # 現行（songbooks + user_settings）
```

### （参考・旧設計）scales + user_settings

```sql
CREATE TABLE scales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  root_index     INTEGER NOT NULL,
  active_degrees TEXT    NOT NULL,
  preset_name    TEXT,
  mode           TEXT    NOT NULL DEFAULT 'scale',
  mask           TEXT    NOT NULL,
  degree_colors  TEXT    NOT NULL,
  instrument     TEXT    NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_scales_user_id ON scales (user_id, sort_order);

CREATE TABLE user_settings (
  user_id  TEXT PRIMARY KEY,
  layout   TEXT NOT NULL
);
```

---

## localStorage との対応

| localStorage（saved[]） | D1（scales テーブル） |
|------------------------|---------------------|
| `id`（数値の連番） | `id`（AUTOINCREMENT） |
| `title` | `title` |
| `rootIndex` | `root_index` |
| `activeDegrees`（Set） | `active_degrees`（JSON 配列） |
| `presetName` | `preset_name` |
| `mode` | `mode` |
| `mask` | `mask`（JSON） |
| `degreeColors` | `degree_colors`（JSON） |
| `instrument` | `instrument` |
| （なし） | `sort_order`（インデックス順） |
| （なし） | `user_id`（Clerk user ID） |
| （なし） | `created_at` / `updated_at` |
