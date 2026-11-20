import type { Note, Section, TimeSignature } from '../domain/music';
import { analyzeSection } from './chordAnalyzer';
import { rankScales } from './scaleAnalyzer';

/**
 * Splits a composition into bar-aligned chord sections, automatically merging
 * consecutive bars when they form a cohesive chord together while prioritizing
 * consistent harmonic rhythm (matching the previous chord section's bar length).
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
    const prevSeg = merged.length >= 2 ? merged[merged.length - 2] : undefined;
    const prevSpanBars = prevSeg ? prevSeg.endBar - prevSeg.startBar : undefined;
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

    // 2. Leading silence followed by notes: start a fresh chord boundary where notes begin
    if (currAnalysis.noteCount === 0) {
      merged.push({ startBar: b, endBar: b + 1 });
      continue;
    }

    const currTop = currAnalysis.topChord;
    const nextTop = nextBarAnalysis.topChord;

    // 3. Exact same detected chord -> merge cleanly (up to 8 bars)
    if (currTop && nextTop && currTop.id === nextTop.id && currSpanBars < 8) {
      curr.endBar = b + 1;
      continue;
    }

    // 4. Harmonic rhythm consistency: if the previous section was N bars (e.g. 2 bars)
    //    and we haven't reached N bars yet, prioritize testing whether the full N-bar
    //    window works cleanly as one chord.
    if (
      prevSpanBars &&
      prevSpanBars > 1 &&
      currSpanBars < prevSpanBars &&
      curr.startBar + prevSpanBars <= barCount &&
      currTop &&
      nextTop
    ) {
      const targetEndBeat = (curr.startBar + prevSpanBars) * beatsPerBar;
      const targetAnalysis = analyzeSection(
        { id: 'tmp-rhythm', start: currStartBeat, end: targetEndBeat },
        notes,
        timeSignature,
        topScale,
      );
      const targetTop = targetAnalysis.topChord;
      if (targetTop && targetTop.noteFit >= 0.72 && targetTop.score >= 58) {
        curr.endBar = b + 1;
        continue;
      }
    }

    // 5. If we already matched the previous section's bar length, prefer keeping
    //    that steady harmonic rhythm rather than loosely absorbing a different chord.
    if (prevSpanBars && currSpanBars >= prevSpanBars) {
      merged.push({ startBar: b, endBar: b + 1 });
      continue;
    }

    // 6. General merge check when no prior rhythm is established yet (e.g. first chord)
    //    Avoid collapsing two distinct bass-anchored chords (e.g. Am -> Fmaj7).
    const currBassPc =
      currAnalysis.bassPitch !== undefined ? currAnalysis.bassPitch % 12 : undefined;
    const nextBassPc =
      nextBarAnalysis.bassPitch !== undefined
        ? nextBarAnalysis.bassPitch % 12
        : undefined;
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
