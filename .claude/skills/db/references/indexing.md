# Indexing — インデックス戦略

インデックスは**読みを速くするが書きを遅くする**。クエリパターンから必要最小限を貼る。

## 何に貼るか

- `WHERE` で絞る列
- `JOIN` の結合列（＝外部キーには基本貼る）
- `ORDER BY` / `GROUP BY` の列
- 一覧の「絞り＋並び順」はセットで複合インデックスにする

> SQLite/D1 の query planner は保守的で、適切な索引が無いと小さい表でも全走査する。
> 「主フィルタ列 + ソート列」を**一つの複合インデックス**にまとめるのが定石。

## 複合インデックス (Composite Index)

複数列をまとめた索引。「複数列を一緒に使うクエリ」を 1 つの索引で賄う。

### 列順のルール (最重要)
1. **等値 (`=` / `IN`) で使う列を先**、範囲 (`>`, `<`, `BETWEEN`, `LIKE`) で使う列を後。
2. 等値列の中では**選択性が高い（値の種類が多い）列を先**に。
3. `ORDER BY` の列と方向（ASC/DESC）を索引に合わせると追加ソートを省ける。
4. 不要な列を足さない（保守コストだけ増える）。

### 左端プレフィックスの法則
複合索引 `(a, b, c)` は `(a)`, `(a, b)`, `(a, b, c)` のクエリに効くが、`(b)` 単独や
`(b, c)` には効かない。**先頭から連続して使う**列だけが恩恵を受ける。

### 例（このプロジェクト）
```sql
-- 一覧: user_id で絞り、updated_at の新しい順に並べる
CREATE INDEX idx_songbooks_user_id ON songbooks (user_id, updated_at DESC);
```
`WHERE user_id = ? ORDER BY updated_at DESC` を索引だけで絞り＋整列できる。

## カバリングインデックス (Covering Index)

クエリが必要とする列を**すべて含む**索引。表本体を読まずに索引だけで応答できる
（"index-only scan"）。

- 高頻度・性能重視のクエリに有効。
- 列を入れすぎると索引が肥大化し、I/O・メモリ・ストレージを食う → 逆効果。
- SQLite には `INCLUDE` 構文が無いので、必要列を索引キーに含める形で作る。

```sql
-- name と updated_at だけ返す一覧なら、表を読まずに済む
CREATE INDEX idx_songbooks_list ON songbooks (user_id, updated_at DESC, name);
```

## 落とし穴 / アンチパターン

- **貼りすぎ**: INSERT/UPDATE/DELETE のたびに全索引を更新する。書き込みが重い表で過剰索引は禁物。
- **関数/型変換で索引が無効化**: `WHERE lower(name) = ?` は `name` の索引を使えない →
  式インデックス `CREATE INDEX ... ON t(lower(name))` を作る。
- **型不一致**: 列と比較値の型がズレると索引が効かないことがある（SQLite の affinity）。
- **低選択性の単独索引**: `is_public`（2 値）単独の索引はほぼ無意味。複合の構成要素や
  部分索引で使う。
- **部分インデックス**を活用: `CREATE INDEX ... WHERE deleted_at IS NULL` のように
  対象行を絞ると小さく速い索引になる（ソフトデリート運用と相性が良い）。

## 検証

- `EXPLAIN QUERY PLAN <SQL>` で `SEARCH ... USING INDEX` になっているか確認
  （`SCAN TABLE` は全走査の合図）。
- スキーマ/索引変更後は SQLite で `ANALYZE;`（D1 でも実行可）を走らせて統計を更新する。
