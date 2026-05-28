# スケールジェネレータ — 仕様書


---

## 1. 目的・ユースケース

ギタリストがスケール練習用に**指板図を印刷**する。

主要ユースケース:
1. キー（ルート）とスケールを選ぶ
2. 指板に音をプロット→確認
3. 必要なら複数スケールを保存（タイトル付き）
4. A4 1枚に N×M グリッドで一括印刷

ターゲット: PC・タブレットブラウザ。スマホ閲覧可、印刷はA4前提。

---

## 2. 技術スタック

- **言語**: HTML5 + 純粋なES2022 JavaScript (ES modules) + CSS3
- **フレームワーク**: なし（React、Vue 等は使わない）
- **DOM操作**: ネイティブDOM API
- **ビルド**: Vite（dev server / dist 生成）
- **テスト**: Vitest（Node環境でドメイン層のpure関数を単体テスト）
- **Lint**: ESLint（jsdoc型注釈ベース）
- **永続化**: `localStorage`
- **デプロイ**: GitHub Pages（`dist/` を Actions で配信）

依存ライブラリは原則ゼロ。Tonal.js も使わない（demoも未使用）。

---

## 3. ドメインモデル

### 3.1 度数（Degree）

Jazz tension 表記、12個固定:

```
R(0), b9(1), 9(2), m3(3), M3(4), 11(5), #11(6), P5(7), b13(8), 13(9), m7(10), M7(11)
```

R（ルート）は常時ON・トグル不可。

### 3.2 ノート

```
NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
```

### 3.3 チューニング（固定: Standard）

```
TUNING (MIDI, 1弦→6弦) = [64, 59, 55, 50, 45, 40]   // E4 B3 G3 D3 A2 E2
```

### 3.4 フレット範囲

固定 `1〜15` フレット。0フレット（開放弦）は描画しない。

### 3.5 プリセット — スケール & コードトーン

プリセットは **mode** で `'scale'` と `'chord'` に分かれる。UIでは単一の
optgroup付き `<select>` で全グループ・全プリセットを選択する。

**スケール** (mode: 'scale')

| Group     | Name           | Degrees                         |
|-----------|----------------|---------------------------------|
| Penta     | Major Penta    | 0, 2, 4, 7, 9                   |
| Penta     | Minor Penta    | 0, 3, 5, 7, 10                  |
| Penta     | Blues          | 0, 3, 5, 6, 7, 10               |
| Diatonic  | Ionian         | 0, 2, 4, 5, 7, 9, 11            |
| Diatonic  | Lydian         | 0, 2, 4, 6, 7, 9, 11            |
| Diatonic  | Mixolydian     | 0, 2, 4, 5, 7, 9, 10            |
| Diatonic  | Dorian         | 0, 2, 3, 5, 7, 9, 10            |
| Diatonic  | Natural Minor  | 0, 2, 3, 5, 7, 8, 10            |
| Diatonic  | Phrygian       | 0, 1, 3, 5, 7, 8, 10            |
| Diatonic  | Locrian        | 0, 1, 3, 5, 6, 8, 10            |
| Advanced  | Lydian Dom     | 0, 2, 4, 6, 7, 9, 10            |
| Advanced  | Altered        | 0, 1, 3, 4, 6, 8, 10            |
| Advanced  | Locrian #2     | 0, 2, 3, 5, 6, 8, 10            |
| Advanced  | Harmonic Min   | 0, 2, 3, 5, 7, 8, 11            |
| Advanced  | Diminished     | 0, 1, 3, 4, 6, 7, 9, 10         |

チャーチモードは慣用名ではなくモード名で表記する（Ionian であって Major ではない）。

**コードトーン** (mode: 'chord')

| Group     | Name      | Degrees           |
|-----------|-----------|-------------------|
| Triad     | maj       | 0, 4, 7           |
| Triad     | min       | 0, 3, 7           |
| Triad     | dim       | 0, 3, 6           |
| Triad     | aug       | 0, 4, 8           |
| Triad     | sus4      | 0, 5, 7           |
| Triad     | sus2      | 0, 2, 7           |
| 7th       | maj7      | 0, 4, 7, 11       |
| 7th       | 7         | 0, 4, 7, 10       |
| 7th       | m7        | 0, 3, 7, 10       |
| 7th       | m7b5      | 0, 3, 6, 10       |
| 7th       | dim7      | 0, 3, 6, 9        |
| 7th       | mMaj7     | 0, 3, 7, 11       |
| Extended  | 9         | 0, 2, 4, 7, 10    |
| Extended  | maj9      | 0, 2, 4, 7, 11    |
| Extended  | m9        | 0, 2, 3, 7, 10    |
| Extended  | 13        | 0, 4, 7, 9, 10    |

