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
