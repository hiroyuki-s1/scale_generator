import { computeFretNotes } from './fretboard.js';

/**
 * 表示ポジション（異弦同音の表示/非表示）の pure ロジック。
 * 仕様: docs/features/POSITION_VISIBILITY.md。
 *
 * `visiblePositions` は「表示する位置の実体集合」(Set<string>)。`null` は未設定＝全表示。
 * キー形式: `g{fret}s{string}`（string は 0 始まりの弦番号）。1キー = 指板の1ドット。
 */

const POS_KEY_RE = /^g\d+s\d+$/;

/** ノート {fret,string} から位置キー `g{fret}s{string}` を作る。 */
export function posKey(note) {
  return `g${note.fret}s${note.string}`;
}

/** 位置キーの形式が正しいか。 */
export function isPosKey(key) {
  return typeof key === 'string' && POS_KEY_RE.test(key);
}

/**
 * スケールのアクティブな全ノートの位置キー集合を返す（マスク非依存＝全フレット）。
 * プリセット選択／リセット時の「表示集合の再構築」に使う。
 */
export function allActivePositionKeys(scale) {
  const full = { ...scale, mask: { enabled: false } };
  const keys = new Set();
  for (const n of computeFretNotes(full)) keys.add(posKey(n));
  return keys;
}

/** 位置キー1つの表示/非表示をトグルした新しい Set を返す（不変）。 */
export function toggleVisible(set, key) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** 保存用に Set→Array、null→null に変換。 */
export function serializeVisible(set) {
  return set instanceof Set ? [...set] : null;
}

/**
 * 読込用に Array→Set（不正キーを除去）。配列でも null でもない不正値は null。
 *  - 配列なら有効キーだけの Set（有効キーが無ければ空 Set＝全非表示は許容）
 *  - null は null（全表示）
 */
export function deserializeVisible(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return new Set(value.filter(isPosKey));
}

/**
 * 編集状態の変化に応じて visiblePositions を再構築する（store 側で集中管理）。
 * 仕様の更新ルール:
 *  - プリセット選択 / ルート・楽器変更 → 全アクティブ位置で再構築
 *  - カスタム度数トグル → 旧 visible を新アクティブで間引き、増えた度数分を追加
 *  - 個別タップ（visiblePositions だけ変化）→ そのまま（再構築しない）
 *
 * @param {object|null} prev 直前の edit
 * @param {object} next 新しい edit
 * @returns {Set<string>|null} next が持つべき visiblePositions
 */
export function reconcileVisible(prev, next) {
  if (!prev) return next.visiblePositions;

  const rootChanged  = prev.rootIndex !== next.rootIndex;
  const instrChanged = prev.instrument !== next.instrument;
  const presetSelected = next.presetName != null && prev.presetName !== next.presetName;
  const degreesChanged = prev.activeDegrees !== next.activeDegrees;

  if (rootChanged || instrChanged || presetSelected) {
    return allActivePositionKeys(next);
  }

  if (degreesChanged) {
    const nextAll = allActivePositionKeys(next);
    if (!(next.visiblePositions instanceof Set)) {
      // 未設定 → 全アクティブ位置で材化
      return nextAll;
    }
    const prevAll = allActivePositionKeys(prev);
    const reconciled = new Set();
    // 旧 visible を新アクティブで間引き（消えた度数の位置は落ちる）
    for (const k of next.visiblePositions) if (nextAll.has(k)) reconciled.add(k);
    // 増えた度数の位置を追加（表示）
    for (const k of nextAll) if (!prevAll.has(k)) reconciled.add(k);
    return reconciled;
  }

  // それ以外（個別タップ等）はそのまま
  return next.visiblePositions;
}
