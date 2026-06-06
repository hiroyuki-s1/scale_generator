-- 0005_create_user_profiles.sql
-- 表示名（display name）= ユーザーが自由に決める公開プロフィール名。
--
-- 背景 / 設計判断:
--   ・コード進行などの共有コミュニティで「投稿者名」として他ユーザーにも見える名前が要る。
--     user_settings は本人専用 private 設定（WHERE user_id=? 自己参照のみ）なので、ここには置けない。
--     → 他ユーザーから JOIN で読める独立したプロフィール表を新設する。
--   ・Clerk がアカウント（認証情報）を持つので、ここは「アプリ固有の公開プロフィール」だけを持つ。
--     user_id は Clerk の ID (user_xxxx) を TEXT PK で保持。
--   ・表示名は「重複OK」（一意ハンドルではない）。識別は user_id で行う。
--     → display_name に UNIQUE は付けない。
--   ・設定タイミングは「初回ログイン後のオンボーディングモーダル」。よって行が無い＝未設定で、
--     アプリ側はそれを検知してモーダルを出す（Webhook で先回り生成はしない）。
--   ・退会（Clerk user.deleted Webhook）時に他テーブル同様この行も物理削除する。
--
-- D1/SQLite 方針（db スキル準拠）:
--   ・STRICT テーブル。時刻は Unix epoch ms の INTEGER。
--   ・長さ・整合は CHECK で DB 側に守らせる（アプリ側 validateDisplayName と二重防御）。
--   ・自己参照（WHERE user_id=?）と他ユーザー参照（JOIN ... ON user_id）はどちらも PK で seek できる。
--     追加の索引は不要。
--
-- 適用:
--   ローカル: npx wrangler d1 migrations apply kami_db --local
--   staging:  npx wrangler d1 migrations apply kami_db_staging --remote --config wrangler.staging.toml
--   本番:     npx wrangler d1 migrations apply kami_db --remote   （本番反映は手動運用に従う）

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      TEXT    PRIMARY KEY,                  -- Clerk の user ID (user_xxxxxx)
  display_name TEXT    NOT NULL,                     -- 公開表示名（重複可・1〜50文字・アプリ側でも検証）
  created_at   INTEGER NOT NULL,                     -- Unix timestamp (ms)
  updated_at   INTEGER NOT NULL,                     -- Unix timestamp (ms)
  CHECK (length(display_name) BETWEEN 1 AND 50),
  CHECK (updated_at >= created_at)                   -- 時刻の整合（更新は作成以降）
) STRICT;
