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
  'maj':   'メジャー',
  'min':   'マイナー',
  'dim':   'ディミニッシュ',
  'aug':   'オーギュメント',
  'sus4':  'サス4',
  'sus2':  'サス2',
  // ── コード / 7th ──
  'maj7':  'メジャー7',
  'mMaj7': 'マイナーメジャー7',
  'm7b5':  'マイナー7♭5',
  'dim7':  'ディミニッシュ7',
  'm7':    'マイナー7',
  '7':     'セブンス',
  // ── コード / テンション ──
  'maj9':  'メジャー9',
  'm9':    'マイナー9',
  '9':     'ナインス',
  '13':    'サーティーン',
};

// Sort by length descending to avoid partial matches (e.g. "Locrian" before "Locrian #2")
const _SORTED = Object.entries(SCALE_NAME_JA).sort((a, b) => b[0].length - a[0].length);

/**
 * タイトル文字列中の英語スケール名をカタカナに置換する。
 * 例: "A Minor Penta" → "A マイナーペンタ"
 */
export function localizeTitle(title) {
  let result = title;
  for (const [en, ja] of _SORTED) {
    result = result.replace(en, ja);
  }
  return result;
}
