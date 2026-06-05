# ソングブック DB スキーマ

## テーブル

```sql
CREATE TABLE songbooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,          -- Clerk の user ID
  name       TEXT    NOT NULL,          -- ソングブック名（最大100文字）
  scales     TEXT    NOT NULL,          -- JSON: ソングファイルのスナップショット
  scale_count INTEGER NOT NULL DEFAULT 0, -- スケール枚数（表示用キャッシュ）
  created_at INTEGER NOT NULL,          -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_songbooks_user_id ON songbooks (user_id, created_at DESC);
```

---

## scales フィールドの JSON 構造

ソングファイル（localStorage の saved[]）をそのままスナップショットとして保存する。

```json
[
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
]
```

※ id・sort_order は localStorage 管理のため含まない。
