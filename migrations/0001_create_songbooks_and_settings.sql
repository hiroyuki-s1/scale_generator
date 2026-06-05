-- 0001_create_songbooks_and_settings.sql
-- 神スケールトレーナー D1 初期スキーマ
--
-- 設計方針:
--   スケール / ソングファイルは localStorage（クライアント）で管理し、
--   ログインユーザーが「ソングファイル丸ごと」を名前付きで保存したものを
--   ソングブックとして D1 に持つ（JSON スナップショット）。
--   ユーザー管理（users/sessions）は Clerk が担うため D1 には持たない。
--
-- 適用（ローカル）:
--   npx wrangler d1 execute scale_generator_db --local \
--     --file ./migrations/0001_create_songbooks_and_settings.sql
-- 適用（本番）: 上記から --local を外す（本番反映は手動運用に従う）

-- ソングブック: ソングファイル（saved[]）のスナップショット
CREATE TABLE IF NOT EXISTS songbooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,                 -- Clerk の user ID (user_xxxxxx)
  name        TEXT    NOT NULL,                 -- ソングブック名（最大100文字・アプリ側で検証）
  scales      TEXT    NOT NULL,                 -- JSON: ソングファイルのスナップショット
  scale_count INTEGER NOT NULL DEFAULT 0,       -- スケール枚数（一覧表示用キャッシュ）
  created_at  INTEGER NOT NULL,                 -- Unix timestamp (ms)
  updated_at  INTEGER NOT NULL                  -- Unix timestamp (ms)
);

-- 一覧は user_id で絞り、更新日時の新しい順に並べる
CREATE INDEX IF NOT EXISTS idx_songbooks_user_id
  ON songbooks (user_id, updated_at DESC);

-- ユーザーごとの設定（印刷レイアウト等）。1ユーザー1行
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,                     -- Clerk の user ID
  layout  TEXT NOT NULL                         -- JSON 例: {"orientation":"landscape","cols":2,"rows":3}
);
