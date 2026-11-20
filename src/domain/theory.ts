/**
 * Music theory & harmonic analysis domain models.
 */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type HarmonicFunction =
  | 'tonic'
  | 'predominant'
  | 'dominant'
  | 'chromatic';

export type ScaleCategory = 'diatonic' | 'minor' | 'mode' | 'pentatonic' | 'blues';

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  | 'maj7'
  | 'min7'
  | '7'
  | 'm7b5'
  | 'dim7'
  | 'add9';

export type ChordQualityFamily =
  | 'triad'
  | 'major'
  | 'minor'
  | 'seventh'
  | 'suspended'
  | 'dim-aug';

export interface ChordConstraint {
  harmonicFunction?: HarmonicFunction;
  qualityFamily?: ChordQualityFamily;
}

export interface ScaleDefinition {
  id: string;
  name: string;
  shortName: string;
  category: ScaleCategory;
  intervals: number[];
  mood: string;
  genres: string[];
  description: string;
  tip: string;
  /** Slight simplicity prior so standard scales edge out exotic ones on ties. */
  prior: number;
}

export interface ChordDefinition {
  quality: ChordQuality;
  symbolSuffix: string;
  name: string;
  intervals: number[];
  mood: string;
  genres: string[];
  description: string;
  tip: string;
  /** Complexity penalty weight (0 = triad, higher = extended/altered). */
  complexity: number;
}

export interface ScaleCandidate {
  /** Stable identifier: `${rootPc}:${scaleDefId}` */
  id: string;
  rootPc: PitchClass;
  rootName: string;
  definition: ScaleDefinition;
  displayName: string;
  pitchClasses: PitchClass[];
  noteNames: string[];
  /** Composite fit score from 0 to 100. */
  score: number;
  /** Share of weighted note energy that belongs to this scale (0..1). */
  coverage: number;
  /** Count of distinct note events outside this scale. */
  outsideNoteCount: number;
  /** Pitch-class names of notes falling outside the scale. */
  outsidePitchNames: string[];
  /** Relative scale sharing the exact same pitch classes (e.g., C Major <-> A Minor). */
  relativeScaleName?: string;
  /** Short contextual explanation of why this scale fits (or doesn't). */
  summary: string;
}

export interface ChordCandidate {
  /** Stable identifier: `${rootPc}:${quality}` */
  id: string;
  rootPc: PitchClass;
  rootName: string;
  quality: ChordQuality;
  symbol: string;
  fullName: string;
  definition: ChordDefinition;
  pitchClasses: PitchClass[];
  noteNames: string[];
  /** Composite fit score from 0 to 100. */
  score: number;
  /** Weighted note fit (0..1). */
  noteFit: number;
  /** Progression / neighboring-section smoothness bonus (0..1). */
  progressionFit: number;
  /** Whether the lowest note in the section matches root, 3rd, 5th, etc. */
  bassNoteName?: string;
  inversionLabel?: string;
  /** Roman numeral relative to the active global scale (e.g. "I", "vi", "bVII"). */
  romanNumeral: string;
  harmonicFunction: HarmonicFunction;
  isDiatonic: boolean;
  /** Count of note events in this section falling outside the chord. */
  outsideNoteCount: number;
  /** Pitch names of outside notes in this section. */
  outsidePitchNames: string[];
  /** Shared pitch-class count with the previous section's top/selected chord. */
  commonTonesWithPrev: number;
  /** Contextual explanation of why this chord works here. */
  summary: string;
  /** Practical next-chord suggestions (symbols + Roman numerals). */
  nextChordSuggestions: Array<{
    symbol: string;
    romanNumeral: string;
    reason: string;
    harmonicFunction: HarmonicFunction;
  }>;
}

export interface SectionAnalysis {
  sectionId: string;
  noteCount: number;
  bassPitch?: number;
  candidates: ChordCandidate[];
  topChord?: ChordCandidate;
  /** True when top two candidates are within a tight score margin. */
  isAmbiguous: boolean;
}

export interface CompositionAnalysis {
  scales: ScaleCandidate[];
  topScale?: ScaleCandidate;
  activeScale?: ScaleCandidate;
  sections: Record<string, SectionAnalysis>;
}
