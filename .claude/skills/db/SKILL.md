---
name: db
description: Database design know-how — schema design, normalization, keys, data types, indexing strategy, anti-patterns, and migrations. Includes a Cloudflare D1 / SQLite section tailored to this project (D1 + Clerk). Use when designing tables, adding columns/indexes, writing migrations, or reviewing a schema.
origin: web-research (collected 2026-06)
---

# Database Design (DB設計ノウハウ)

実務で効く DB 設計の原則を 1 枚に凝縮したスキル。ネット上のベストプラクティス
（Microsoft Learn / Cloudflare D1 docs / SQLite docs / 各種DB設計記事）を収集・整理したもの。
このプロジェクトは **Cloudflare D1 (SQLite) + Clerk 認証** なので、汎用設計に加えて
D1/SQLite 固有の注意点を `references/sqlite-d1.md` にまとめている。

## When to Activate

- 新しいテーブル / カラムを設計するとき
- マイグレーション (`migrations/*.sql`) を書く・レビューするとき
- インデックスを追加・見直すとき
- 既存スキーマをレビュー / リファクタするとき
- 「JSON で持つか正規化するか」を判断するとき

## 設計の進め方 (ワークフロー)

1. **クエリから設計する** — 先にどう読むか（WHERE / JOIN / ORDER BY / 一覧の並び順）を
   洗い出し、それを満たす最小のテーブル・インデックスを置く。テーブルを先に決めて
   後からクエリを当てると必ずインデックスが足りなくなる。
2. **正規化を初期から効かせる** — 1NF→2NF→3NF。冗長や更新異常は後で直すほど高くつく。
   非正規化（キャッシュ列・JSON スナップショット）は「測って遅かったら」入れる例外扱い。
3. **キーと制約を最初に決める** — 全テーブルに主キー。参照は FK で守る。NOT NULL /
   UNIQUE / CHECK をアプリ任せにせず DB 側にも置く。
4. **命名を統一する** — テーブルは複数形 snake_case、PK は `id`、FK は `<entity>_id`、
   時刻は `created_at`/`updated_at`。一貫した命名はスキーマの「文法」。
5. **インデックスは戦略的に** — FK と頻出フィルタ/ソート列に貼る。貼りすぎは write を
   遅くする。詳細は `references/indexing.md`。
6. **マイグレーションで変更を版管理** — 破壊的変更は前方互換ステップに分ける。
   D1 にロールバックは無い（打ち消しマイグレーションを足す）。詳細は
   `references/migrations.md`。

## コア原則 (要点)

### 正規化と例外
- **既定は正規化（3NF）**。1 セルに複数値（カンマ区切り・配列・エンコード文字列）は禁止 →
  子テーブル / 中間テーブルにする。
- 非正規化は「読み取りが圧倒的に多く、計測で遅い」ときだけ。入れたら**一貫性を保つ責任**
  （トリガ or アプリ）が必ずついてくることを明記する。
  - 例: このプロジェクトの `songbooks.scale_count` は一覧表示用の**キャッシュ列**。
    `scales` JSON と二重管理になるので、更新時に必ず両方を書く。

### キー
- **全テーブルに主キーを持たせる**（自然キーの組合せに頼らない。重複事故の温床）。
- サロゲートキー（`INTEGER PRIMARY KEY` / UUID）を基本に、自然キーには UNIQUE 制約を別途。
- 外部キーは原則 FK 制約で宣言する。「ID だけ持って制約なし」は完璧なコードを前提にした
  アンチパターン。

### データ型
- 列の型は意味で選ぶ（時刻・真偽・金額・ID）。曖昧な型は索引効率もデータ整合も落とす。
- 文字列長・列挙値は CHECK / アプリ検証で境界を守る（外部入力は常に検証）。
- SQLite は型が緩い（type affinity）。本番スキーマは **STRICT テーブル**推奨。詳細は
  `references/sqlite-d1.md`。

### 制約と整合性
- NOT NULL を既定に。NULL は「本当に未知/未設定」のときだけ許す。
- 一意性は UNIQUE、値域は CHECK、関連は FK。**DB が守れる整合性は DB に守らせる**。
- 削除の伝播（ON DELETE CASCADE / RESTRICT）を意図して選ぶ。

## アンチパターン早見表

| アンチパターン | 何が問題 | 正しいやり方 |
|---|---|---|
| 1 列に複数値 (CSV/配列) | 検索・結合不能、整合性なし | 子/中間テーブル |
| 主キーなし | 重複・更新不能 | サロゲート主キー |
| FK 制約を貼らない | 孤児レコード・不整合 | FK 制約で宣言 |
| ポリモーフィック関連 (`type`+1 FK) | 参照整合性を貼れない | 関連ごとに別 FK / 別テーブル |
| 1 テーブルに別エンティティを `type` 列で混在 | NULL 列だらけ | エンティティごとにテーブル |
| 無計画なソフトデリート | 整合性喪失・カスケード手動化 | 必要時のみ、`deleted_at`+部分索引で設計 |
| EAV (key/value 何でも箱) | 型・制約・索引が効かない | 正規化 or JSON 列を限定的に |

詳細・具体例は `references/anti-patterns.md`。

## レビュー チェックリスト

- [ ] すべてのテーブルに主キーがある
- [ ] 外部参照に FK 制約（または明確な理由）がある
- [ ] NOT NULL / UNIQUE / CHECK で守れる不変条件を DB 側に置いた
- [ ] 一覧/検索クエリの WHERE・ORDER BY を満たす（複合）インデックスがある
- [ ] インデックスを貼りすぎていない（write コストとのバランス）
- [ ] 1 セル複数値・別エンティティ混在をしていない
- [ ] 命名規約（複数形・id・<entity>_id・created_at/updated_at）に従っている
- [ ] マイグレーションは前方互換／打ち消し手順を考慮している
- [ ] (SQLite) STRICT テーブル・適切な型・`PRAGMA foreign_keys` を検討した

## リファレンス

- `references/schema-design.md` — 正規化・キー・命名・データ型の詳細
- `references/indexing.md` — インデックス戦略（複合 / カバリング / 落とし穴）
- `references/sqlite-d1.md` — **このプロジェクト向け** SQLite/Cloudflare D1 の勘所
- `references/anti-patterns.md` — アンチパターン集と修正例
- `references/migrations.md` — マイグレーション運用（特に D1）

## 出典 (Sources)

- [Index Architecture and Design Guide — Microsoft Learn](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide)
- [Cloudflare D1 docs — Migrations / Best practices](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1: SQLite at the Edge After 6 Months in Production — dev.to](https://dev.to/whoffagents/cloudflare-d1-sqlite-at-the-edge-after-6-months-in-production-551j)
- [Understanding Type Affinity in SQLite — database.guide](https://database.guide/understanding-type-affinity-in-sqlite/)
- [SQL anti-patterns — GitHub (boralp)](https://github.com/boralp/sql-anti-patterns)
- [Database Design Best Practices guides (2025) — 各記事](https://playground.halfaccessible.com/blog/database-design-best-practices)
