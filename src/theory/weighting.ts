import type { Note, TimeSignature } from '../domain/music';
import type { PitchClass } from '../domain/theory';
import { toPitchClass } from './pitch';

export interface WeightedNote {
  note: Note;
  pitchClass: PitchClass;
  /** Effective duration inside the analyzed window (in beats). */
  effectiveDuration: number;
  /** Combined musical salience weight. */
  weight: number;
  isBass: boolean;
}

export interface PitchProfile {
  /** Total salience weight per pitch class (index 0..11). */
  pcWeights: number[];
  totalWeight: number;
  weightedNotes: WeightedNote[];
  bassNote?: Note;
  bassPc?: PitchClass;
  firstNote?: Note;
  lastNote?: Note;
}

/**
 * Estimates rhythmic strength of a beat position within a measure.
 * Downbeats (beat 0) carry more harmonic weight than off-beat passing notes.
 */
function beatStrength(beat: number, beatsPerBar: number): number {
  const posInBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  if (Math.abs(posInBar) < 0.05) return 1.35; // Beat 1 (downbeat)
  if (beatsPerBar === 4 && Math.abs(posInBar - 2) < 0.05) return 1.15; // Beat 3
  if (Math.abs(posInBar - Math.round(posInBar)) < 0.05) return 1.0; // On-beat
  if (Math.abs(posInBar * 2 - Math.round(posInBar * 2)) < 0.05) return 0.8; // Eighth
  return 0.65; // Sixteenth / passing
}

/**
 * Computes a weighted pitch-class profile for a list of notes,
 * optionally clipped to a [windowStart, windowEnd) beat range.
 */
export function buildPitchProfile(
  notes: Note[],
  timeSignature: TimeSignature,
  windowStart?: number,
  windowEnd?: number,
): PitchProfile {
  const pcWeights = new Array<number>(12).fill(0);
  const beatsPerBar = timeSignature.numerator;

  const overlapping: Array<{ note: Note; effectiveDuration: number }> = [];
  for (const note of notes) {
    if (note.muted) continue;
    const noteEnd = note.start + note.duration;
    if (windowStart !== undefined && windowEnd !== undefined) {
      const overlapStart = Math.max(note.start, windowStart);
      const overlapEnd = Math.min(noteEnd, windowEnd);
      const overlap = overlapEnd - overlapStart;
      if (overlap <= 0.001) continue;
      overlapping.push({ note, effectiveDuration: overlap });
    } else {
      overlapping.push({ note, effectiveDuration: note.duration });
    }
  }

  if (overlapping.length === 0) {
    return { pcWeights, totalWeight: 0, weightedNotes: [] };
  }

  // Identify lowest pitch (bass) and earliest/latest notes
  let minPitch = Infinity;
  let bassNote: Note | undefined;
  let firstNote: Note | undefined;
  let lastNote: Note | undefined;

  for (const { note } of overlapping) {
    if (note.pitch < minPitch) {
      minPitch = note.pitch;
      bassNote = note;
    }
    if (!firstNote || note.start < firstNote.start) {
      firstNote = note;
    }
    if (!lastNote || note.start + note.duration > lastNote.start + lastNote.duration) {
      lastNote = note;
    }
  }

  const weightedNotes: WeightedNote[] = [];
  let totalWeight = 0;

  for (const { note, effectiveDuration } of overlapping) {
    const pc = toPitchClass(note.pitch);
    const isBass = note.pitch <= minPitch + 2 && overlapping.length > 1;
    // Sublinear duration scaling so one 4-beat drone doesn't erase everything else
    const durationFactor = Math.pow(Math.max(effectiveDuration, 0.125), 0.7);
    const rhythmFactor = beatStrength(note.start, beatsPerBar);
    const velocityFactor = 0.55 + 0.45 * Math.min(1, Math.max(0, note.velocity));
    const bassFactor = isBass ? 1.35 : 1.0;

    const weight = durationFactor * rhythmFactor * velocityFactor * bassFactor;
    pcWeights[pc] += weight;
    totalWeight += weight;

    weightedNotes.push({
      note,
      pitchClass: pc,
      effectiveDuration,
      weight,
      isBass,
    });
  }

  return {
    pcWeights,
    totalWeight,
    weightedNotes,
    bassNote,
    bassPc: bassNote ? toPitchClass(bassNote.pitch) : undefined,
    firstNote,
    lastNote,
  };
}
