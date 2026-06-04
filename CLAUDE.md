# 神スケールトレーナー (Kami Scale Trainer) — Claude Code Instructions

ギター/ベース指板上にスケール・コードを可視化し、A4印刷するWebアプリ。
Jazz tension 表記で度数を表示し、ルート × スケール/コードを指板にプロット →
複数登録 → 印刷、という流れ。

- 本番 (カスタムドメイン): https://kami-scale-trainer.org/
- Cloudflare Pages: https://scale-generator.pages.dev/ (本番ホスティング)
- ミラー (GitHub Pages): https://hiroyuki-s1.github.io/scale_generator/
- リポジトリ: git@github.com:hiroyuki-s1/scale_generator.git

## Tech Stack
- Vanilla HTML5 + ES2022 modules (フレームワークなし・**ランタイム依存ゼロ**)
- Vite (dev server / production build)
- Vitest (unit testing, Node environment)
- ESLint (code quality)
- デプロイは **2系統 (Cloudflare Pages が本番、GitHub Pages はミラー)**

## Node Version
Always use Node 20+ (nvm: `~/.nvm/versions/node/v20.20.0`).
npm/node 実行時は `PATH=~/.nvm/versions/node/v20.20.0/bin:$PATH` を前置する。

## JavaScript Rules
- Pure ES modules everywhere (`export` / `import`)
- No TypeScript — plain JS with JSDoc annotations where helpful
- Immutable patterns: never mutate state in place (store は必ず新オブジェクトを返す)
- No external runtime dependencies (no Tonal.js, no React, no frameworks)

## Degree Notation (CRITICAL)
全箇所でこの表記を厳守 (jazz tension style):
```
R, b9, 9, m3, M3, 11, #11, P5, b13, 13, m7, M7
```
セミトーン: R=0, b9=1, 9=2, m3=3, M3=4, 11=5, #11=6, P5=7, b13=8, 13=9, m7=10, M7=11

`activeDegrees` は **度数インデックス (0–11) の Set**。pitch class ではなく度数で持つ。

## Domain Concepts

### モード (mode)
- `'scale'` … スケール表示。プリセットは `SCALE_GROUPS` (Penta / Church Mode / Advanced)
- `'chord'` … コード表示。プリセットは `CHORD_GROUPS` (Triad / 7th / Extended)
- 切替は `PRESETS_BY_MODE`、横断検索は `findPresetEverywhere(name)`

### 楽器 (instrument)
- `null` = 未選択 (指板を隠してヒント表示) / `'guitar'` / `'bass'`
- チューニング: `TUNING_GUITAR` (6弦 E2–E4) / `TUNING_BASS` (4弦 E1–G2) は MIDI 番号配列
- 弦数差は SVG ジオメトリの `SH` (guitar=5gap) / `SH_BASS` (bass=3gap) で吸収
- saved スナップショットは楽器が必ず確定 (未選択は `'guitar'` に正規化)

### 度数カラー (degreeColors)
- **アプリ全体で共通の一括設定**。スケールごとには持たない
- 色変更は `propagateColors()` で edit と全 saved に伝播
- snap をエディタに読み込む際も degreeColors は読み込まない (現在のグローバル色を維持)

### ローカライズ (i18n)
- プリセット英名 → カタカナ/記号表記の対訳は `src/domain/i18n.js`
- `localizeTitle()` がタイトル文字列を置換。`maj` トライアドはタイトル上で空文字 ("C maj" → "C")

## Architecture Rules

**Module dependency direction:**
```
ui/* → state/store + domain/* + config*
domain/* → (pure, no DOM, no deps)
state/* → domain/* (optional)
config*  → (定数のみ、依存なし)
main.js → orchestrates all
```

