# コミュニティ機能の検討 (実装しない・仕様ブレスト)

ユーザーから「ユーザー間でコミュニケーションを取れるようにしたい」という要望があり、
方向性とコスト感を整理する。**この時点では実装しない**。後で議論するためのたたき台。

## 0. 前提と現状

このアプリの現在のユーザー間連携:
- **共有リンク**: ソングブックを `?share=<share_id>` で他人に渡せる (受け取り側はログイン不要)
- **クラウド保存**: 自分専用 (Clerk user_id でテナント分離)

コミュニティ化するときに守りたい設計原則:
- src/ 依存ゼロ (Vanilla + CDN のみ)
- 印刷・ローカル機能はコミュニティ無しで完結する (ログイン無し体験を壊さない)
- D1 で済む規模 (Workers KV / R2 を追加するとコスト構造が変わる)
- モデレーション容易性 (個人運営想定・通報→手動対応で耐えられる仕組み)

## 1. 軸の選定

「コミュニケーション」には複数の解釈がある。コストと運営負荷で大別:

| 方式 | 例 | 実装コスト | モデレーション負荷 | 推奨度 |
|------|---|-----------|------------------|--------|
| A. 一方向公開 | スケール作品を公開、いいね/閲覧数 | 低 | 低 (テキストなし) | ★★★ |
| B. リアクション | 上記 + 絵文字ボタン | 低 | 低 | ★★★ |
| C. コメント | 公開作品にコメント | 中 | 高 (NG投稿対応) | ★★ |
| D. ユーザー間 DM | 1対1 メッセージ | 高 | 最高 (個別案件) | ★ |
| E. リアルタイムチャット | グループ通話/ライブ | 最高 | 最高 | ☆ |

**推奨は A + B** から始める。テキスト投稿が無い限り、運営者の心配は「不適切なスケール
名/タイトル」程度に収まる。

## 2. 推奨案: 公開ギャラリー + リアクション

### 2.1 体験フロー (ユーザー視点)

1. ソングブックタブで自分のソングブックの「…」→「ギャラリーに公開」を選ぶ
2. 確認ダイアログ (「公開すると誰でも閲覧できます。撤回はいつでも可能です」)
3. 公開後は新タブ **「ギャラリー」** に最新順で並ぶ
4. 一覧では: タイトル / 作者表示名 / スケール数 / いいね数
5. タップで詳細画面 — スケール一覧 + 「自分のソングブックに保存」+ 👍 ボタン
6. 自分の公開作品には「非公開に戻す」ボタン

### 2.2 「作者表示名」

- Clerk のフルネーム or ハンドル (ユーザーが Clerk Profile で設定)
- 表示名のみ。メアド/uid は出さない
- 設定無しの場合は `匿名` 表示

### 2.3 ランキング/並べ替え

MVP は **新着順のみ**。人気順は計算が重くなるので Phase 2。
将来案: 24h いいね数 × 経過時間補正 (HN 風スコア)。

## 3. データモデル (D1 SQL 草案・実装時は migration を切る)

```sql
-- 公開ソングブック (ギャラリー登録)
CREATE TABLE public_songbooks (
  id              INTEGER PRIMARY KEY,
  public_id       TEXT    NOT NULL UNIQUE,     -- songbooks.public_id をそのまま流用 OR 別 ID
  user_id         TEXT    NOT NULL,
  display_name    TEXT,                         -- 公開時点の作者表示名スナップショット
  name            TEXT    NOT NULL,
  scales          TEXT    NOT NULL,             -- songbooks.scales と同じ JSON
  scale_count     INTEGER NOT NULL DEFAULT 0,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  like_count      INTEGER NOT NULL DEFAULT 0,   -- 非正規化 (反映遅延許容)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER,                       -- 論理削除
  CHECK (length(name) BETWEEN 1 AND 100)
) STRICT;

-- 一覧用 (新着順): WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT N
CREATE INDEX idx_gallery_created ON public_songbooks (created_at DESC) WHERE deleted_at IS NULL;
-- 自分の公開作品 (ユーザーページ用)
CREATE INDEX idx_gallery_user ON public_songbooks (user_id, created_at);

-- いいね (1ユーザー1作品1回)
CREATE TABLE likes (
  user_id         TEXT NOT NULL,
  public_songbook TEXT NOT NULL,                 -- public_songbooks.public_id
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, public_songbook)
) STRICT;
CREATE INDEX idx_likes_target ON likes (public_songbook);
```

