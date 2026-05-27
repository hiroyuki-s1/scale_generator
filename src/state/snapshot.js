/**
 * editStateを保存用の独立スナップショットに複製する（Set/Array/Objectすべて新規生成）。
 */
export function cloneEditAsSnapshot(edit) {
  return {
    rootIndex: edit.rootIndex,
    activeDegrees: new Set(edit.activeDegrees),
    presetName: edit.presetName,
    mask: { ...edit.mask },
    degreeColors: cloneColors(edit.degreeColors),
  };
}

export function cloneColors(colors) {
  return colors.map(c => ({ ...c }));
}
