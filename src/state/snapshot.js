/**
 * editStateを保存用の独立スナップショットに複製する（Set/Array/Objectすべて新規生成）。
 */
export function cloneEditAsSnapshot(edit) {
  return {
    rootIndex: edit.rootIndex,
    activeDegrees: new Set(edit.activeDegrees),
    presetName: edit.presetName,
    mode: edit.mode,
    mask: { ...edit.mask },
    degreeColors: cloneColors(edit.degreeColors),
    instrument: edit.instrument || 'guitar',
  };
}

export function cloneColors(colors) {
  return colors.map(c => ({ ...c }));
}

/**
 * 度数カラーはアプリ全体で共通の一括設定。色を変えたら編集中スケールと
 * 登録済みスケールすべてに同じ色を反映する。
 * @param {object} state
 * @param {Array} nextColors 新しい度数カラー配列
 * @returns {object} 新しい state（edit.degreeColors と全 saved.degreeColors を更新）
 */
export function propagateColors(state, nextColors) {
  return {
    ...state,
    edit: { ...state.edit, degreeColors: cloneColors(nextColors) },
    saved: state.saved.map(s => ({ ...s, degreeColors: cloneColors(nextColors) })),
  };
}
