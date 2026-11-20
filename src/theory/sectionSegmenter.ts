import type { Note, Section, TimeSignature } from '../domain/music';
import { analyzeSection } from './chordAnalyzer';
import { rankScales } from './scaleAnalyzer';

/**
 * Splits a composition into bar-aligned chord sections, automatically merging
 * consecutive bars when they form a strong, cohesive chord together (or when
 * a trailing bar is empty/silent).
 */
export function suggestInitialSections(
  notes: Note[],
  timeSignature: TimeSignature,
  totalBars: number,
): Section[] {
  const beatsPerBar = timeSignature.numerator;
  const barCount = Math.max(1, totalBars);

  if (notes.length === 0) {
    return Array.from({ length: barCount }, (_, b) => ({
      id: `sec-${b + 1}`,
      start: b * beatsPerBar,
      end: b === barCount - 1 ? Infinity : (b + 1) * beatsPerBar,
    }));
  }

  const topScale = rankScales(notes, timeSignature)[0];
  const barAnalyses = Array.from({ length: barCount }, (_, b) =>
    analyzeSection(
      { id: `bar-${b}`, start: b * beatsPerBar, end: (b + 1) * beatsPerBar },
      notes,
      timeSignature,
      topScale,
    ),
  );

  const merged: Array<{ startBar: number; endBar: number }> = [
    { startBar: 0, endBar: 1 },
  ];

  for (let b = 1; b < barCount; b++) {
    const curr = merged[merged.length - 1];
    const currSpanBars = curr.endBar - curr.startBar;
    const nextBarAnalysis = barAnalyses[b];

    const currStartBeat = curr.startBar * beatsPerBar;
    const currEndBeat = curr.endBar * beatsPerBar;
    const nextEndBeat = (b + 1) * beatsPerBar;

    const currAnalysis =
      currSpanBars === 1
        ? barAnalyses[curr.startBar]
        : analyzeSection(
            { id: 'tmp-curr', start: currStartBeat, end: currEndBeat },
            notes,
            timeSignature,
            topScale,
          );

    // 1. Empty trailing bar: absorb into the current chord section
    if (nextBarAnalysis.noteCount === 0) {
      curr.endBar = b + 1;
      continue;
    }

    // 2. Leading silence followed by notes: keep a fresh chord boundary where notes begin
    if (currAnalysis.noteCount === 0) {
      merged.push({ startBar: b, endBar: b + 1 });
      continue;
    }

    const currTop = currAnalysis.topChord;
    const nextTop = nextBarAnalysis.topChord;

    // 3. Exact same detected chord in both -> merge cleanly (up to 8 bars)
    if (currTop && nextTop && currTop.id === nextTop.id && currSpanBars < 8) {
      curr.endBar = b + 1;
      continue;
    }

    // 4. Otherwise test if combining into one chord still fits well (cap at 4 bars).
    //    If both bars already have distinct bass notes and strong individual chords
    //    (e.g. Am -> Fmaj7), keep them separate instead of collapsing into a 7th chord.
    const currBassPc = currAnalysis.bassPitch !== undefined ? currAnalysis.bassPitch % 12 : undefined;
    const nextBassPc = nextBarAnalysis.bassPitch !== undefined ? nextBarAnalysis.bassPitch % 12 : undefined;
    const distinctStrongBass =
      currBassPc !== undefined &&
      nextBassPc !== undefined &&
      currBassPc !== nextBassPc &&
      currAnalysis.noteCount >= 3 &&
      nextBarAnalysis.noteCount >= 3;

    if (!distinctStrongBass && currSpanBars < 4 && currTop && nextTop) {
      const combined = analyzeSection(
        { id: 'tmp-comb', start: currStartBeat, end: nextEndBeat },
        notes,
        timeSignature,
        topScale,
      );
      const combTop = combined.topChord;
      const minIndividualFit = Math.min(currTop.noteFit, nextTop.noteFit);
      if (
        combTop &&
        combTop.noteFit >= 0.85 &&
        combTop.score >= 68 &&
        combTop.noteFit >= minIndividualFit - 0.06
      ) {
        curr.endBar = b + 1;
        continue;
      }
    }

    merged.push({ startBar: b, endBar: b + 1 });
  }

  return merged.map((seg, idx) => ({
    id: `sec-${idx + 1}`,
    start: seg.startBar * beatsPerBar,
    end: idx === merged.length - 1 ? Infinity : seg.endBar * beatsPerBar,
  }));
}
