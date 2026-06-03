# ジャズ理論基礎

## コードとスケールの対応（Chord-Scale Theory）

ジャズでは「そのコードで使えるスケール（アボイドノートが少ないもの）」を
体系的に割り当てる。

| コード | スケール | 特徴的な度数 |
|--------|---------|------------|
| IMaj7  | Ionian (Major) | M7, 9, 13 |
| IMaj7  | Lydian | #11（浮遊感）|
| IIm7   | Dorian | 13（明るいマイナー）|
| IIm7b5 | Locrian | b5, b13 |
| V7     | Mixolydian | m7（標準）|
| V7     | Lydian Dominant | #11（代理）|
| V7alt  | Altered | b9, #9, b13（緊張感最大）|
| Im7    | Aeolian / Dorian | m7 |
| Im-M7  | Harmonic Minor | M7 |

---

## ii-V-I 進行

ジャズの基本中の基本。すべての調に存在する。

```
Cメジャールート: Dm7 → G7 → CMaj7
              IIm7   V7   IMaj7
```

各コードのスケール選択:
- `Dm7` → D Dorian (= Cメジャースケール、DからD)
- `G7`  → G Mixolydian (= Cメジャースケール、GからG) または G Altered
- `CMaj7` → C Ionian または C Lydian

### マイナーii-V-I
```
Cマイナールート: Dm7b5 → G7alt → Cm(Maj7)
               IIm7b5   V7alt   Im-M7
```
- `Dm7b5` → D Locrian
- `G7alt` → G Altered (= Abメロディックマイナー)
- `Cm-M7` → C Harmonic Minor

---

## テンション（Extensions）

### Available Tensions（使えるテンション）

テンションとはコードトーン以外の付加音。半音衝突がなければ使用可。

| コードタイプ | 使えるテンション |
|------------|----------------|
| Maj7       | 9, #11, 13 |
| m7         | 9, 11, 13 (Dorian) |
| 7 (dom)    | 9, #11, 13 (Mixolydian) |
| 7alt       | b9, #9, #11, b13（すべてオルタード）|

### アボイドノート（Avoid Notes）

半音でコードトーンとぶつかる音。ペダルとして長く伸ばすと濁る。

| コード | アボイドノート |
|--------|--------------|
| CMaj7  | F (= 11) ← E(M3)と半音衝突 |
| G7     | C (= 11) ← B(M3)と半音衝突 |
| Am7    | Bb(= b9) ← A(R)と半音衝突 |

※ フレーズの経過音としては使える。長く伸ばすのがNG。

---

## 代理コード（Substitution）

### トライトーン代理（Tritone Substitution）

V7コードを、そのルートから増4度（tritone）離れたコードで代理できる。

```
G7 → Db7  （GとDbはtritone = 6半音）
```

両コードに共通の tritone（B-F）が含まれるため機能が似ている。
この代理コードに対するスケール = Db Lydian Dominant。

### Secondary Dominant（セカンダリードミナント）

任意のコードの前にそのV7を置く。

```
Dm7 → G7 → CMaj7  (通常)
A7  → Dm7 → G7 → CMaj7  (A7がDm7のV7=セカンダリードミナント)
```

---

## モーダル・インターチェンジ（Modal Interchange）

平行調（同名の長調・短調）のコードを借用する技法。

例: Cメジャーの曲に Cm由来のコードを使う。
```
CMaj7 → Fm7 → G7 → CMaj7
         ↑ Cマイナーから借用（IV→bVII進行の雰囲気）
```

---

## 度数とコードネームの対照

コードを度数で読む練習。Cルートを例に。

| コード | 構成度数 |
|--------|---------|
| C      | R M3 P5 |
| Cm     | R m3 P5 |
| C7     | R M3 P5 m7 |
| CMaj7  | R M3 P5 M7 |
| Cm7    | R m3 P5 m7 |
| Cm7b5  | R m3 #11 m7 |
| Cdim7  | R m3 #11 13 |
| C9     | R M3 P5 m7 9 |
| CMaj9  | R M3 P5 M7 9 |
| C13    | R M3 P5 m7 13 |
| C7(#11)| R M3 P5 m7 #11 |
| C7alt  | R M3 m7 b9 #9 b13 |

---

## ギタリストのためのジャズ入門ポイント

1. **ii-V-I を全12ルートで** → 移調すれば同じフォームが使える
2. **コードトーンを先に覚える** → スケールランよりアルペジオから
3. **Dorian と Mixolydian を最初に** → im7 と V7 で使う機会が多い
4. **Altered は V7 の代替として** → G7 → G Altered で解決感UP
5. **CAGEDポジションとスケールを紐付ける** → 「このポジションは何フォームか」を意識
