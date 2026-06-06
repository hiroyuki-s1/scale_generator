-- 0004_create_user_events.sql
-- ユーザー行動記録 (起動時刻ぐらいの粒度) の最小テーブル。
--
-- 目的: 後から「DAU」「リテンション (前回起動からの間隔)」「曜日/時間帯の傾向」
--      など簡易解析できるよう、粗い粒度で起動イベントを残す。
--
-- 設計判断:
--   ・粒度は最低限 (起動時刻 1 行/起動)。「どのスケールを開いた」等の細かい行動は
--     入れない (D1 を逼迫させない・プライバシー的にも軽量)。
--   ・ログイン必須にしない (匿名でも記録できるよう user_id NULLABLE)。匿名は
--     anon_id (client UUID v4・localStorage 保持) を入れる。
--   ・event_type は将来拡張用 ENUM 風 ('launch' のみ運用開始・後で 'register'
--     'share_create' 等を追加可能だが、まずは launch だけ)。
--   ・PII (IP/UA/詳細位置) は入れない。
--   ・1ヶ月以上前の行を間引く運用は将来 cron で (Pages Functions は cron 不可なので
--     wrangler d1 execute で月1)。
--
-- 索引:
--   ・解析クエリの代表は「日別カウント」と「user_id 別最終起動」。
--     - 日別: SELECT date(at/1000,'unixepoch') AS d, COUNT(*) FROM user_events GROUP BY d
--       → at だけで scan、 cardinality 低いので index 不要
--     - 最終起動: SELECT MAX(at) FROM user_events WHERE user_id = ?
--       → idx_user_events_user (user_id, at) を貼る
--   ・anon_id 検索は将来必要なら別途追加。
--
-- 適用: npx wrangler d1 migrations apply kami_db_staging --remote --config wrangler.staging.toml

CREATE TABLE IF NOT EXISTS user_events (
  id           INTEGER PRIMARY KEY,
  at           INTEGER NOT NULL,                  -- Unix timestamp (ms)
  event_type   TEXT    NOT NULL DEFAULT 'launch', -- 'launch' (将来拡張)
  user_id      TEXT,                              -- Clerk user ID (匿名は NULL)
  anon_id      TEXT,                              -- 匿名 ID (localStorage UUID, ログイン時は NULL でも可)
  tz_offset    INTEGER,                           -- クライアントの分単位タイムゾーンオフセット (任意)
  CHECK (event_type IN ('launch'))                -- 将来 'register','share_create' 等を足すならここを拡張
) STRICT;

-- 「自分の最終起動時刻」や「あるユーザーの利用頻度」の高速化用
CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events (user_id, at);

-- 「日別 DAU」等の集計は at のみで全 scan する (粗い粒度のテーブルなので OK)。
-- もし行数が増えて遅くなったら CREATE INDEX idx_user_events_at ON user_events (at); を後で。
