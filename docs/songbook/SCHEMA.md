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
  CHECK (length(name) BETWEEN 1 AND 100),
  CHECK (updated_at >= created_at)
) STRICT;

-- 一覧用カバリングインデックス（非部分・index-only）: 返す列までキーに含め、重い scales 行に触れない
CREATE INDEX idx_songbooks_user_list
  ON songbooks (user_id, deleted_at, updated_at DESC, public_id, name, scale_count, created_at);
```

> 一覧クエリは `WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC` の形にする。
> `EXPLAIN QUERY PLAN` で **`USING COVERING INDEX idx_songbooks_user_list`** を確認すること
> （`COVERING` が出れば基底行を読まない index-only scan）。
>
> ※ **部分索引にしない理由**: SQLite 3.37 系では部分索引 (`... WHERE deleted_at IS NULL`) が
> カバリングとして使われず（rowid 経由で最大~100KB の `scales` 行を読みに行く）、最適化目的を
> 達成できない。`deleted_at` を索引キー第2列に入れた**非部分**索引なら全バージョンで index-only。
> ローカル検証は `python3` の `sqlite3`（3.37.2）で `EXPLAIN QUERY PLAN` を確認できる。

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
      "title": "G メジャー",
      "root_index": 7,
      "active_degrees": [0, 2, 4, 5, 7, 9, 11],
      "preset_name": "Ionian",
      "mode": "scale",
      "mask": { "enabled": false, "min": 0, "max": 21 },
      "instrument": "guitar",

      "degree_colors": [
        { "solid": true,  "color": "#d92b2b", "text": "#ffffff" },
        { "solid": false, "color": "#1c1c1c", "text": "#1c1c1c" },
        { "solid": false, "color": "#1c1c1c", "text": "#1c1c1c" }
        /* … 全12要素。度数インデックス順 R, b9, 9, m3, M3, 11, #11, 5, b13, 13, m7, M7 */
      ],

      "visible_positions": ["g3s0", "g0s3", "g2s2", "g3s1"]
    }
  ]
}
```
（`visible_positions` は表示中の位置の実体集合。`null` は未設定フォールバック＝全表示）

- `id` / `sort_order` は localStorage 管理のため含まない（配列順＝表示順）
- **`degree_colors`**: スケールごとの度数色（→ [features/DEGREE_COLORS.md](../features/DEGREE_COLORS.md)）。
  **12要素固定**の配列で、添字が度数インデックス（0=R … 11=M7）。各要素は
  `{ "solid": boolean, "color": "#rrggbb", "text": "#rrggbb" }`。
  一次ソースは [src/domain/constants.js](../../src/domain/constants.js) の `DEFAULT_COLORS`。
- **`visible_positions`**: 異弦同音の**表示するポジションを明示列挙**する
  （→ [features/POSITION_VISIBILITY.md](../features/POSITION_VISIBILITY.md)）。
  弦×フレットを一意に表すキー **`g{fret}s{string}`** の配列（`fret`=フレット番号, `string`=弦番号 0始まり）。
  - **配列 = 表示中の位置の実体集合**（通常はこちら）。含まれないアクティブ位置は非表示（薄く表示）。
  - **`null` = フォールバック（未設定/旧データ）＝アクティブ全表示**。通常の編集操作では必ず実体集合に材化する。
  - **「非表示の差分」ではなく「表示する位置」を持つ理由**: カスタムスケールがあり、
    必ずしも標準スケール（メジャーペンタ／単一度数 等）とは限らないため「大半は表示」を前提に
    できない。特定の運指の型だけ出す使い方では表示数の方が少ないので、表示集合を持つのが自然。
  - 更新ルール（プリセット選択で再構築・度数トグルで増減・個別タップでトグル）は
    [POSITION_VISIBILITY.md](../features/POSITION_VISIBILITY.md) を参照。
  - ランタイムは `Set`、保存時 `Array.from()`、読込時に復元（`null` はそのまま）。

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
npx wrangler d1 migrations apply kami_db --local
# 本番（※本番反映は手動運用。docs/DEPLOYMENT.md に従う）
npx wrangler d1 migrations apply kami_db
```

> D1 にロールバックは無い。スキーマ変更は**打ち消しマイグレーションを足す**前方運用。
