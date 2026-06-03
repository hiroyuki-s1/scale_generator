/**
 * i18n: スケール / コードトーン名のカタカナ対訳テスト。
 *
 * リリース前ガード:
 *   - SCALE_GROUPS / CHORD_GROUPS に存在する全プリセット名が
 *     SCALE_NAME_JA に対訳を持つこと (英語名がそのまま UI に出る事故防止)
 *   - localizeTitle が longest-first 順で安全に置換されること
 *     (`Locrian #2` が先に `Locrian` にマッチしないこと)
 *   - TITLE_HIDDEN_NAMES (例: maj) はタイトル上で空文字に置換され
 *     トリムされること (例: "C maj" → "C")
 */
import { describe, it, expect } from 'vitest';
import { SCALE_NAME_JA, TITLE_HIDDEN_NAMES, localizeTitle } from '../../src/domain/i18n.js';
import { SCALE_GROUPS, CHORD_GROUPS } from '../../src/domain/constants.js';

const ALL_PRESET_NAMES = [
  ...SCALE_GROUPS.flatMap(g => g.presets.map(p => p.name)),
  ...CHORD_GROUPS.flatMap(g => g.presets.map(p => p.name)),
];

describe('SCALE_NAME_JA 完全性', () => {
  for (const name of ALL_PRESET_NAMES) {
    it(`プリセット "${name}" に日本語対訳がある`, () => {
      expect(SCALE_NAME_JA).toHaveProperty(name);
      const ja = SCALE_NAME_JA[name];
      expect(typeof ja).toBe('string');
      expect(ja.length).toBeGreaterThan(0);
    });
  }
});

describe('localizeTitle — 置換ロジック', () => {
  it('"A Minor Penta" → "A マイナーペンタ"', () => {
    expect(localizeTitle('A Minor Penta')).toBe('A マイナーペンタ');
  });

  it('"C Ionian" → "C イオニアン"', () => {
    expect(localizeTitle('C Ionian')).toBe('C イオニアン');
  });

  it('"C maj" → "C" (TITLE_HIDDEN_NAMES でスペース除去)', () => {
    expect(TITLE_HIDDEN_NAMES.has('maj')).toBe(true);
    expect(localizeTitle('C maj')).toBe('C');
  });

  it('"D Locrian #2" → "D ロクリアン♯2" (長い名前優先で安全)', () => {
    // longest-first sort により "Locrian" よりも "Locrian #2" が先に一致しなければならない
    // (もし "Locrian" → "ロクリアン" が先に適用されると "ロクリアン #2" になる)
    expect(localizeTitle('D Locrian #2')).toBe('D ロクリアン♯2');
  });

  it('"F# Lydian Dom" → "F# リディアンドミナント" (Lydian の前方一致誤マッチを防ぐ)', () => {
    // "Lydian" が先に当たると "リディアン Dom" になってしまう。longest-first 必須。
    expect(localizeTitle('F# Lydian Dom')).toBe('F# リディアンドミナント');
  });

  it('"Cmaj7" → "CM7" (連結チョード名の置換)', () => {
    expect(localizeTitle('Cmaj7')).toBe('CM7');
  });

  it('"AmMaj7" → "AmM7"', () => {
    expect(localizeTitle('AmMaj7')).toBe('AmM7');
  });

  it('ひらがなを含むユーザー入力は変換しない (DM7の3度と7度のみ など)', () => {
    // toKatakana 廃止により、ひらがなはそのまま残る
    const input = 'DM7の3度と7度のみ';
    const out = localizeTitle(input);
    // maj7→M7 だけ置換される。ひらがな部は素通し。
    expect(out).toBe(input);
  });

  it('既知の英語名を含まない文字列はそのまま返す', () => {
    expect(localizeTitle('hello world')).toBe('hello world');
  });
});
