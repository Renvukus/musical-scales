import type { Note } from '../domain/music';
import { intervalName, midiToNoteName } from './pitch';

export type ConsonanceLevel =
  | 'Perfect Consonance'
  | 'Warm Consonance'
  | 'Mild Tension'
  | 'Sharp Dissonance';

export interface IntervalAnalysis {
  lowPitch: number;
  highPitch: number;
  lowName: string;
  highName: string;
  semitones: number;
  name: string;
  consonance: ConsonanceLevel;
  description: string;
}

const CONSONANCE_TABLE: Record<
  number,
  { consonance: ConsonanceLevel; description: string }
> = {
  0: {
    consonance: 'Perfect Consonance',
    description: 'Unison / Octave — completely fused, reinforces the same pitch class.',
  },
  1: {
    consonance: 'Sharp Dissonance',
    description: 'Half-step crunch — strong leading-tone or chromatic pull demanding resolution.',
  },
  2: {
    consonance: 'Mild Tension',
    description: 'Whole-step warmth — adds open modern color (sus2 / add9) or melodic motion.',
  },
  3: {
    consonance: 'Warm Consonance',
    description: 'Defines minor chord emotion — intimate, bittersweet, and expressive.',
  },
  4: {
    consonance: 'Warm Consonance',
    description: 'Defines major chord brightness — clear, stable, and uplifting.',
  },
  5: {
    consonance: 'Perfect Consonance',
    description: 'Open, spacious interval — foundational in sus4 chords and strong bass motion.',
  },
  6: {
    consonance: 'Sharp Dissonance',
    description: 'The tritone — symmetrical maximum tension that drives dominant 7th resolutions.',
  },
  7: {
    consonance: 'Perfect Consonance',
    description: 'Rock-solid harmonic pillar — gives triads and power chords their strength.',
  },
  8: {
    consonance: 'Warm Consonance',
    description: 'Inverted major 3rd — lush, yearning minor-key color.',
  },
  9: {
    consonance: 'Warm Consonance',
    description: 'Inverted minor 3rd — sweet, pastoral, and warm melodic leap.',
  },
  10: {
    consonance: 'Mild Tension',
    description: 'Smooth bluesy/jazzy 7th — adds forward motion without harshness.',
  },
  11: {
    consonance: 'Mild Tension',
    description: 'Dreamy major 7th shimmer — nostalgic tension that glows in upper voicings.',
  },
};

/**
 * Analyzes the interval between the lowest and highest notes in a selection (2+ notes).
 */
export function analyzeSelectedInterval(notes: Note[]): IntervalAnalysis | null {
  if (notes.length < 2) return null;
  const sorted = [...notes].sort((a, b) => a.pitch - b.pitch);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  const semitones = high.pitch - low.pitch;
  const mod = semitones % 12;
  const octaves = Math.floor(semitones / 12);

  let name = intervalName(mod);
  if (semitones === 12) name = 'Octave (8va)';
  else if (octaves >= 1 && mod === 0) name = `${octaves} Octaves`;
  else if (octaves >= 1) name = `${intervalName(mod)} + ${octaves} oct`;

  const info = CONSONANCE_TABLE[mod] ?? {
    consonance: 'Warm Consonance' as const,
    description: 'Melodic or harmonic interval.',
  };

  return {
    lowPitch: low.pitch,
    highPitch: high.pitch,
    lowName: midiToNoteName(low.pitch),
    highName: midiToNoteName(high.pitch),
    semitones,
    name,
    consonance: info.consonance,
    description: info.description,
  };
}
