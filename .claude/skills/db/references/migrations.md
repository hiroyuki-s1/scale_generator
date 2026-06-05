# Migrations — マイグレーション運用（特に Cloudflare D1）

マイグレーションは**スキーマの版管理**。各変更を連番 `.sql` で `migrations/` に積む。

## 基本原則

- **連番 + 不変**: `0001_*.sql`, `0002_*.sql` … 一度適用したファイルは編集しない。直すなら
  新しいマイグレーションを足す。
- **1 マイグレーション = 1 つの意味のある変更**。レビューと切り戻しがしやすい。
- **冪等に書く**: `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` を使うと
  再適用に強い（このプロジェクトの 0001 もこの方針）。
- **適用順は依存に従う**: FK の親テーブルを子より先に作る。

## D1 固有の注意

- **ロールバック機能は無い**。打ち消したい変更は「逆操作の新マイグレーション」を書く。
- 適用履歴は `d1_migrations` テーブルに記録される（`wrangler d1 migrations` 利用時）。
- FK のある表を作り直す/移行するときは、一時的に FK を無効化する必要があることがある。
- **本番反映は手動運用**（このプロジェクトのルール）。push = 本番反映ではない。
  手順は `docs/DEPLOYMENT.md` に従う。

### 適用コマンド
```bash
# ローカル
npx wrangler d1 execute scale_generator_db --local \
  --file ./migrations/0002_xxx.sql
# 本番は --local を外す（人間が手動で実施）
```

## 破壊的変更は前方互換ステップに分ける

列削除・型変更・NOT NULL 追加は、稼働中アプリと衝突しやすい。**段階移行**する。

### 例: 列のリネーム（`scales` → `snapshot`）
1. 新列を追加（nullable）してデプロイ。アプリは両方書き、読みは新を優先。
2. 既存行をバックフィル（`UPDATE ... SET snapshot = scales`）。
3. 新列を NOT NULL 化、アプリから旧列参照を撤去。
4. 旧列を削除（別マイグレーション）。

> SQLite/D1 は `ALTER TABLE` が限定的（列追加・リネーム・削除は可、型変更/制約追加は不可）。
> 制約や型を変える場合は **「新表を作る → データ移行 → 旧表 DROP → リネーム」** の
> table-rebuild パターンを使う。

### table-rebuild の型
```sql
PRAGMA foreign_keys=OFF;
CREATE TABLE songbooks_new ( ... 新しい定義 ... ) STRICT;
INSERT INTO songbooks_new (id, user_id, ...)
  SELECT id, user_id, ... FROM songbooks;
DROP TABLE songbooks;
ALTER TABLE songbooks_new RENAME TO songbooks;
-- 索引を貼り直す
CREATE INDEX IF NOT EXISTS idx_songbooks_user_id ON songbooks (user_id, updated_at DESC);
PRAGMA foreign_keys=ON;
```

## チェックリスト

- [ ] 連番・説明的なファイル名 (`000N_action_target.sql`)
- [ ] `IF NOT EXISTS` 等で冪等
- [ ] FK の親→子の順序
- [ ] 破壊的変更は前方互換（add→backfill→switch→drop）に分割
- [ ] 索引はテーブル作成と同じマイグレーションで貼る
- [ ] スキーマ変更後の `ANALYZE;` を検討
- [ ] 適用後の動作をローカル D1 で確認（本番反映は手動・docs/DEPLOYMENT.md）
