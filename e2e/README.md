# E2E テスト (Playwright)

PC / Android / iOS の3環境をエミュレートして全機能を検証する E2E テスト。

## 実行方法

```bash
# 1. dev server を起動 (別ターミナル)
npm run dev

# 2. E2E テストを実行
npm run test:e2e          # 全機能テスト (PC/Android/iOS)
npm run test:e2e:print    # 印刷DOM構造の詳細検証
```

> dev server (http://localhost:5173) が起動している必要があります。

## エミュレート環境

| キー | 環境 | viewport | UA |
|------|------|----------|-----|
| pc | Chrome デスクトップ | 1280×800 | Linux Chrome |
| android | Chrome モバイル | 390×844 | Android 13 Pixel 7 |
| ios | Safari モバイル | 375×812 | iPhone iOS 17 |

> **注意**: Playwright の WebKit ブラウザはこの環境ではインストールできないため、
> iOS は Chromium に iPhone UA + viewport を被せた近似エミュレーションです。
> 純粋な WebKit 固有の挙動 (印刷の page-break など) は
> `__tests__/print/*.test.js` の静的 CSS 検証で別途担保しています。

## ファイル構成

- `helpers.cjs` — デバイス定義・共通セットアップ (dialog 自動承認、アルファ告知スキップ)
- `all-features.test.cjs` — 21項目の全機能テスト (楽器選択〜印刷〜削除)
- `print-dom.test.cjs` — 印刷時の改ページ DOM 構造を詳細検証

## テスト項目 (all-features)

1. アプリ読み込み / 2. 楽器選択 (Guitar/Bass) / 3. キー選択 /
4. スケール・コード選択 / 5. 指板表示 / 6. 度数カスタム設定 /
7. フレット範囲(マスク) / 8. スケール登録 / 9. 編集モード /
10. 削除 / 11. 全画面表示 / 12. 度数カラー設定 / 13. 印刷レイアウト選択 /
14. 印刷モーダル / 15. 印刷DOM構造(改ページ) / 16. モバイルズーム /
17. モバイル⋮メニュー / 18. タブナビ / 19. 全削除 / 20. リセット /
21. コンソールエラーなし

## 既知の仕様 (テストで確認済み)

- **ヘッダーのレイアウトピッカーは display:none** (意図的)。
  レイアウト選択は印刷モーダル内の `#printLayoutGrid` でのみ可能。
- **印刷の改ページは `.print-page-group` (block) + `page-break-after:always`**。
  CSS Grid や flex への page-break は iOS Safari で動作しないため、
  `#panelSaved` も含めて印刷時は全て block 要素にする。
- **confirm/alert ダイアログ**は編集キャンセル・削除確認で発生。
  テストでは `helpers.cjs` の `page.on('dialog', ...)` で自動承認。
