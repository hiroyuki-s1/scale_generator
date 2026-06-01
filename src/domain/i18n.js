/** スケール名の英語 → カタカナ対訳 */
export const SCALE_NAME_JA = {
  // ── スケール ──
  'Major Penta':   'メジャーペンタ',
  'Minor Penta':   'マイナーペンタ',
  'Blues':         'ブルース',
  'Ionian':        'イオニアン',
  'Dorian':        'ドリアン',
  'Phrygian':      'フリジアン',
  'Lydian':        'リディアン',
  'Mixolydian':    'ミクソリディアン',
  'Aeolian':       'エオリアン',
  'Locrian':       'ロクリアン',
  'Lydian Dom':    'リディアンドミナント',
  'Altered':       'オルタード',
  'Locrian #2':    'ロクリアン♯2',
  'Harmonic Min':  'ハーモニックマイナー',
  'Diminished':    'ディミニッシュ',
  // ── コード / トライアド ──
  'maj':   'M',
  'min':   'm',
  'dim':   'dim',
  'aug':   'aug',
  'sus4':  'sus4',
  'sus2':  'sus2',
  // ── コード / 7th ──
  'maj7':  'M7',
  'mMaj7': 'mM7',
  'm7b5':  'm7♭5',
  'dim7':  'dim7',
  'm7':    'm7',
  '7':     '7',
  // ── コード / テンション ──
  'maj9':  'M9',
  'm9':    'm9',
  '9':     '9',
  '13':    '13',
};

// Sort by length descending to avoid partial matches (e.g. "Locrian" before "Locrian #2")
const _SORTED = Object.entries(SCALE_NAME_JA).sort((a, b) => b[0].length - a[0].length);

// タイトル・トリガーボタン等では表示しないプリセット名（メジャートライアドは"C"のみでよい）
export const TITLE_HIDDEN_NAMES = new Set(['maj']);

/**
 * タイトル文字列中の英語スケール名をカタカナに置換する。
 * 'maj' はタイトル上では空文字扱い → "C maj" → "C"
 */
export function localizeTitle(title) {
  let result = title;
  for (const [en, ja] of _SORTED) {
    result = result.replace(en, TITLE_HIDDEN_NAMES.has(en) ? '' : ja);
  }
  return result.trim();
}
