import type {
  ChordCandidate,
  ChordQuality,
  HarmonicFunction,
  PitchClass,
  ScaleCandidate,
} from '../domain/theory';
import { pitchClassName, prefersFlats, semitoneDistance } from './pitch';

const ROMAN_UPPER = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const ROMAN_LOWER = ['i', 'bii', 'ii', 'biii', 'iii', 'iv', '#iv', 'v', 'bvi', 'vi', 'bvii', 'vii'];

function isMinorQuality(q: ChordQuality): boolean {
  return q === 'min' || q === 'min7' || q === 'dim' || q === 'dim7' || q === 'm7b5';
}

export function getRomanNumeral(
  chordRootPc: PitchClass,
  quality: ChordQuality,
  scaleRootPc: PitchClass,
): string {
  const interval = (((chordRootPc - scaleRootPc) % 12) + 12) % 12;
  const base = isMinorQuality(quality) ? ROMAN_LOWER[interval] : ROMAN_UPPER[interval];
  switch (quality) {
    case 'dim':
      return `${base}°`;
    case 'dim7':
      return `${base}°7`;
    case 'm7b5':
      return `${base}ø7`;
    case 'aug':
      return `${base}+`;
    case 'maj7':
      return `${base}maj7`;
    case 'min7':
    case '7':
      return `${base}7`;
    case 'sus2':
      return `${base}sus2`;
    case 'sus4':
      return `${base}sus4`;
    case 'add9':
      return `${base}add9`;
    default:
      return base;
  }
}

export function classifyHarmonicFunction(
  chordRootPc: PitchClass,
  chordPitchClasses: PitchClass[],
  quality: ChordQuality,
  scale?: ScaleCandidate,
): { harmonicFunction: HarmonicFunction; isDiatonic: boolean; romanNumeral: string } {
  if (!scale) {
    return {
      harmonicFunction: 'tonic',
      isDiatonic: true,
      romanNumeral: '—',
    };
  }

  const scaleSet = new Set<number>(scale.pitchClasses);
  const isDiatonic = chordPitchClasses.every((pc) => scaleSet.has(pc));
  const romanNumeral = getRomanNumeral(chordRootPc, quality, scale.rootPc);
  const degreeSemitones = (((chordRootPc - scale.rootPc) % 12) + 12) % 12;

  if (!isDiatonic) {
    // Recognize V / V7 in minor as dominant (harmonic minor pull)
    if (degreeSemitones === 7 && (quality === 'maj' || quality === '7')) {
      return { harmonicFunction: 'dominant', isDiatonic: false, romanNumeral };
    }
    return { harmonicFunction: 'chromatic', isDiatonic: false, romanNumeral };
  }

  if (degreeSemitones === 0 || degreeSemitones === 9 || degreeSemitones === 8 || degreeSemitones === 4 || degreeSemitones === 3) {
    return { harmonicFunction: 'tonic', isDiatonic: true, romanNumeral };
  }
  if (degreeSemitones === 2 || degreeSemitones === 5) {
    return { harmonicFunction: 'predominant', isDiatonic: true, romanNumeral };
  }
  if (degreeSemitones === 7 || degreeSemitones === 11 || degreeSemitones === 10) {
    return { harmonicFunction: 'dominant', isDiatonic: true, romanNumeral };
  }

  return { harmonicFunction: 'chromatic', isDiatonic, romanNumeral };
}

/**
 * Evaluates how smoothly a candidate chord follows the previous section's chord.
 * Returns a normalized 0..1 score + count of shared common tones.
 */
export function evaluateTransition(
  prevChord: ChordCandidate | undefined,
  candidateRootPc: PitchClass,
  candidatePcs: PitchClass[],
  candidateFunc: HarmonicFunction,
): { progressionFit: number; commonTones: number } {
  if (!prevChord) {
    return { progressionFit: 0.5, commonTones: 0 };
  }

  const prevSet = new Set<number>(prevChord.pitchClasses);
  let commonTones = 0;
  for (const pc of candidatePcs) {
    if (prevSet.has(pc)) commonTones++;
  }

  // Root movement interval (in semitones upward from prev -> candidate)
  const rootMove = (((candidateRootPc - prevChord.rootPc) % 12) + 12) % 12;

  let rootMotionScore = 0.45;
  if (rootMove === 5) rootMotionScore = 1.0; // Down a 5th (e.g., V -> I, ii -> V) — strongest resolution
  else if (rootMove === 7) rootMotionScore = 0.85; // Up a 5th (e.g., I -> V, IV -> I)
  else if (rootMove === 2 || rootMove === 10) rootMotionScore = 0.8; // Stepwise (IV -> V, VI -> VII)
  else if (rootMove === 9 || rootMove === 3 || rootMove === 4 || rootMove === 8) {
    rootMotionScore = 0.78; // Third relation (I -> vi, I -> iii)
  } else if (rootMove === 0) {
    rootMotionScore = 0.6; // Same root (sustaining or changing quality)
  }

  // Functional flow bonus
  let funcScore = 0.55;
  const pf = prevChord.harmonicFunction;
  if (pf === 'dominant' && candidateFunc === 'tonic') funcScore = 1.0;
  else if (pf === 'predominant' && candidateFunc === 'dominant') funcScore = 0.95;
  else if (pf === 'tonic' && candidateFunc === 'predominant') funcScore = 0.9;
  else if (pf === 'tonic' && candidateFunc === 'dominant') funcScore = 0.85;
  else if (pf === 'predominant' && candidateFunc === 'tonic') funcScore = 0.8; // Plagal cadence

  // Voice-leading proximity (average closest semitone distance)
  let minDistSum = 0;
  for (const pc of candidatePcs) {
    let best = 12;
    for (const prevPc of prevChord.pitchClasses) {
      best = Math.min(best, semitoneDistance(pc, prevPc));
    }
    minDistSum += best;
  }
  const avgMove = minDistSum / candidatePcs.length;
  const voiceLeadingScore = Math.max(0, 1 - avgMove / 4.5);

  const progressionFit =
    rootMotionScore * 0.4 + funcScore * 0.35 + voiceLeadingScore * 0.25;

  return { progressionFit, commonTones };
}

