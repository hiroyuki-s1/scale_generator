-- 0006_create_analytics_events.sql
-- ⚠️【一時的・実験的な行動ログ。「後で消す前提」で完全に独立させてある】⚠️
--
-- 目的: スケール保存・共有・オンボーディング完了など「価値到達のファネル」を粗く把握する。
--       少人数フェーズの薄い計測用。リッチな分析は GA4/PostHog に任せ、ここは一次ログの最小限。
--
-- ★ 削除（feature ごとロールバック）するときの手順 ★
--   1) DROP 用 migration を1つ追加:  DROP TABLE IF EXISTS analytics_events;  (+ 索引も道連れに消える)
--   2) functions/api/events/index.js を削除
--   3) src/state/track.js を削除
--   4) `track(` の呼び出し箇所を grep して全部消す
--      （現状: src/main.js の onSaved / src/ui/shareModal.js / src/ui/profileModal.js の3か所）
--   5) scripts/validate_migrations.py の「== analytics_events ==」セクションを削除
--   → 既存テーブル(user_events 等)には一切手を入れていないので、上記だけで“傷跡ゼロ”で消える。
--
-- 設計（消しやすさ最優先）:
--   ・user_events(起動ログ)とは別テーブルにして依存を断つ（user_events を触らない＝再構築不要）。
--   ・event_type に列挙 CHECK を付けない（種類を足すたびの migration を不要にする・長さだけ制限）。
--     アプリ側で種類を管理する。
--   ・props は JSON(任意)。PII は入れない（root/mode/件数などの文脈のみ）。
--   ・PII(IP/UA/精密位置/メール)は保存しない。user_id はログイン時のみ・匿名は anon_id。
--
-- 適用: ローカル  npx wrangler d1 migrations apply kami_db --local
--       staging   CI(.github/workflows/staging.yml)が push 時に自動適用
--       本番      docs/DEPLOYMENT.md に従い人間が手動

CREATE TABLE IF NOT EXISTS analytics_events (
  id         INTEGER PRIMARY KEY,
  at         INTEGER NOT NULL,                 -- Unix timestamp (ms)
  event_type TEXT    NOT NULL,                 -- 'scale_save' | 'share_create' | 'onboarding_done' ...(アプリ側管理)
  user_id    TEXT,                             -- Clerk user id (ログイン時のみ・匿名は NULL)
  anon_id    TEXT,                             -- 匿名 ID (localStorage UUID)
  props      TEXT,                             -- イベント固有データ JSON (任意・PII禁止)
  CHECK (length(event_type) BETWEEN 1 AND 40)
) STRICT;

-- 代表クエリ「種類別の件数・期間集計」用（WHERE event_type=? [AND at BETWEEN ?]）。
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_at ON analytics_events (event_type, at);
