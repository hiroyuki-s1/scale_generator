-- 0001_create_songbooks_and_settings.sql
-- 神スケールトレーナー D1 初期スキーマ
--
-- 設計方針:
--   スケール / ソングファイルは localStorage（クライアント）で管理し、
--   ログインユーザーが「ソングファイル丸ごと」を名前付きで保存したものを
--   ソングブックとして D1 に持つ（JSON スナップショット）。
--   ユーザー管理（users/sessions）は Clerk が担うため D1 には持たない。
--   user_id は Clerk の ID (user_xxxx) を TEXT で保持し、全クエリで WHERE user_id = ? で絞る。
--
-- 拡張性メモ:
--   ・scales は JSON blob。スケールの新フィールド追加はマイグレーション不要。
--   ・JSON の形は将来変わるため schema_version で版管理する（→ SCHEMA.md の契約参照）。
--   ・id(rowid) は内部用。外部公開/共有は推測不能な public_id を使う。
--   ・deleted_at による論理削除（ゴミ箱/復元の余地）。NULL=有効。
--
-- D1/SQLite 方針（db スキル準拠）:
--   ・STRICT テーブル（宣言型に合わない値を拒否し整合性を上げる）。
--   ・AUTOINCREMENT は使わない（並びは updated_at、外部参照は public_id で取れるため不要）。
--   ・真偽/値域は CHECK で DB 側に守らせる。時刻は Unix epoch ms の INTEGER で統一。
--
-- 適用（推奨: migrations フレームワーク。d1_migrations 表で適用済みを追跡）:
--   ローカル: npx wrangler d1 migrations apply scale_generator_db --local
--   本番:     npx wrangler d1 migrations apply scale_generator_db   （本番反映は手動運用に従う）

-- ソングブック: ソングファイル（saved[]）のスナップショット
CREATE TABLE IF NOT EXISTS songbooks (
  id             INTEGER PRIMARY KEY,                -- rowid エイリアス（内部用・外部に出さない）
  public_id      TEXT    NOT NULL UNIQUE,            -- 外部公開/共有用ID（crypto.randomUUID 等で生成）
  user_id        TEXT    NOT NULL,                   -- Clerk の user ID (user_xxxxxx)
  name           TEXT    NOT NULL,                   -- ソングブック名（最大100文字・アプリ側でも検証）
  scales         TEXT    NOT NULL,                   -- JSON: ソングファイルのスナップショット（"v" 内包）
  schema_version INTEGER NOT NULL DEFAULT 1,         -- scales JSON のフォーマット版（移行判定に使う）
  scale_count    INTEGER NOT NULL DEFAULT 0,         -- スケール枚数（一覧表示用キャッシュ・書込時に必ず同期）
  created_at     INTEGER NOT NULL,                   -- Unix timestamp (ms)
  updated_at     INTEGER NOT NULL,                   -- Unix timestamp (ms)
  deleted_at     INTEGER,                            -- 論理削除（NULL=有効・値あり=削除済み）
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (length(name) BETWEEN 1 AND 100)
) STRICT;

-- 一覧は「有効な行のみ」を user_id で絞り更新日時の新しい順に並べる（部分インデックス）
CREATE INDEX IF NOT EXISTS idx_songbooks_user_active
  ON songbooks (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
-- ※ public_id は UNIQUE 制約により索引が自動作成されるため、別途インデックス不要。

-- ユーザーごとの設定（印刷レイアウト・テーマ・既定楽器など汎用）。1ユーザー1行
CREATE TABLE IF NOT EXISTS user_settings (
  user_id  TEXT PRIMARY KEY,                         -- Clerk の user ID
  settings TEXT NOT NULL                             -- 汎用 JSON 例: {"layout":{...},"theme":"dark"}
) STRICT;
