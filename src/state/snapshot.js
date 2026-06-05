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
    // 表示ポジション（Set）はスケール単位で独立複製。null は全表示。
    visiblePositions: edit.visiblePositions ? new Set(edit.visiblePositions) : null,
  };
}

export function cloneColors(colors) {
  return colors.map(c => ({ ...c }));
}

/**
 * 度数カラーは「スケールごとの個別設定」。色変更は編集中スケール（または対象の
 * 1スケール）にのみ反映し、自動伝播はしない（docs/features/DEGREE_COLORS.md）。
 *
 * 「一括反映」ボタンを押したときだけ、与えた colors を全 saved スケールへ明示的に
 * 上書きする。edit は変更しない（呼び出し側が edit.degreeColors を渡す想定）。
 *
 * @param {object} state
 * @param {Array} colors 全 saved に適用する度数カラー配列（通常は edit.degreeColors）
 * @returns {object} 新しい state（全 saved.degreeColors を独立クローンで上書き）
 */
export function applyColorsToAllSaved(state, colors) {
  return {
    ...state,
    saved: state.saved.map(s => ({ ...s, degreeColors: cloneColors(colors) })),
  };
}
