# D1 データベーススキーマ

## テーブル一覧

| テーブル | 用途 |
|---------|------|
| `scales` | 登録スケール（既存の localStorage saved[] に対応） |
| `user_settings` | ユーザーごとの印刷レイアウト設定 |

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
  layout   TEXT NOT NULL       -- JSON 例: {"orientation":"landscape","cols":2,"rows":3}
);
```

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

```
migrations/
└── 0001_create_scales_and_settings.sql
```

### 0001_create_scales_and_settings.sql

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