「コメント」を後で足す場合:
```sql
CREATE TABLE comments (
  id              INTEGER PRIMARY KEY,
  public_songbook TEXT NOT NULL,
  user_id         TEXT NOT NULL,                 -- 認証必須
  display_name    TEXT,                          -- 投稿時点の表示名スナップショット
  body            TEXT NOT NULL,                 -- ≤500文字想定
  created_at      INTEGER NOT NULL,
  deleted_at      INTEGER,                       -- 通報後の論理削除
  CHECK (length(body) BETWEEN 1 AND 500)
) STRICT;
CREATE INDEX idx_comments_target ON comments (public_songbook, created_at DESC) WHERE deleted_at IS NULL;
```

## 4. API (Pages Functions・将来)

```
POST   /api/gallery               公開化 (body: { songbook_id })
DELETE /api/gallery/:public_id    非公開化 (作成者のみ)
GET    /api/gallery               最新順一覧 (公開・無認証) ?limit=N&before=ts
GET    /api/gallery/:public_id    詳細
POST   /api/gallery/:public_id/like    いいね (認証必須・トグル)
GET    /api/users/:user_id/gallery     作者ページ (公開・user_id 単位)
```

設計メモ:
- 公開作品の取得は無認証で叩ける (現行 `GET /api/shares/:id` と同じ思想)
- いいね数は `public_songbooks.like_count` の非正規化で読み込み高速化。`likes` への
  INSERT 後に `UPDATE public_songbooks SET like_count = like_count + 1`。
- 1ユーザー1いいね制約は PRIMARY KEY (user_id, public_songbook) で守る。
- レート制限は Cloudflare WAF: 公開化 (POST /api/gallery) は user 単位 / 日 5 件等。

## 5. 法務 / モデレーション (運営者観点で重要)

- **公開化は明示同意** (チェックボックス + ボタン2段階)
- **通報フロー**: 「不適切な内容を通報」ボタン → 運営宛にメール送信 (フォーム run.run 等)
- **NGワード簡易フィルタ**: 公開時/コメント投稿時に簡易チェック (`badwords-ja` 相当の最低限)
- **作者通報**: 同様に通報ボタン
- **削除権限**: 運営が `deleted_at` を更新するだけ (UI は専用画面ではなく D1 直接でも MVP は可)
- **利用規約**: `docs/legal/TERMS.md` に「公開コンテンツの権利譲渡なし・運営は削除権を持つ」を追記
- **プライバシー**: 表示名以外は出さない・公開直前にプレビュー画面で「これが公開される」を示す

## 6. 段階的ロードマップ

```
Phase A (MVP): ギャラリー (新着順) + 公開/非公開 + いいね
Phase B: 作者ページ / ユーザーが Clerk Profile で表示名設定
Phase C: コメント (NGワードフィルタ + 通報)
Phase D: 人気順スコアリング / タグ (#メジャーペンタ #ジャズ など)
Phase E: フォロー / フィード (本格 SNS 化・運営負荷増大注意)
```

Phase A だけで「他人のソングブックを見て学ぶ・👍 する」が成立する。
SNS 的な双方向性を追加するのは Phase C 以降で要熟慮。

## 7. 実装しないという選択肢

**やらない理由が出てきたら撤退する勇気を持つ:**
- 個人運営で通報対応の人手がない
- 想定ユーザー (ギター/ベース練習者) が SNS を求めていない可能性
- 既に共有リンク (現行) で「他人にスケールを見せる」要件は満たせている

→ 「公開ギャラリー」だけ Phase A で試して、トラフィック・通報数・運営負荷を見てから
Phase B 以降に進む/撤退する **決定ゲート** を設ける。
