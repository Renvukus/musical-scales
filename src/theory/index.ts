import type { Composition } from '../domain/music';
import type { ChordCandidate, CompositionAnalysis } from '../domain/theory';
import { analyzeSection, resolveSectionChord } from './chordAnalyzer';
import { rankScales } from './scaleAnalyzer';

export * from './pitch';
export * from './catalog';
export * from './weighting';
export * from './scaleAnalyzer';
export * from './chordAnalyzer';
export * from './progressionAnalyzer';
export * from './sectionSegmenter';
export * from './voiceLeading';
export * from './intervals';

/**
 * Runs complete global scale + per-section chord & progression analysis.
 * Pure function: deterministic, fast, and independent of React/DOM.
 */
export function analyzeComposition(composition: Composition): CompositionAnalysis {
  const scales = rankScales(composition.notes, composition.timeSignature);
  const topScale = scales[0];
  const activeScale =
    (composition.selectedScaleId
      ? scales.find((s) => s.id === composition.selectedScaleId)
      : undefined) ?? topScale;

  const sortedSections = [...composition.sections].sort((a, b) => a.start - b.start);
  const sections: CompositionAnalysis['sections'] = {};
  let prevChord: ChordCandidate | undefined;

  for (const section of sortedSections) {
    const analysis = analyzeSection(
      section,
      composition.notes,
      composition.timeSignature,
      activeScale,
      prevChord,
    );
    sections[section.id] = analysis;
    prevChord = resolveSectionChord(section, analysis);
  }

  return {
    scales,
    topScale,
    activeScale,
    sections,
  };
}