タイトル表示: `${key} ${name}` (例: `A Minor Penta`, `C maj7`)

### 3.6 度数カラー（デフォルト）

```js
{ solid: boolean, color: '#hex', text: '#hex' }
```

- **R**: solid=true,  color=`#d92b2b`, text=`#ffffff`
- **m3, M3, P5, m7, M7**: solid=false, color=`#d92b2b`, text=`#d92b2b`
- **その他**: solid=false, color=`#1c1c1c`, text=`#1c1c1c`

ユーザー編集可・リセット可。

---

## 4. 状態モデル

```js
// 編集中の状態
editState = {
  rootIndex: 9,                   // 0-11 (A)
  activeDegrees: Set([0,3,5,7,10]),
  presetName: 'Minor Penta',      // string | null (手動でnullに)
  mode: 'scale',                  // 'scale' | 'chord' (presetがどちら由来か)
  mask: { enabled: false, min: 1, max: 15 },
  degreeColors: Array(12)         // 上記DEFAULT_COLORS
}

// 保存済み (配列)
savedScales = [
  { id, title, ...editStateのスナップショット }
]

// レイアウト・タブ
layout = { orientation: 'landscape', cols: 2, rows: 3 }
activeTab = 'edit'                // 'edit' | 'saved'
```

**永続化**: `editState`, `savedScales`, `layout` を `localStorage` キー `sg.v1.*` で保存。
state変更ごと（debounce 200ms）に保存。初回ロードで復元。

---

## 5. アーキテクチャ

### 5.1 ファイル構成

```
scale_generator/
├─ index.html                    # マークアップのみ、見た目はCSSへ
├─ public/
│   └─ favicon.svg               # SG ロゴ
├─ src/
│   ├─ main.js                   # エントリ。各UIモジュールを初期化
│   ├─ styles/
│   │   ├─ main.css              # 画面表示用
│   │   └─ print.css             # @media print 用ベース（動的部分はprintCss.jsで生成）
│   ├─ domain/                   # 純粋ロジック。DOM非依存・テスト容易
│   │   ├─ constants.js          # NOTES, DEGREES, PRESETS, TUNING, FRET_RANGE
│   │   ├─ music.js              # pitchClass, degree変換
│   │   ├─ fretboard.js          # computeFretNotes(state) -> Note[]
│   │   └─ title.js              # buildTitle(state) -> string
│   ├─ state/
│   │   ├─ store.js              # シンプルなpub/sub store
│   │   └─ persist.js            # localStorage 読み書き (debounce保存)
│   ├─ ui/                       # 各UIモジュール (DOM操作)
│   │   ├─ header.js
│   │   ├─ tabs.js
│   │   ├─ piano.js
│   │   ├─ presetSelector.js
│   │   ├─ degreeToggle.js
│   │   ├─ maskControl.js
│   │   ├─ fretboardSvg.js       # SVG描画（純粋: state -> SVG要素群）
│   │   ├─ legend.js
│   │   ├─ savedTab.js
│   │   ├─ saveModal.js
│   │   ├─ colorModal.js
│   │   ├─ layoutPicker.js
│   │   └─ orientation.js
│   └─ print/
│       └─ printCss.js           # 動的@pageレイアウトCSS生成
├─ __tests__/
│   └─ domain/
│       ├─ music.test.js
│       ├─ fretboard.test.js
│       └─ title.test.js
├─ specs/SPEC.md                 # この仕様
├─ package.json
├─ vite.config.js
├─ vitest.config.js
├─ eslint.config.js
└─ .github/workflows/deploy.yml
```

### 5.2 モジュール依存方向

```
ui/* ──depends on──> state/store + domain/*
domain/* ──pure, no deps──
state/persist ──depends on──> state/store
main.js ──orchestrates all ui/* + initializes state
```

**制約**:
- `domain/*` は DOM API、`window`、`document` を使わない（Node でテスト可能なこと）
- `ui/*` は domain を import 可、ui同士はimport しない（state経由で通信）
- 全モジュール ES modules (`export` / `import`)、`type="module"` でロード

### 5.3 Store パターン

```js
// state/store.js
export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    get() { return state; },
    set(patch) {
      state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
```

各UIモジュールは `store.subscribe(render)` で自身を再描画。

---

## 6. UI 構造

