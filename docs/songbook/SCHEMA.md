# ソングブック DB スキーマ

> 設計の前提・D1/SQLite の勘所は `db` スキル（`.claude/skills/db/`）に準拠。
> STRICT テーブル・CHECK 制約・`(user_id, updated_at DESC)` 複合索引・JSON 版管理を採用。

## テーブル

```sql
CREATE TABLE songbooks (
  id             INTEGER PRIMARY KEY,        -- rowid（内部用・外部に出さない）
  public_id      TEXT    NOT NULL UNIQUE,    -- 外部公開/共有用ID（crypto.randomUUID 等で生成）
  user_id        TEXT    NOT NULL,           -- Clerk の user ID
  name           TEXT    NOT NULL,           -- ソングブック名（1〜100文字）
  scales         TEXT    NOT NULL,           -- JSON: ソングファイルのスナップショット（"v" 内包）
  schema_version INTEGER NOT NULL DEFAULT 1, -- scales JSON のフォーマット版
  scale_count    INTEGER NOT NULL DEFAULT 0, -- スケール枚数（表示用キャッシュ）
  created_at     INTEGER NOT NULL,           -- Unix timestamp (ms)
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER,                    -- 論理削除（NULL=有効）
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (length(name) BETWEEN 1 AND 100)
) STRICT;

-- 一覧用カバリングインデックス: 返す列まで含め、重い scales 行に触れず index-only で返す
CREATE INDEX idx_songbooks_user_list
  ON songbooks (user_id, updated_at DESC, public_id, name, scale_count, created_at)
  WHERE deleted_at IS NULL;
```

> 一覧クエリは必ず `WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC` の形にする
> （`deleted_at IS NULL` を省くと部分索引が使われない）。`EXPLAIN QUERY PLAN` で
> `SEARCH ... USING INDEX idx_songbooks_user_list` を確認すること。

### カラムの意図（拡張性）

| カラム | 役割 | なぜ今入れるか |
|--------|------|---------------|
| `public_id` | 外部公開/共有用の推測不能ID | 連番 `id` の列挙を避け、将来の「URL共有」を後付けできるようにする。後から UNIQUE 列を埋めるのは高い |
| `schema_version` | `scales` JSON のフォーマット版 | スケールの形は今後変わる。古いスナップショットを安全に移行する判定に使う |
| `deleted_at` | 論理削除 | ゴミ箱/復元の余地。部分索引で有効行だけ高速に一覧 |

---

## scales フィールドの JSON 構造（版管理あり）

ソングファイル（localStorage の saved[]）をスナップショットとして保存する。
**先頭に `v`（フォーマット版）を持たせる**。`songbooks.schema_version` 列と一致させる
（列＝一括移行クエリ用の索引可能なミラー、JSON内＝スナップショット単体でも版が分かる携帯性）。

```json
{
  "v": 1,
  "scales": [
    {
      "title": "C メジャーペンタ",
      "root_index": 0,
      "active_degrees": [0, 2, 4, 7, 9],
      "preset_name": "Major Penta",
      "mode": "scale",
      "mask": { "enabled": false, "min": 0, "max": 21 },
      "degree_colors": [],
      "instrument": "guitar",
      "hidden_positions": []
    }
  ]
}
```

- `id` / `sort_order` は localStorage 管理のため含まない（配列順＝表示順）
- `hidden_positions` は異弦同音の非表示ポジション（→ [features/POSITION_VISIBILITY.md](../features/POSITION_VISIBILITY.md)）
- `degree_colors` はスケールごとの度数色（→ [features/DEGREE_COLORS.md](../features/DEGREE_COLORS.md)）

### バージョン移行の指針

| 状況 | 対応 |
|------|------|
| 読み込んだ `v` が現行より古い | 読み込み時にマイグレーション関数で現行形へ変換（欠落フィールドは既定値） |
| `v` が欠落（旧データ） | `v=1` とみなす |
| `v` が現行より新しい（別端末で先に更新） | 既知フィールドのみ使用し、未知フィールドは保持して書き戻す（前方互換） |

---

## user_settings

ユーザーごとの汎用設定。詳細は [auth/SCHEMA.md](../auth/SCHEMA.md)。

```sql
CREATE TABLE user_settings (
  user_id  TEXT PRIMARY KEY,   -- Clerk の user ID
  settings TEXT NOT NULL       -- 汎用 JSON 例: {"layout":{...},"theme":"dark"}
) STRICT;
```

---

## マイグレーション

`migrations/0001_create_songbooks_and_settings.sql`（songbooks + user_settings）。
適用は wrangler の migrations フレームワーク（`d1_migrations` 表で適用済みを追跡）:

```bash
# ローカル
npx wrangler d1 migrations apply scale_generator_db --local
# 本番（※本番反映は手動運用。docs/DEPLOYMENT.md に従う）
npx wrangler d1 migrations apply scale_generator_db
```

> D1 にロールバックは無い。スキーマ変更は**打ち消しマイグレーションを足す**前方運用。
