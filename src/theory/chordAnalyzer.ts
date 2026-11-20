import type { Note, Section, TimeSignature } from '../domain/music';
import type {
  ChordCandidate,
  PitchClass,
  ScaleCandidate,
  SectionAnalysis,
} from '../domain/theory';
import { CHORD_CATALOG } from './catalog';
import { pitchClassName, prefersFlats } from './pitch';
import {
  buildNextChordSuggestions,
  classifyHarmonicFunction,
  evaluateTransition,
} from './progressionAnalyzer';
import { buildPitchProfile } from './weighting';

function describeInversion(
  bassPc: PitchClass | undefined,
  rootPc: PitchClass,
  intervals: number[],
): { label?: string; bassBonus: number } {
  if (bassPc === undefined) return { bassBonus: 0 };
  const bassInterval = (((bassPc - rootPc) % 12) + 12) % 12;
  const idx = intervals.indexOf(bassInterval);
  if (idx === 0) return { label: 'Root position', bassBonus: 10 };
  if (idx === 1) return { label: '1st inversion', bassBonus: 5 };
  if (idx === 2) return { label: '2nd inversion', bassBonus: 3 };
  if (idx >= 3) return { label: '3rd inversion', bassBonus: 2 };
  return { label: 'Slash / non-chord bass', bassBonus: -5 };
}

