import type { ChordCandidate, PitchClass } from '../domain/theory';
import { midiToNoteName } from './pitch';

export type VoiceMoveKind = 'common' | 'step' | 'leap';

export interface VoiceMove {
  fromPitch: number;
  toPitch: number;
  fromName: string;
  toName: string;
  semitones: number;
  kind: VoiceMoveKind;
}

export interface VoiceLeadingAnalysis {
  moves: VoiceMove[];
  commonTones: number;
  totalSemitoneMovement: number;
  /** Smoothness score from 0 to 100 (100 = maximally smooth / stepwise). */
  smoothness: number;
  label: 'Very Smooth' | 'Smooth' | 'Moderate' | 'Wide Leap';
  summary: string;
}

/**
 * Builds MIDI pitches for a chord in a specific inversion (0 = root, 1 = 1st, 2 = 2nd).
 */
export function buildChordVoicing(
  rootPc: PitchClass,
  intervals: number[],
  inversion = 0,
  baseOctave = 3,
): number[] {
  const baseMidi = (baseOctave + 1) * 12 + rootPc;
  const pitches = intervals.map((semi) => baseMidi + semi);
  const inv = ((inversion % pitches.length) + pitches.length) % pitches.length;
  for (let i = 0; i < inv; i++) {
    pitches[i] += 12;
  }
  return pitches.sort((a, b) => a - b);
}

/**
 * Finds the smoothest inversion/voicing of `targetChord` relative to `prevPitches`,
 * and computes individual voice-to-voice movements.
 */
export function analyzeVoiceLeading(
  prevChord: ChordCandidate,
  nextChord: ChordCandidate,
  prevPitchesOverride?: number[],
): VoiceLeadingAnalysis {
  const prevPitches =
    prevPitchesOverride && prevPitchesOverride.length > 0
      ? [...prevPitchesOverride].sort((a, b) => a - b)
      : buildChordVoicing(prevChord.rootPc, prevChord.definition.intervals, 0, 3);

  const prevCenter =
    prevPitches.reduce((sum, p) => sum + p, 0) / Math.max(1, prevPitches.length);

  // Pick the inversion of nextChord whose center is closest to prevCenter
  let bestNext = buildChordVoicing(nextChord.rootPc, nextChord.definition.intervals, 0, 3);
  let bestDist = Infinity;

  for (let oct = 2; oct <= 4; oct++) {
    for (let inv = 0; inv < Math.min(3, nextChord.definition.intervals.length); inv++) {
      const candidate = buildChordVoicing(
        nextChord.rootPc,
        nextChord.definition.intervals,
        inv,
        oct,
      );
      const center = candidate.reduce((s, p) => s + p, 0) / candidate.length;
      const dist = Math.abs(center - prevCenter);
      if (dist < bestDist) {
        bestDist = dist;
        bestNext = candidate;
      }
    }
  }

  // Greedy closest-voice matching (preferring common tones first, then smallest semitone step)
  const usedPrev = new Set<number>();
  const usedNext = new Set<number>();
  const moves: VoiceMove[] = [];

  // Pass 1: exact common tones (same MIDI pitch or same pitch class within octave)
  for (let i = 0; i < prevPitches.length; i++) {
    for (let j = 0; j < bestNext.length; j++) {
      if (usedNext.has(j)) continue;
      if (prevPitches[i] === bestNext[j]) {
        usedPrev.add(i);
        usedNext.add(j);
        moves.push({
          fromPitch: prevPitches[i],
          toPitch: bestNext[j],
          fromName: midiToNoteName(prevPitches[i]),
          toName: midiToNoteName(bestNext[j]),
          semitones: 0,
          kind: 'common',
        });
        break;
      }
    }
  }

  // Pass 2: match remaining voices by smallest pitch distance
  const remPrev = prevPitches
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !usedPrev.has(i));
  const remNext = bestNext
    .map((p, j) => ({ p, j }))
    .filter(({ j }) => !usedNext.has(j));

  const pairCount = Math.min(remPrev.length, remNext.length);
  for (let k = 0; k < pairCount; k++) {
    const fromP = remPrev[k].p;
    const toP = remNext[k].p;
    const dist = Math.abs(toP - fromP);
    const kind: VoiceMoveKind =
      dist === 0 ? 'common' : dist <= 2 ? 'step' : 'leap';
    moves.push({
      fromPitch: fromP,
      toPitch: toP,
      fromName: midiToNoteName(fromP),
      toName: midiToNoteName(toP),
      semitones: toP - fromP,
      kind,
    });
  }

  moves.sort((a, b) => a.fromPitch - b.fromPitch);

  const commonTones = moves.filter((m) => m.kind === 'common').length;
  const totalSemitoneMovement = moves.reduce(
    (sum, m) => sum + Math.abs(m.semitones),
    0,
  );
  const avgMove = totalSemitoneMovement / Math.max(1, moves.length);
  const smoothness = Math.max(0, Math.min(100, Math.round(100 - avgMove * 18)));

  const label: VoiceLeadingAnalysis['label'] =
    smoothness >= 82
      ? 'Very Smooth'
      : smoothness >= 64
        ? 'Smooth'
        : smoothness >= 45
          ? 'Moderate'
          : 'Wide Leap';

  const parts = moves.slice(0, 3).map((m) =>
    m.semitones === 0
      ? `${m.fromName} stays shared`
      : `${m.fromName}→${m.toName} (${m.semitones > 0 ? '+' : ''}${m.semitones}st)`,
  );
  const summary =
    parts.length > 0
      ? `${label}: ${parts.join(', ')}.`
      : `${label} transition.`;

  return {
    moves,
    commonTones,
    totalSemitoneMovement,
    smoothness,
    label,
    summary,
  };
}
