import type { PitchClass } from '../domain/theory';

export const SHARP_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export const FLAT_NAMES = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

/** Keys that conventionally use flats (F, Bb, Eb, Ab, Db, Gb major / D, G, C, F, Bb, Eb minor). */
const FLAT_MAJOR_ROOTS = new Set<number>([5, 10, 3, 8, 1, 6]);
const FLAT_MINOR_ROOTS = new Set<number>([2, 7, 0, 5, 10, 3]);

export function toPitchClass(midi: number): PitchClass {
  return (((midi % 12) + 12) % 12) as PitchClass;
}

export function prefersFlats(rootPc: PitchClass, isMinorLike = false): boolean {
  return isMinorLike
    ? FLAT_MINOR_ROOTS.has(rootPc)
    : FLAT_MAJOR_ROOTS.has(rootPc);
}

export function pitchClassName(pc: PitchClass, useFlats = false): string {
  return useFlats ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
}

export function midiToNoteName(midi: number, useFlats = false): string {
  const pc = toPitchClass(midi);
  const octave = Math.floor(midi / 12) - 1;
  return `${pitchClassName(pc, useFlats)}${octave}`;
}

export function isBlackKey(midi: number): boolean {
  const pc = toPitchClass(midi);
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

const INTERVAL_NAMES: Record<number, string> = {
  0: 'Unison (1)',
  1: 'Minor 2nd (b2)',
  2: 'Major 2nd (2)',
  3: 'Minor 3rd (b3)',
  4: 'Major 3rd (3)',
  5: 'Perfect 4th (4)',
  6: 'Tritone (b5/#4)',
  7: 'Perfect 5th (5)',
  8: 'Minor 6th (b6)',
  9: 'Major 6th (6)',
  10: 'Minor 7th (b7)',
  11: 'Major 7th (7)',
};

export function intervalName(semitones: number): string {
  const mod = ((semitones % 12) + 12) % 12;
  return INTERVAL_NAMES[mod] ?? `${mod} st`;
}

export function semitoneDistance(pcA: PitchClass, pcB: PitchClass): number {
  const diff = Math.abs(pcA - pcB);
  return Math.min(diff, 12 - diff);
}