export function analyzeSection(
  section: Section,
  notes: Note[],
  timeSignature: TimeSignature,
  activeScale?: ScaleCandidate,
  prevChord?: ChordCandidate,
): SectionAnalysis {
  const profile = buildPitchProfile(notes, timeSignature, section.start, section.end);
  const useFlats = activeScale
    ? prefersFlats(
        activeScale.rootPc,
        activeScale.definition.category === 'minor' ||
          activeScale.definition.id === 'dorian' ||
          activeScale.definition.id === 'phrygian',
      )
    : false;

  const candidates: ChordCandidate[] = [];

  for (let root = 0; root < 12; root++) {
    const rootPc = root as PitchClass;

    for (const def of CHORD_CATALOG) {
      const chordUseFlats = activeScale
        ? useFlats
        : prefersFlats(rootPc, def.quality === 'min' || def.quality === 'min7');
      const rootName = pitchClassName(rootPc, chordUseFlats);
      const pitchClasses = def.intervals.map(
        (i) => ((rootPc + i) % 12) as PitchClass,
      );
      const pcSet = new Set<number>(pitchClasses);
      const noteNames = pitchClasses.map((pc) => pitchClassName(pc, chordUseFlats));
      const symbol = `${rootName}${def.symbolSuffix}`;
      const fullName = `${rootName} ${def.name}`;

      const { harmonicFunction, isDiatonic, romanNumeral } =
        classifyHarmonicFunction(rootPc, pitchClasses, def.quality, activeScale);

      const { progressionFit, commonTones } = evaluateTransition(
        prevChord,
        rootPc,
        pitchClasses,
        harmonicFunction,
      );

      // When the section has no notes yet, rank diatonic + smooth-progression chords
      if (profile.totalWeight === 0) {
        const emptyScore = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (isDiatonic ? 58 : 26) +
                progressionFit * 28 -
                def.complexity * 90 +
                (romanNumeral === 'I' || romanNumeral === 'i' ? 6 : 0),
            ),
          ),
        );
        candidates.push({
          id: `${rootPc}:${def.quality}`,
          rootPc,
          rootName,
          quality: def.quality,
          symbol,
          fullName,
          definition: def,
          pitchClasses,
          noteNames,
          score: emptyScore,
          noteFit: 1,
          progressionFit,
          romanNumeral,
          harmonicFunction,
          isDiatonic,
          outsideNoteCount: 0,
          outsidePitchNames: [],
          commonTonesWithPrev: commonTones,
          summary: isDiatonic
            ? `Diatonic ${romanNumeral} (${harmonicFunction}) in ${activeScale?.displayName ?? 'this key'}. Click "Insert" to try it here.`
            : `Non-diatonic color chord (${romanNumeral}) — great for modal mixture or surprise lifts.`,
          nextChordSuggestions: buildNextChordSuggestions(
            rootPc,
            harmonicFunction,
            activeScale,
          ),
        });
        continue;
      }

      // 1. Weighted note fit (how much of the played energy belongs to this chord)
      let inChordWeight = 0;
      for (const pc of pitchClasses) {
        inChordWeight += profile.pcWeights[pc];
      }
      const noteFit = inChordWeight / profile.totalWeight;

      // 2. Chord completeness (prevents Cmaj7/Cadd9 from beating C when 7th/9th isn't played)
      let presentTones = 0;
      for (const pc of pitchClasses) {
        if (profile.pcWeights[pc] > 0) presentTones++;
      }
      const completeness = presentTones / pitchClasses.length;
      const hasRoot = profile.pcWeights[rootPc] > 0;
      const missingRootPenalty = hasRoot ? 0 : 9;

      // 3. Outside notes
      let outsideNoteCount = 0;
      const outsidePcSet = new Set<PitchClass>();
      for (const wn of profile.weightedNotes) {
        if (!pcSet.has(wn.pitchClass)) {
          outsideNoteCount++;
          outsidePcSet.add(wn.pitchClass);
        }
      }
      const outsidePitchNames = Array.from(outsidePcSet).map((pc) =>
        pitchClassName(pc, chordUseFlats),
      );

      // 4. Bass / inversion analysis
      const bassNoteName =
        profile.bassPc !== undefined
          ? pitchClassName(profile.bassPc, chordUseFlats)
          : undefined;
      const { label: inversionLabel, bassBonus } = describeInversion(
        profile.bassPc,
        rootPc,
        def.intervals,
      );

      // 5. Key & progression context
      const diatonicBonus = activeScale ? (isDiatonic ? 11 : -3) : 0;
      const progressionBonus = prevChord ? progressionFit * 9 : 0;

      // Composite score (0..100)
      const rawScore =
        noteFit * 54 +
        completeness * 22 +
        bassBonus +
        diatonicBonus +
        progressionBonus -
        missingRootPenalty -
        def.complexity * 55 -
        Math.min(12, outsidePcSet.size * 3.5);

      const score = Math.max(0, Math.min(100, Math.round(rawScore)));

      // Contextual explanation
      let summary: string;
      if (outsideNoteCount === 0 && presentTones === pitchClasses.length) {
        summary = `Exact harmonic match (${inversionLabel ?? 'all tones present'}). ${
          isDiatonic
            ? `Acts as ${romanNumeral} (${harmonicFunction}) in ${activeScale?.displayName ?? 'this key'}.`
            : `Borrowed ${romanNumeral} color outside the main scale.`
        }`;
      } else if (outsideNoteCount === 0) {
        summary = `All played notes fit cleanly inside ${symbol}${
          presentTones < pitchClasses.length
            ? ` (missing ${pitchClasses.length - presentTones} chord tone${pitchClasses.length - presentTones === 1 ? '' : 's'})`
            : ''
        }.`;
      } else if (noteFit >= 0.72) {
        summary = `Strong fit (${Math.round(noteFit * 100)}% weighted). Outside: ${outsidePitchNames.join(', ')} — can work as melodic passing tones or tensions.`;
      } else {
        summary = `${outsideNoteCount} note${outsideNoteCount === 1 ? '' : 's'} fall outside (${outsidePitchNames.join(', ')}). ${
          isDiatonic
            ? `Still diatonic (${romanNumeral}) if you want to reharmonize this bar.`
            : 'More adventurous reharmonization option.'
        }`;
      }

      candidates.push({
        id: `${rootPc}:${def.quality}`,
        rootPc,
        rootName,
        quality: def.quality,
        symbol,
        fullName,
        definition: def,
        pitchClasses,
        noteNames,
        score,
        noteFit,
        progressionFit,
        bassNoteName,
        inversionLabel,
        romanNumeral,
        harmonicFunction,
        isDiatonic,
        outsideNoteCount,
        outsidePitchNames,
        commonTonesWithPrev: commonTones,
        summary,
        nextChordSuggestions: buildNextChordSuggestions(
          rootPc,
          harmonicFunction,
          activeScale,
        ),
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.outsideNoteCount - b.outsideNoteCount ||
      a.definition.complexity - b.definition.complexity,
  );

  const topChord = candidates[0];
  const second = candidates[1];
  const isAmbiguous =
    profile.weightedNotes.length > 0 &&
    Boolean(topChord && second && topChord.score - second.score <= 4);

  return {
    sectionId: section.id,
    noteCount: profile.weightedNotes.length,
    bassPitch: profile.bassNote?.pitch,
    candidates,
    topChord,
    isAmbiguous,
  };
}
