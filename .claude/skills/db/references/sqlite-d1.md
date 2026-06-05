# SQLite / Cloudflare D1 — このプロジェクトの勘所

このプロジェクトは **Cloudflare D1 (SQLite ベース) + Clerk 認証**。
ユーザー管理 (users/sessions) は Clerk が担うため D1 には持たず、`user_id` は
Clerk の ID (`user_xxxx`) を TEXT で保持する。

## SQLite の型 (Type Affinity) と STRICT テーブル

SQLite は型が緩い（type affinity）。`INTEGER` 列に文字列を入れても黙って受け入れる。
これはデータ不整合・索引効率低下の原因になる。

- **本番スキーマは STRICT テーブルを推奨**（SQLite 3.37+ / D1 は対応）。宣言型に合わない
  値を拒否し、整合性が上がる。
  ```sql
  CREATE TABLE songbooks (
    id          INTEGER PRIMARY KEY,
    user_id     TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    scales      TEXT    NOT NULL,           -- JSON snapshot
    scale_count INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  ) STRICT;
  ```
- STRICT が使える型は `INTEGER / REAL / TEXT / BLOB / ANY` のみ。柔軟に持ちたい列は `ANY`。
- 真偽は `INTEGER` 0/1 + `CHECK (is_public IN (0,1))`。
- 時刻はこのプロジェクトでは **Unix epoch ms の INTEGER** で統一（`created_at`/`updated_at`）。

## 主キー

- `INTEGER PRIMARY KEY` は rowid のエイリアスで最速・最軽量。基本これを使う。
- `AUTOINCREMENT` は「削除後も ID を再利用しない単調増加」が必須のときだけ付ける
  （余分なテーブルとコストが増える）。一覧の並びは `created_at`/`updated_at` で取れるなら不要。

## 外部キー (D1 の注意)

- SQLite は既定で FK 制約を**無効**にすることがある。D1 ではセッションで
  `PRAGMA foreign_keys = ON;` を確認する（D1 は既定 ON だが、import 時など要注意）。
- マイグレーションで FK のある表を作る/移行するときは**親テーブルを先**に作る
  （存在しない表は参照できない）。FK 付き変更は一時的に FK を無効化することがある。

## 書き込み・トランザクション

- **batch API を使う**: 複数の書き込みは 1 往復にまとめる。ループ内で単発書き込みすると
  レイテンシ予算を食う。
  ```js
  await env.DB.batch([
    env.DB.prepare("UPDATE songbooks SET name=?, updated_at=? WHERE id=? AND user_id=?")
      .bind(name, now, id, userId),
  ]);
  ```
- **長時間トランザクション不可**: D1 は Worker 跨ぎの長いトランザクションを持てない。
  「短く原子的な書き込み」で設計する。
- 書き込みは読み取りに比べ高コスト（レプリケーションで 200–300ms 級になり得る）。
  **D1 は reads >> writes のワークロード向き**。リアルタイム共同編集等には不向き。

## クエリ（SQL インジェクション対策）

- 必ず**プレースホルダ + bind** を使う。文字列連結で SQL を組み立てない。
  ```js
  // ⭕ 安全
  env.DB.prepare("SELECT * FROM songbooks WHERE user_id = ?").bind(userId);
  // ❌ 危険
  env.DB.prepare(`SELECT * FROM songbooks WHERE user_id = '${userId}'`);
  ```
- **テナント分離**: マルチユーザー表は必ず `WHERE user_id = ?` で絞る。`user_id` は
  リクエストの認証情報（Clerk）から取り、クライアント入力を信用しない。

## 行を太らせない

- 大きな blob（画像・ファイル）は D1 に入れず **R2 に置いて参照（キー/URL）だけ持つ**。
  太い行はレプリケーションを遅くしストレージ予算を食う。
- JSON スナップショット（`scales` 等）も巨大化に注意。一覧用は軽いキャッシュ列
  （`scale_count`）で代替する設計が既に入っている。

## ローカル開発 / 適用

```bash
# ローカル D1 にマイグレーション適用
npx wrangler d1 execute scale_generator_db --local \
  --file ./migrations/0001_create_songbooks_and_settings.sql
# 本番は --local を外す（※本番反映は手動運用。docs/DEPLOYMENT.md に従う）
```

## 索引・最適化

- 「主フィルタ列 + ソート列」を複合索引に（例 `(user_id, updated_at DESC)`）。詳細は
  `indexing.md`。
- スキーマ/索引変更後は `ANALYZE;` で統計更新。`EXPLAIN QUERY PLAN` で索引利用を確認。

## 容量の目安（無料枠）

- 読み 5M 行/日、書き 100K 行/日、ストレージ 5GB。社内ツール/初期段階には十分。
  超える規模・高頻度書き込みは設計（バッチ化・R2 退避・キャッシュ）で吸収する。
