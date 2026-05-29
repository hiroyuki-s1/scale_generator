/**
 * 直前に描画した saved 配列 `prev` と、新しい `next` を比較し、
 * 再描画が必要か返す。追加・削除・並べ替え・内容更新（オブジェクト差し替え）の
 * いずれでも true。位置ごとの参照同一性で判定するため、内容更新（同じ id でも
 * 新しいオブジェクトに差し替わる）も検知できる。
 */
export function savedListChanged(prev, next) {
  if (!prev || prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) return true;
  }
  return false;
}

/**
 * 「色だけ変わった」変更かどうかを判定する。色は一括設定なので、色変更時は
 * カードを全部作り直して fadeUp アニメを走らせず、SVG とレジェンドだけ
 * その場で塗り直したい。判定条件:
 *   - 配列長が同じで
 *   - 各位置の id / title / rootIndex / presetName / mode / instrument /
 *     activeDegrees / mask が一致し
 *   - 少なくとも 1 件はオブジェクト参照が新しくなっている（=何らかの更新があった）
 *
 * 上記をすべて満たすなら、残るのは degreeColors のみが変わっている＝色のみ更新。
 */
export function colorOnlyUpdate(prev, next) {
  if (!prev || prev.length !== next.length) return false;
  let anyChange = false;
  for (let i = 0; i < next.length; i++) {
    const p = prev[i], n = next[i];
    if (p === n) continue;
    anyChange = true;
    if (
      p.id !== n.id ||
      p.title !== n.title ||
      p.rootIndex !== n.rootIndex ||
      p.presetName !== n.presetName ||
      p.mode !== n.mode ||
      p.instrument !== n.instrument ||
      p.activeDegrees !== n.activeDegrees ||
      p.mask !== n.mask
    ) return false;
  }
  return anyChange;
}
