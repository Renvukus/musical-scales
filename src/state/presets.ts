import type { Composition, Note, Section } from '../domain/music';

function makeNote(
  id: string,
  pitch: number,
  start: number,
  duration: number,
  velocity = 0.78,
): Note {
  return { id, pitch, start, duration, velocity };
}

function makeFourBarSections(): Section[] {
  return [
    { id: 'sec-1', start: 0, end: 4 },
    { id: 'sec-2', start: 4, end: 8 },
    { id: 'sec-3', start: 8, end: 12 },
    { id: 'sec-4', start: 12, end: Infinity },
  ];
}

export interface CompositionPreset {
  id: string;
  label: string;
  subtitle: string;
  composition: Composition;
}

export const PRESETS: CompositionPreset[] = [
  {
    id: 'pop-progression',
    label: 'C Major — I · V · vi · IV',
    subtitle: 'Classic pop progression + melody with a passing tone',
    composition: {
      title: 'C Major — I · V · vi · IV',
      tempo: 108,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 16,
      sections: makeFourBarSections(),
      notes: [
        // Bar 1: C major (C3, G3, C4, E4) + melody
        makeNote('n1', 48, 0, 4, 0.75),
        makeNote('n2', 55, 0, 4, 0.65),
        makeNote('n3', 60, 0, 4, 0.65),
        makeNote('n4', 64, 0, 1.5, 0.82),
        makeNote('n5', 67, 1.5, 1.5, 0.82),
        makeNote('n6', 69, 3, 1, 0.78), // passing 6th (A4)
        // Bar 2: G major (G2, D3, B3) + melody
        makeNote('n7', 43, 4, 4, 0.75),
        makeNote('n8', 50, 4, 4, 0.65),
        makeNote('n9', 59, 4, 4, 0.65),
        makeNote('n10', 67, 4, 2, 0.82),
        makeNote('n11', 62, 6, 2, 0.78),
        // Bar 3: A minor (A2, E3, C4) + melody
        makeNote('n12', 45, 8, 4, 0.75),
        makeNote('n13', 52, 8, 4, 0.65),
        makeNote('n14', 60, 8, 4, 0.65),
        makeNote('n15', 64, 8, 1.5, 0.82),
        makeNote('n16', 62, 9.5, 0.5, 0.72), // passing tone (D4)
        makeNote('n17', 60, 10, 2, 0.8),
        // Bar 4: F major (F2, C3, A3) + melody
        makeNote('n18', 41, 12, 4, 0.75),
        makeNote('n19', 48, 12, 4, 0.65),
        makeNote('n20', 57, 12, 4, 0.65),
        makeNote('n21', 65, 12, 2, 0.82),
        makeNote('n22', 64, 14, 2, 0.76), // maj7 shimmer (E4)
      ],
    },
  },
  {
    id: 'borrowed-minor-iv',
    label: 'C Major + Borrowed Fm',
    subtitle: 'Shows how a non-diatonic borrowed chord (iv) creates bittersweet pull',
    composition: {
      title: 'C Major + Borrowed Fm',
      tempo: 96,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 16,
      sections: makeFourBarSections(),
      notes: [
        // Bar 1: Cmaj7
        makeNote('b1', 48, 0, 4, 0.72),
        makeNote('b2', 55, 0, 4, 0.64),
        makeNote('b3', 59, 0, 4, 0.64),
        makeNote('b4', 64, 0, 4, 0.75),
        // Bar 2: Fmaj7
        makeNote('b5', 41, 4, 4, 0.72),
        makeNote('b6', 53, 4, 4, 0.64),
        makeNote('b7', 57, 4, 4, 0.64),
        makeNote('b8', 64, 4, 4, 0.75),
        // Bar 3: Fm (borrowed iv — introduces Ab!)
        makeNote('b9', 41, 8, 4, 0.72),
        makeNote('b10', 53, 8, 4, 0.64),
        makeNote('b11', 56, 8, 4, 0.72), // Ab3
        makeNote('b12', 60, 8, 4, 0.75),
        // Bar 4: C major resolution
        makeNote('b13', 48, 12, 4, 0.75),
        makeNote('b14', 52, 12, 4, 0.65),
        makeNote('b15', 55, 12, 4, 0.65),
        makeNote('b16', 60, 12, 4, 0.78),
      ],
    },
  },
  {
    id: 'minor-cinematic',
    label: 'A Minor — i · VI · III · VII',
    subtitle: 'Cinematic natural minor progression',
    composition: {
      title: 'A Minor — i · VI · III · VII',
      tempo: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 16,
      sections: makeFourBarSections(),
      notes: [
        // Bar 1: Am
        makeNote('m1', 45, 0, 4, 0.76),
        makeNote('m2', 52, 0, 4, 0.66),
        makeNote('m3', 57, 0, 4, 0.66),
        makeNote('m4', 60, 0, 2, 0.8),
        makeNote('m5', 64, 2, 2, 0.8),
        // Bar 2: F
        makeNote('m6', 41, 4, 4, 0.76),
        makeNote('m7', 48, 4, 4, 0.66),
        makeNote('m8', 57, 4, 4, 0.66),
        makeNote('m9', 65, 4, 4, 0.78),
        // Bar 3: C
        makeNote('m10', 48, 8, 4, 0.76),
        makeNote('m11', 55, 8, 4, 0.66),
        makeNote('m12', 60, 8, 4, 0.66),
        makeNote('m13', 64, 8, 4, 0.78),
        // Bar 4: G
        makeNote('m14', 43, 12, 4, 0.76),
        makeNote('m15', 50, 12, 4, 0.66),
        makeNote('m16', 55, 12, 4, 0.66),
        makeNote('m17', 59, 12, 2, 0.78),
        makeNote('m18', 62, 14, 2, 0.78),
      ],
    },
  },
  {
    id: 'blank',
    label: 'Blank 4-Bar Canvas',
    subtitle: 'Start composing from scratch',
    composition: {
      title: 'Untitled Sketch',
      tempo: 110,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 16,
      sections: makeFourBarSections(),
      notes: [],
    },
  },
];
