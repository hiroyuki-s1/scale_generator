/**
 * リリースノートの正規化（pure・DOM非依存）。
 *
 * `public/release-notes.json` を fetch した生データを、UI が安全に描画できる
 * 形へ正規化する。仕様: docs/features/RELEASE_NOTES.md。
 *
 * 原則「落とさない・黙らせない」: 破損データでもクラッシュせず、欠落フィールドは
 * 既定値へフォールバックする。version は package.json と一致させる運用（手動）。
 *
 * @param {unknown} data fetch + JSON.parse 済みの生データ
 * @returns {Array<{version:string, date:string, highlights:string[]}>}
 *   記載順（新しい順で記載する運用）をそのまま保持する。
 */
export function normalizeReleaseNotes(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const { releases } = data;
  if (!Array.isArray(releases)) return [];

  return releases
    .filter(r => r && typeof r === 'object' && !Array.isArray(r))
    .map(r => ({
      version: typeof r.version === 'string' ? r.version : '',
      date: typeof r.date === 'string' ? r.date : '',
      highlights: Array.isArray(r.highlights)
        ? r.highlights.filter(h => typeof h === 'string' && h.trim() !== '')
        : [],
    }));
}

/**
 * `current` が `lastSeen` より新しいバージョンかを返す（未読バッジ判定）。
 * ドット区切りの数値を左から比較する単純な semver 比較。数値以外の要素は 0 扱い。
 *
 * @param {string} current  現行バージョン（package.json）
 * @param {string|null|undefined} lastSeen 最後に閲覧したバージョン
 * @returns {boolean} lastSeen が無い、または current > lastSeen のとき true
 */
export function isNewerVersion(current, lastSeen) {
  if (typeof current !== 'string' || current === '') return false;
  if (typeof lastSeen !== 'string' || lastSeen === '') return true;
  const toParts = v => v.split('.').map(n => {
    const x = parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  const a = toParts(current);
  const b = toParts(lastSeen);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}