- `domain/*` — pure functions only, no DOM/window/document (Nodeでテスト可)
- `ui/*` — DOM manipulation; **ui/* 同士を直接 import 禁止** (store経由で連携)
- `state/store.js` — minimal pub/sub store (get/set/subscribe/updateEdit/updateLayout)。
  listener は `(state, prev)` を受け取り、スライス比較で関心外の更新を早期 return する
- `state/persist.js` — localStorage read/write (debounce 200ms) + **入力サニタイズ/clamp/マイグレーション**
- `state/snapshot.js` — edit→保存スナップショットの不変複製、`propagateColors()`

### 設定レイヤー (開発者ノブ) — 直近 pull で導入
ユーザー設定ではなく **開発者が数値を調整する場所**。2ファイルに集約:

- `src/config/fretboardGeometry.js` — 指板 SVG ジオメトリの一次ノブ
  (`FRET_START/FRET_END`, `FRET_WIDTH`, `FRETBOARD_HEIGHT`, `DOT_RADIUS`, マージン等)。
  下部の `SVG` オブジェクト (短縮ルート W/H/ML/FW/SH…) は**これらから自動計算**され、
  フレット線・ドット・viewBox・マスク矩形すべてが追従する。
  `constants.js` は互換のため `FRET_START/FRET_END/SVG` を re-export しているだけ。
  ※フォントサイズは固定値でスケールしないので、FRET_WIDTH を大きく変えたら
  `fretboardSvg.js` の font-size リテラルも要見直し。
- `src/config.js` — 表示系ノブ (カードタイトルのSVG/CSSフォントサイズ・背景帯高さ、
  モバイル指板ズーム幅 `MOBILE_EDITOR_FRETBOARD_WIDTH`、判定幅 `MOBILE_ZOOM_BREAKPOINT`)

**Key files:**
- `index.html` — マークアップのみ、inline script なし (GA4 タグのみ例外)
- `src/main.js` — エントリポイント、全 UI モジュールの初期化と編集モード/印刷/全画面の統括
- `src/config.js` / `src/config/fretboardGeometry.js` — 開発者ノブ (上記)
- `src/domain/constants.js` — NOTES, DEGREES, SCALE_GROUPS, CHORD_GROUPS, TUNING_*, DEFAULT_COLORS
- `src/domain/fretboard.js` — `computeFretNotes()`, `diffFretNotes()` (差分アニメ用)
- `src/domain/music.js` — `midiToPitchClass()`, `pitchClassToDegree()`
- `src/domain/title.js` / `src/domain/i18n.js` — タイトル生成 / カタカナ対訳
- `src/state/{store,persist,snapshot,savedList}.js` — 状態管理
- `src/ui/fretboardSvg.js` — SVG 描画、diff-apply、マスクオーバーレイ
- `src/ui/savedTab.js` — 登録スケールカード描画 (最大ファイル ~555行)
- `src/ui/*Picker.js, colorModal, maskControl, headerMenu, instrumentPicker, legend` — 各 UI 部品
- `src/print/printCss.js` — 動的 @page CSS 生成
- `src/styles/main.css` — 全画面スタイル (~1500行)

## Mobile / Print の注意点 (直近 pull で実装、ハマりどころ)

- **ズーム制御**: ダブルタップ拡大は CSS `touch-action: manipulation` で抑止。
  ピンチイン/アウトは残す (viewport から `maximum-scale`/`user-scalable=no` を撤去)。
  PC のダブルクリックだけ `dblclick` を preventDefault。
- **印刷の transient user activation (iOS WebKit/Chrome)**: `window.print()` は
  ユーザー操作の activation を消費する。**print() を最初に呼ぶ** — 前に
  `classList.remove`/`setTimeout` を挟むと activation を奪われ「自動印刷」と判定されて
  ブロックされる。モーダルを閉じるのは print() の後 (iOS は afterprint が発火しない
  ことがあるため click ハンドラ内でも閉じ、afterprint も保険で残す)。
- **モバイル印刷**: ヘッダの印刷ボタンは印刷モーダルを介さず `print()` を直接呼ぶ。
  向き UI は隠して常に縦 (portrait) 固定。横印刷は OS の印刷シートで切替運用。
- **エディタ指板の自動ズーム**: `MOBILE_ZOOM_BREAKPOINT` 以下でマスク範囲/指板中心を
  基準に viewBox を絞る。resize/回転でも再計算。
- **印刷の改ページ (iOS Safari 最重要・何度もハマった)**: 複数ページ印刷は
  `beforeprint` で `cols×rows` 枚ずつ `.print-page-group` (block div) にまとめ、
  内側の `.print-page-inner` (grid) でレイアウトする ([src/print/pageGroup.js](src/print/pageGroup.js))。
  改ページは **隣接兄弟 `.print-page-group + .print-page-group` への
  `page-break-before: always`** (= 2番目以降のグループの「前」で改ページ) で行う。
  各グループは **`height: 100vh`** (= 印刷ページに追従する1ページ枠) +
  `overflow: hidden` + `break-inside: avoid` で1ページに収め、内側
  `.print-page-inner` を **`grid-template-rows/columns: repeat(n, minmax(0, 1fr))`**
  で均等分割する。
  **`@page` の size は PC / モバイルで出し分ける (横印刷分割バグの根治・CRITICAL)**:
  モバイル (`isMobile` = `max-width:767px`) は `@page { size: auto; margin: 10mm 12mm }`
  ── 向きを OS 印刷シートで切り替える運用なので、`size` を mm 明示 (210mm 297mm=portrait)
  で固定すると、OS で横用紙を選んだとき @page(縦) と実用紙(横) が衝突し横印刷で
  「タイトルが1P目・スケールが2P目」に分割される (ユーザー報告で再発)。`size: auto` なら
  実用紙の向きに @page と `100vh` が追従する。PC は `@page { size: <mm> }` で向きボタンの
  指定を用紙に効かせる。**どちらの分岐も @page は必ず単一ブロック** — orientation media
  query で @page を2つ出すのは厳禁 (モバイル Safari が複数 @page を処理できず印刷崩壊。
  3f4c03b で実証・revert)。分岐は JS の `isMobile` で行い出力 @page は常に1つ
  ([src/print/printCss.js](src/print/printCss.js))。
  **重要 (試行錯誤の結論)**: 一時 `height` を mm 固定にしたが、iOS 実機の AirPrint
  物理余白を CSS 側で補正しきれず**縦印刷で2P目空白が再発**した。`100vh` は
  印刷ページ高さに追従するため物理余白の手動補正が不要で、これが iOS で安定する
  (= dedecc4 の実装。ユーザー証言「以前は縦が動いていた」が決め手)。**mm 固定 height
  には二度と戻さない**。iOS Safari で動かなかった失敗パターン (絶対に戻さない):
  - ❌ CSS Grid 直下への `break-after: page` → iOS で2P目空白
  - ❌ 空の改ページ用 div + `page-break-before` → div 自体が1P消費し空白
  - ❌ `#panelSaved` が `display:flex` → flex 内の page-break は iOS で無視。**block 必須**
  - ❌ **`page-break-after: always`** → Safari は最終ページの後に**余分な空白ページ**を
    作る既知バグ。`page-break-after` は一切使わず、**隣接兄弟セレクタの
    `page-break-before`** で2番目以降のグループ前だけに改ページを入れる。
  - ❌ **mm 固定 height** → iOS 実機の AirPrint 物理余白(機種差 10〜16mm)を CSS 側で
    手動補正する必要が生じ、補正値が機種差に追いつかず**縦印刷で2P空白が再発**。
    `100vh` ならページ追従で補正不要。`@page margin` も 0/auto にせず `10mm 12mm` を
    明示 (margin:0 は iOS が用紙端まで描画して物理余白で溢れる)。
  - ❌ **grid `1fr`** → Safari で子の min-content に押されて行が膨張し2P空白。
    **`minmax(0, 1fr)`** で強制均等分割し、子は `overflow: hidden` で切る。
  - **マスクで縦長になった指板**: `svg.fb` に `max-height: (92/rows)vh` を指定
    (100vh 枠の中の1セル相当)。`preserveAspectRatio="xMidYMid meet"` で縦長は横が
    縮みフィット (flex は SVG 高さが 0 に潰れるので使わない)。
  - **再発防止テスト (最重要)**: [__tests__/print/iosPrintRegression.test.js](__tests__/print/iosPrintRegression.test.js)
    が「実機 iPhone で縦横とも動いた構成」を7項目の不変条件で固定している
    (①height:100vh ②@page margin 10mm 12mm ②b @page 単一ブロック ②c size は
    モバイル=auto/PC=明示mm ③隣接兄弟 page-break-before ④minmax(0,1fr)
    ⑤svg max-height vh ⑥#panelSaved block ⑦group block+overflow:hidden)。
    **このファイルが赤くなったら iOS 印刷を壊した可能性が高い** — 値を変える前に
    「本当に iOS 実機で確認したか」を必ず自問すること。
  - 検証: **①ユニット** 上記 iosPrintRegression + printCss.matrix。**②実 PDF**
    `node e2e/layout-matrix-pdf.cjs` (全9レイアウトのはみ出し検出、要 dev server)。
    **③WebKit (iOS Safariエンジン)** は `e2e/setup-webkit-libs.sh` で起動用ライブラリを
    sudo 無し導入できるが、headless は emulateMedia('print') と SVG/filter でクラッシュし、
    100vh の印刷時実値も測れない (viewport基準になる) ため、**iOS 印刷の最終確認は実機必須**。

## Testing
- TDD: write tests first (RED → GREEN → REFACTOR)
- Unit tests は **pure な層のみ** をテスト: `__tests__/domain/`, `__tests__/state/`,
  `__tests__/print/`, `__tests__/config/` (DOM 非依存)
- 90%+ coverage on `src/domain/**`
- Run: `npm test` (vitest run), `npm run test:watch`

## File Size
- Max 400 lines per file が目安 (既存で `savedTab.js`/`main.css` は超過、増やさず分割方向)
- One concern per file

## Build / Deploy

> ⚠️ **本番デプロイは手動。push ＝ 本番反映ではない。** クライアント提供環境のため、
> 本番公開は人間が Cloudflare ダッシュボードで手動デプロイした時だけ起きる。
> push 後に「本番反映済み」と報告しないこと。手順とAI向け注意は
> **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** に集約（必ず参照）。

- **base path は環境変数で自動切替** ([vite.config.js](vite.config.js)):
  GitHub Actions (Pages ミラー) では `/scale_generator/`、本番 (Cloudflare) は `/`
- ビルド時に `__COMMIT__` (git short hash) / `__VERSION__` (package.json) を define 注入
- **Service Worker のキャッシュは自動採番 (更新不達の再発防止)**: `public/sw.js` の
  `VERSION = '__SW_VERSION__'` を、ビルド時に [vite.config.js](vite.config.js) の
  `swVersionInjectPlugin` が `<pkg version>-<commit hash>` へ置換する。push のたびに
  キャッシュ名が変わり、SW が更新され activate で旧キャッシュが破棄される
  (手動で VERSION を上げる必要なし)。**消えるのは Cache API のアセットキャッシュのみ**。
  ユーザーの登録スケールは `localStorage('sg.v1.state')` で別管理なので消えない
  (SW から localStorage は触れない)。不変条件は
  [__tests__/pwa/sw.test.js](__tests__/pwa/sw.test.js) で固定。
- **Cloudflare Pages** (本番): プロジェクト `kami-scale-trainer`。デプロイ手順は
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 参照。Build: `npm run build` / Output: `dist` /
  Node: `.node-version` (=20) / `GITHUB_ACTIONS` 未設定で `base:'/'`
- GitHub Pages (ミラー): `.github/workflows/deploy.yml` で `lint → test → build → deploy` (自動)

## Commands
```bash
npm run dev      # Vite dev server (port 5173)
npm run build    # dist/ production build
npm run preview  # serve dist/ locally
npm test         # Vitest once
npm run lint     # ESLint (src __tests__)
```
