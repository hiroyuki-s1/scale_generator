# 認証・クラウド保存 アーキテクチャ

## 1. 技術スタック

| レイヤー | 技術 | 役割 |
|---------|------|------|
| フロントエンド | Vanilla JS（既存） | UI・API 呼び出し |
| 認証 | Clerk | Google OAuth・セッション管理 |
| API | Cloudflare Workers（Pages Functions） | CRUD エンドポイント |
| DB | Cloudflare D1（SQLite） | スケール・設定の永続化 |

---

## 2. 構成図

```
ブラウザ（Vanilla JS）
    │
    ├─ Clerk JS SDK
    │    └─ Google OAuth / セッション管理
    │
    └─ fetch /api/*
         │
         Cloudflare Pages Functions（/functions/api/）
              │ Clerk JWT 検証
              │
              Cloudflare D1
                   ├── scales
                   └── user_settings
```

---

## 3. 認証フロー

```
1. ユーザーが「Google でログイン」をタップ
2. Clerk が Google OAuth を処理
3. Clerk がセッション（JWT）を発行・ブラウザに保存
4. フロントが /api/scales を fetch（Authorization: Bearer <JWT>）
5. Workers が Clerk SDK で JWT を検証 → user_id を取得
6. D1 から user_id のスケールを取得して返す
```

---

## 4. データフロー

### ログイン前（既存動作を維持）

```
操作 → localStorage → 画面反映
```

### ログイン後

```
操作 → /api/scales（POST/PUT/DELETE）→ D1 → 画面反映
```

### ログイン直後（データ移行）

```
localStorage にデータあり？
    Yes → 「移行しますか？」確認ダイアログ
              Yes → /api/scales/import → D1 に追加
              No  → D1 のデータで上書き
    No  → D1 のデータをそのまま表示
```

---

## 5. ファイル構成（追加・変更するもの）

```
/
├── functions/
│   └── api/
│       ├── scales/
│       │   ├── index.js       # GET（一覧）/ POST（登録）
│       │   ├── [id].js        # PUT（更新）/ DELETE（削除）
│       │   ├── reorder.js     # PUT（並び替え）
│       │   └── import.js      # POST（localStorage からの移行）
│       └── settings/
│           └── index.js       # GET / PUT（レイアウト設定）
│
├── src/
│   ├── ui/
│   │   ├── authButton.js      # ログイン/ユーザーメニュー UI（新規）
│   │   └── authModal.js       # ログインモーダル（新規）
│   └── state/
│       └── cloudSync.js       # API 呼び出し・同期ロジック（新規）
│
└── docs/auth/
    ├── SPEC.md
    ├── ARCHITECTURE.md（本ファイル）
    ├── API.md
    └── SCHEMA.md
```

---

## 6. セキュリティ方針

- **JWT 検証**: 全 API エンドポイントで Clerk JWT を検証。未認証は 401 を返す
- **user_id 強制**: D1 クエリは必ず `WHERE user_id = ?` で絞る。他ユーザーのデータは参照不可
- **CORS**: Cloudflare Pages と同一オリジンのため不要
- **入力値**: Workers 側でバリデーション。異常値は 400 を返す

---

## 7. 段階的実装方針

| フェーズ | 内容 |
|---------|------|
| Phase 1 | D1 セットアップ・スキーマ作成 |
| Phase 2 | Clerk セットアップ・Google OAuth 設定 |
| Phase 3 | Workers API 実装（CRUD） |
| Phase 4 | フロント UI（ログインボタン・モーダル） |
| Phase 5 | データ同期ロジック（localStorage ↔ D1） |
| Phase 6 | localStorage → D1 移行フロー |
