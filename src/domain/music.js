export function midiToPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function pitchClassToDegree(pitchClass, rootPitchClass) {
  return (((pitchClass - rootPitchClass) % 12) + 12) % 12;
}
