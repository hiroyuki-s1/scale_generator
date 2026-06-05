-- 0002_create_shares.sql
-- 曲共有機能: ソングファイルを短い share_id 付きで公開スナップショット保存する。
--
-- 方針（決定事項）:
--   ・作成はログイン必須（user_id NOT NULL）。受け取り(GET)は認証不要の公開エンドポイント。
--   ・有効期限あり（自動失効）。expires_at を必ず設定し、期限切れは GET で 404・バッチで削除。
--   ・中身は songbooks.scales と同じ JSON 形式（"v" 内包・度数色・異弦同音の表示/非表示を含む）。
--   ・share_id は URL 安全・推測不能の短いID（nanoid 風 10桁・サーバ生成・UNIQUE 衝突時は再生成）。
--   ・閲覧数カウントは入れない（GET ごとに書き込みが発生し read>>write の D1 方針に反するため。
--     必要になれば Cloudflare Analytics 等で別途。列は後から ALTER で足せる）。
--
-- 適用: npx wrangler d1 migrations apply scale_generator_db --local
--       本番は --local を外す（本番反映は手動運用）

CREATE TABLE IF NOT EXISTS shares (
  id             INTEGER PRIMARY KEY,                -- rowid（内部用）
  share_id       TEXT    NOT NULL UNIQUE,            -- 公開ID（URL/手入力用・推測不能の短い文字列）
  user_id        TEXT    NOT NULL,                   -- 作成者 Clerk user ID（作成はログイン必須）
  name           TEXT    NOT NULL,                   -- 表示名（共有元ソングブック名のコピー・「自分の共有一覧」用）
  scales         TEXT    NOT NULL,                   -- JSON スナップショット（"v" 内包・songbooks.scales と同形式）
  schema_version INTEGER NOT NULL DEFAULT 1,         -- scales JSON のフォーマット版
  scale_count    INTEGER NOT NULL DEFAULT 0,         -- スケール枚数（表示用キャッシュ）
  created_at     INTEGER NOT NULL,                   -- Unix timestamp (ms)
  expires_at     INTEGER NOT NULL,                   -- 自動失効時刻 (ms)。created_at + 既定90日
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (length(name) BETWEEN 1 AND 100),
  CHECK (expires_at > created_at)
) STRICT;

-- 期限切れバッチ削除用: DELETE FROM shares WHERE expires_at < ?
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares (expires_at);

-- 1ユーザーの有効な共有数カウント（作成上限チェック）/ 将来の「自分の共有一覧」用
--   WHERE user_id = ? AND expires_at > ?
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares (user_id, expires_at);

-- ※ share_id の単体取得 (GET /api/shares/:share_id) は UNIQUE 制約の自動索引で seek。
--   取得は scales(本体JSON)を返すのでカバリングにはせず素直に行を読む。