```
┌─ Header ───────────────────────────────────────────────────────┐
│ [SG] スケールジェネレータ      [Layout▼] [横/縦] [色] [保存] [印刷] │
├─ Tab Nav ──────────────────────────────────────────────────────┤
│ 編集 | 保存済み (N)                                              │
├─ Tab Pane (編集) ──────────────────────────────────────────────┤
│ Panel:                                                          │
│   Row1: [Piano (Key)] | [Scale presets]                         │
│   Row2: [Degree toggles] | [Mask: button + sliders]             │
│ Fretboard area:                                                 │
│   Title (例: "A Minor Penta")                                   │
│   SVG fretboard (1〜15フレット, 6弦)                             │
│   Legend (アクティブ度数のチップ)                                 │
├─ Tab Pane (保存済み) ──────────────────────────────────────────┤
│ Grid (cols×rows): カード(タイトル input + 削除 + SVG + Legend)    │
└─────────────────────────────────────────────────────────────────┘
```

各部の詳細仕様は specs/SPEC.md を正とする。SVG座標・色・サイズは constants.js の SVG 定数に従う。

---

## 7. 印刷

`@page { size: A4 {orientation}; margin: 10mm 12mm; }`

利用可能エリア:
- Landscape: 273 × 190 mm
- Portrait:  186 × 277 mm

`printCss.js` が現在のレイアウト・orientation から `<style id="print-layout">` の中身を生成。

印刷時:
- ヘッダー、タブナビ、編集タブ、モーダル、Legendドット、削除ボタン: `display: none`
- 保存済みタブの内容のみが対象

---

## 8. 受け入れ基準

| # | 機能 | 受け入れ基準 |
|---|------|-------------|
| 1 | Key選択 | ピアノクリックで指板の表示音が即切替 |
| 2 | プリセット | プリセットクリックで度数群とタイトル更新 |
| 3 | 度数トグル | R以外をクリックでON/OFF、presetName→null、タイトル "カスタム" |
| 4 | マスク (画面) | ON時、範囲外がグレー、範囲が紫枠 |
| 4b | マスク (アニメ) | マスク min/max 変更時はドットが全消えして再登場せず、増減差分だけアニメ |
| 4c | マスク (印刷) | mask.enabled の保存スケールは印刷時に範囲だけにトリミング+拡大 (`beforeprint` で SVG viewBox を絞る) |
| 5 | 色変更 | モーダルで色変更→指板・凡例・トグル全て即反映 |
| 6 | 保存 | モーダルでタイトル入力→保存→保存済みタブにカード追加、バッジ更新 |
| 7 | 保存編集 | カードのタイトル input で名前変更、削除ボタン動作 |
| 8 | レイアウト | 1×1〜3×5 で保存済みタブのグリッド列数が変わる |
| 9 | 印刷 | ヘッダー・編集・モーダルが消え、保存済みのみA4配置 |
| 10 | 永続化 | リロード後も編集状態・保存済み・レイアウトが復元 |

---

## 9. テスト

### 9.1 単体テスト (Vitest, Node環境)

`__tests__/domain/` に配置。最低限カバー:

- `music.test.js`
  - `pitchClassToDegree` — 12通り全度数
  - `midiToPitchClass` — 負値・境界
- `fretboard.test.js`
  - `computeFretNotes` — Aルート × Minor Pentaで期待される配置を返す
  - マスク範囲（min=5, max=7）でフィルタされる
- `title.test.js`
  - プリセット: `'A Minor Penta'`
  - カスタム: `'A — カスタム (R, m3, P5)'`

カバレッジ目標: domain 層 90%以上。

### 9.2 実行コマンド

```bash
npm test            # vitest 1回実行
npm run test:watch  # watch
```

E2E (Playwright) は今回スコープ外（後続フェーズ）。

---

## 10. ビルド・デプロイ

### 10.1 開発

```bash
npm install
npm run dev      # vite dev server (port 5173)
npm run build    # dist/ 生成
npm run preview  # dist/ をローカル確認
npm test
npm run lint
```

### 10.2 GitHub Pages

`.github/workflows/deploy.yml`:
- `main` への push でトリガー
- `npm install` → `npm run build` → `dist/` を Pages にアップロード
- URL: `https://hiroyuki-s1.github.io/scale_generator/`

そのため `vite.config.js` の `base` を `/scale_generator/` に設定。

---

## 11. スコープ外

- MIDI再生
- 他のチューニング
- 7弦・5弦ギター・ベース
- アカウント・クラウド保存
- 多言語化（日本語のみ）
- ネイティブ化（iOS/Android）
