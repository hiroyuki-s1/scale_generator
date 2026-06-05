-- 0003_drop_share_expiry.sql
-- 共有スナップショットの有効期限 (90日) を廃止する。
--
-- 背景:
--   ・shares.expires_at NOT NULL + idx_shares_expires による「失効バッチ削除」運用は
--     ユーザー体験を損ねる (ある日いきなり共有 URL が切れる)。
--   ・DB 圧迫対策は「ソングブック=公開可能なスナップショット」に一本化する方向で
--     済むため、別テーブル shares + TTL という構造自体を簡素化したい。
--   ・このマイグレーションでは shares テーブルから「失効」概念を取り除く。
--     共有は「作成すれば残り続け、ユーザーが明示的に削除した時だけ消える」モデルへ。
--
-- 設計判断:
--   ・既存共有を失効させないため、expires_at と関連 CHECK / INDEX を「テーブル再作成」で除去。
--   ・カラム順序は保持 (ROWID 互換)。share_id の UNIQUE は維持。
--   ・user_id 単独の二次索引を新たに用意 (一覧 SELECT name, share_id … WHERE user_id = ?
--     ORDER BY created_at DESC の高速化)。
--
-- 後方互換:
--   ・API: shares.expires_at は返さなくなる。クライアントは expires_at が無くても動くよう
--     UI を改修済み (このコミットの src/ui/shareModal.js 等)。

-- 1) 新しいスキーマ (expires_at 無し) を別名で作る。
CREATE TABLE IF NOT EXISTS shares_v2 (
  id             INTEGER PRIMARY KEY,
  share_id       TEXT    NOT NULL UNIQUE,
  user_id        TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  scales         TEXT    NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  scale_count    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  CHECK (schema_version >= 1),
  CHECK (scale_count >= 0),
  CHECK (length(name) BETWEEN 1 AND 100)
) STRICT;

-- 2) 既存データをコピー (expires_at は捨てる)。
INSERT INTO shares_v2 (id, share_id, user_id, name, scales, schema_version, scale_count, created_at)
  SELECT id, share_id, user_id, name, scales, schema_version, scale_count, created_at
    FROM shares;

-- 3) 旧索引・旧テーブルを削除。
DROP INDEX IF EXISTS idx_shares_expires;
DROP INDEX IF EXISTS idx_shares_user;
DROP TABLE shares;

-- 4) リネームして元の名前に戻す。
ALTER TABLE shares_v2 RENAME TO shares;

-- 5) 索引を貼り直す。
--   ・「自分の共有一覧」高速化: WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares (user_id, created_at);
--   ・share_id の単体取得 (GET /api/shares/:share_id) は UNIQUE の自動索引で seek。
