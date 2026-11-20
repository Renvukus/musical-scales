import { describe, expect, it } from 'vitest';
import type { Composition, Note } from '../src/domain/music';
import { PRESETS } from '../src/state/presets';
import {
  analyzeComposition,
  analyzeSection,
  analyzeSelectedInterval,
  analyzeVoiceLeading,
  buildChordVoicing,
  rankScales,
  resolveSectionChord,
} from '../src/theory';

function n(pitch: number, start: number, duration = 4, velocity = 0.8): Note {
  return { id: `t-${pitch}-${start}`, pitch, start, duration, velocity };
}

describe('Harmonic Analysis Engine', () => {
  it('detects C Major and I-V-vi-IV chords on the pop progression preset', () => {
    const pop = PRESETS.find((p) => p.id === 'pop-progression')!.composition;
    const result = analyzeComposition(pop);

    expect(result.topScale?.displayName).toBe('C Major');
    expect(result.topScale?.outsideNoteCount).toBe(0);

    expect(result.sections['sec-1'].topChord?.symbol).toBe('C');
    expect(result.sections['sec-1'].topChord?.romanNumeral).toBe('I');
    expect(result.sections['sec-1'].topChord?.harmonicFunction).toBe('tonic');

    expect(result.sections['sec-2'].topChord?.symbol).toBe('G');
    expect(result.sections['sec-2'].topChord?.romanNumeral).toBe('V');
    expect(result.sections['sec-2'].topChord?.harmonicFunction).toBe('dominant');

    expect(result.sections['sec-3'].topChord?.symbol).toBe('Am');
    expect(result.sections['sec-3'].topChord?.romanNumeral).toBe('vi');

    // Bar 4 has F-C-A plus a 2-beat sustained E4 -> Fmaj7 (with F triad right behind)
    expect(result.sections['sec-4'].topChord?.symbol).toBe('Fmaj7');
    expect(result.sections['sec-4'].topChord?.romanNumeral).toBe('IVmaj7');
    expect(result.sections['sec-4'].topChord?.harmonicFunction).toBe('predominant');
    expect(result.sections['sec-4'].candidates.slice(0, 2).map((c) => c.symbol)).toContain('F');
  });

  it('distinguishes A Minor from its relative C Major via tonal gravity', () => {
    const minor = PRESETS.find((p) => p.id === 'minor-cinematic')!.composition;
    const result = analyzeComposition(minor);

    expect(result.topScale?.displayName).toBe('A Minor');
    expect(result.topScale?.relativeScaleName).toBe('C Major');
    expect(result.sections['sec-1'].topChord?.symbol).toBe('Am');
    expect(result.sections['sec-1'].topChord?.romanNumeral).toBe('i');
  });

  it('recognizes a borrowed Fm (iv) chord inside C Major without forcing diatonicity', () => {
    const borrowed = PRESETS.find((p) => p.id === 'borrowed-minor-iv')!.composition;
    const result = analyzeComposition(borrowed);

    expect(result.topScale?.displayName).toBe('C Major');
    expect(result.topScale?.outsideNoteCount).toBe(1); // Ab3 in bar 3

    const bar3 = result.sections['sec-3'].topChord;
    expect(bar3?.symbol).toBe('Fm');
    expect(bar3?.isDiatonic).toBe(false);
    expect(bar3?.harmonicFunction).toBe('chromatic');
    expect(bar3?.romanNumeral).toBe('iv');
  });

  it('avoids the superset trap: C-E-G ranks C major triad above Cmaj7 and Cadd9', () => {
    const comp: Composition = {
      title: 'Triad Test',
      tempo: 110,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 4,
      sections: [{ id: 's1', start: 0, end: 4 }],
      notes: [n(48, 0, 4), n(52, 0, 4), n(55, 0, 4)], // C3, E3, G3
    };
    const result = analyzeComposition(comp);
    expect(result.sections['s1'].topChord?.symbol).toBe('C');
  });

  it('identifies chord inversions from the bass note', () => {
    const notes = [n(52, 0, 4), n(55, 0, 4), n(60, 0, 4)]; // E3, G3, C4 (C/E)
    const scales = rankScales(notes, { numerator: 4, denominator: 4 });
    const sec = analyzeSection(
      { id: 's1', start: 0, end: 4 },
      notes,
      { numerator: 4, denominator: 4 },
      scales[0],
    );
    expect(sec.topChord?.symbol).toBe('C');
    expect(sec.topChord?.inversionLabel).toBe('1st inversion');
  });

  it('handles passing tones gracefully and reports outside note count', () => {
    const comp: Composition = {
      title: 'Passing Tone',
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 4,
      sections: [{ id: 's1', start: 0, end: 4 }],
      notes: [
        n(48, 0, 4, 0.8), // C3
        n(52, 0, 4, 0.7), // E3
        n(55, 0, 4, 0.7), // G3
        n(66, 2.5, 0.5, 0.5), // short F#4 off-beat passing tone
      ],
    };
    const result = analyzeComposition(comp);
    expect(result.sections['s1'].topChord?.symbol).toBe('C');
    expect(result.sections['s1'].topChord?.outsideNoteCount).toBe(1);
    expect(result.sections['s1'].topChord?.outsidePitchNames).toContain('F#');
  });

  it('resolves automatic chords constrained by harmonic role (e.g. Dominant) or chord type', () => {
    const comp: Composition = {
      title: 'Constraint Test',
      tempo: 140,
      timeSignature: { numerator: 4, denominator: 4 },
      totalBeats: 4,
      sections: [
        {
          id: 's1',
          start: 0,
          end: Infinity,
          chordConstraint: { harmonicFunction: 'dominant' },
        },
      ],
      notes: [
        n(48, 0, 4, 0.8), // C3
        n(52, 0, 4, 0.7), // E3
        n(55, 0, 4, 0.7), // G3
      ],
    };
    const result = analyzeComposition(comp);
    const resolved = resolveSectionChord(comp.sections[0], result.sections['s1']);
    expect(resolved?.harmonicFunction).toBe('dominant');
    expect(resolved?.symbol).toMatch(/^G|^B/);

    // Also test combining Dominant + 7th
    const seventhSec = {
      ...comp.sections[0],
      chordConstraint: { harmonicFunction: 'dominant' as const, qualityFamily: 'seventh' as const },
    };
    const resolved7 = resolveSectionChord(seventhSec, result.sections['s1']);
    expect(resolved7?.harmonicFunction).toBe('dominant');
    expect(resolved7?.quality).toMatch(/7|m7b5/);
  });

  it('builds root, 1st, and 2nd inversion voicings accurately', () => {
    const root = buildChordVoicing(0, [0, 4, 7], 0, 3); // C3, E3, G3
    const first = buildChordVoicing(0, [0, 4, 7], 1, 3); // E3, G3, C4
    const second = buildChordVoicing(0, [0, 4, 7], 2, 3); // G3, C4, E4
    expect(root).toEqual([48, 52, 55]);
    expect(first).toEqual([52, 55, 60]);
    expect(second).toEqual([55, 60, 64]);
  });

  it('analyzes smooth voice leading between C major and F major (shared C, stepwise E->F and G->A)', () => {
    const pop = PRESETS.find((p) => p.id === 'pop-progression')!.composition;
    const result = analyzeComposition(pop);
    const cChord = result.sections['sec-1'].candidates.find((c) => c.id === '0:maj')!;
    const fChord = result.sections['sec-4'].candidates.find((c) => c.id === '5:maj')!;
    const vl = analyzeVoiceLeading(cChord, fChord);

    expect(vl.commonTones).toBeGreaterThanOrEqual(1);
    expect(vl.smoothness).toBeGreaterThanOrEqual(75);
    expect(vl.moves.length).toBe(3);
  });

  it('identifies intervals and consonance for selected notes', () => {
    const maj3 = analyzeSelectedInterval([n(60, 0, 1), n(64, 0, 1)]);
    expect(maj3?.name).toContain('Major 3rd');
    expect(maj3?.semitones).toBe(4);
    expect(maj3?.consonance).toBe('Warm Consonance');

    const tritone = analyzeSelectedInterval([n(60, 0, 1), n(66, 0, 1)]);
    expect(tritone?.name).toContain('Tritone');
    expect(tritone?.consonance).toBe('Sharp Dissonance');
  });
});