/**
 * Generates 3 practical next-chord ideas relative to the active scale and current chord.
 */
export function buildNextChordSuggestions(
  chordRootPc: PitchClass,
  harmonicFunction: HarmonicFunction,
  scale?: ScaleCandidate,
): ChordCandidate['nextChordSuggestions'] {
  if (!scale) return [];

  const isMinor =
    scale.definition.category === 'minor' ||
    scale.definition.id === 'dorian' ||
    scale.definition.id === 'phrygian';
  const useFlats = prefersFlats(scale.rootPc, isMinor);

  const makeChord = (
    semitoneOffset: number,
    suffix: string,
    romanNumeral: string,
    reason: string,
    fn: HarmonicFunction,
  ) => {
    const pc = ((scale.rootPc + semitoneOffset) % 12) as PitchClass;
    return {
      symbol: `${pitchClassName(pc, useFlats)}${suffix}`,
      romanNumeral,
      reason,
      harmonicFunction: fn,
    };
  };

  if (isMinor) {
    if (harmonicFunction === 'tonic') {
      return [
        makeChord(8, '', 'VI', 'Opens up with warm, cinematic lift', 'tonic'),
        makeChord(5, 'm', 'iv', 'Deepens emotional pull before a turnaround', 'predominant'),
        makeChord(10, '', 'VII', 'Driving minor-key motion toward III or i', 'dominant'),
      ];
    }
    if (harmonicFunction === 'predominant') {
      return [
        makeChord(7, '', 'V', 'Strong raised-7th tension back to home (i)', 'dominant'),
        makeChord(10, '', 'VII', 'Smooth stepwise lift into i or III', 'dominant'),
        makeChord(0, 'm', 'i', 'Soft plagal resolution back to tonic', 'tonic'),
      ];
    }
    return [
      makeChord(0, 'm', 'i', 'Resolves tension cleanly back to home', 'tonic'),
      makeChord(8, '', 'VI', 'Deceptive resolution for surprise emotion', 'tonic'),
      makeChord(3, '', 'III', 'Brightens into the relative major', 'tonic'),
    ];
  }

  // Major-like scales
  if (harmonicFunction === 'tonic') {
    const isVi = (((chordRootPc - scale.rootPc) % 12) + 12) % 12 === 9;
    if (isVi) {
      return [
        makeChord(5, '', 'IV', 'Classic emotional lift (vi → IV)', 'predominant'),
        makeChord(2, 'm', 'ii', 'Smooth circle-of-fifths motion (vi → ii)', 'predominant'),
        makeChord(7, '', 'V', 'Builds bright momentum toward home', 'dominant'),
      ];
    }
    return [
      makeChord(7, '', 'V', 'Classic energetic move away from home', 'dominant'),
      makeChord(5, '', 'IV', 'Warm, expansive departure from tonic', 'predominant'),
      makeChord(9, 'm', 'vi', 'Shares two notes with I for effortless melancholy', 'tonic'),
    ];
  }

  if (harmonicFunction === 'predominant') {
    return [
      makeChord(7, '', 'V', 'Natural predominant → dominant tension build', 'dominant'),
      makeChord(0, '', 'I', 'Warm, gentle plagal resolution home', 'tonic'),
      makeChord(5, 'm', 'iv', 'Borrowed minor iv adds bittersweet film-score color', 'chromatic'),
    ];
  }

  // Dominant or chromatic
  return [
    makeChord(0, '', 'I', 'Satisfying authentic resolution back to home', 'tonic'),
    makeChord(9, 'm', 'vi', 'Deceptive cadence — keeps the phrase moving', 'tonic'),
    makeChord(5, '', 'IV', 'Softens tension without fully landing yet', 'predominant'),
  ];
}
