import type { Note, TimeSignature } from '../domain/music';
import type { PitchClass, ScaleCandidate, ScaleDefinition } from '../domain/theory';
import { SCALE_CATALOG } from './catalog';
import { pitchClassName, prefersFlats, toPitchClass } from './pitch';
import { buildPitchProfile } from './weighting';

function buildScalePitchClasses(rootPc: PitchClass, intervals: number[]): PitchClass[] {
  return intervals.map((i) => ((rootPc + i) % 12) as PitchClass);
}

function getRelativeScaleName(
  rootPc: PitchClass,
  def: ScaleDefinition,
  useFlats: boolean,
): string | undefined {
  if (def.id === 'major') {
    const relRoot = ((rootPc + 9) % 12) as PitchClass;
    return `${pitchClassName(relRoot, useFlats)} Natural Minor`;
  }
  if (def.id === 'natural-minor') {
    const relRoot = ((rootPc + 3) % 12) as PitchClass;
    return `${pitchClassName(relRoot, useFlats)} Major`;
  }
  return undefined;
}

export function rankScales(
  notes: Note[],
  timeSignature: TimeSignature,
): ScaleCandidate[] {
  const profile = buildPitchProfile(notes, timeSignature);
  const candidates: ScaleCandidate[] = [];

  for (let root = 0; root < 12; root++) {
    const rootPc = root as PitchClass;

    for (const def of SCALE_CATALOG) {
      const isMinorLike =
        def.category === 'minor' ||
        def.id === 'dorian' ||
        def.id === 'phrygian' ||
        def.id === 'minor-pentatonic' ||
        def.id === 'blues';
      const useFlats = prefersFlats(rootPc, isMinorLike);
      const rootName = pitchClassName(rootPc, useFlats);
      const pitchClasses = buildScalePitchClasses(rootPc, def.intervals);
      const pcSet = new Set<number>(pitchClasses);
      const noteNames = pitchClasses.map((pc) => pitchClassName(pc, useFlats));
      const displayName = `${rootName} ${def.shortName}`;

      if (profile.totalWeight === 0) {
        candidates.push({
          id: `${rootPc}:${def.id}`,
          rootPc,
          rootName,
          definition: def,
          displayName,
          pitchClasses,
          noteNames,
          score: Math.round(def.prior * 50),
          coverage: 1,
          outsideNoteCount: 0,
          outsidePitchNames: [],
          relativeScaleName: getRelativeScaleName(rootPc, def, useFlats),
          summary: 'Place notes on the piano roll to see how well this scale fits.',
        });
        continue;
      }

      // 1. Weighted pitch coverage
      let inScaleWeight = 0;
      for (const pc of pitchClasses) {
        inScaleWeight += profile.pcWeights[pc];
      }
      const coverage = inScaleWeight / profile.totalWeight;

      // 2. Outside notes
      let outsideNoteCount = 0;
      const outsidePcSet = new Set<PitchClass>();
      for (const wn of profile.weightedNotes) {
        if (!pcSet.has(wn.pitchClass)) {
          outsideNoteCount++;
          outsidePcSet.add(wn.pitchClass);
        }
      }
      const outsidePitchNames = Array.from(outsidePcSet).map((pc) =>
        pitchClassName(pc, useFlats),
      );

      // 3. Tonal gravity: distinguishes relative keys & modes sharing identical notes
      const rootShare = profile.pcWeights[rootPc] / profile.totalWeight;
      const fifthPc = ((rootPc + 7) % 12) as PitchClass;
      const fifthShare = profile.pcWeights[fifthPc] / profile.totalWeight;
      const thirdInterval = def.intervals.includes(4) ? 4 : 3;
      const thirdPc = ((rootPc + thirdInterval) % 12) as PitchClass;
      const thirdShare = profile.pcWeights[thirdPc] / profile.totalWeight;

      let tonalGravity =
        Math.min(1, rootShare * 3.2) * 0.45 +
        Math.min(1, fifthShare * 3.0) * 0.2 +
        Math.min(1, thirdShare * 3.0) * 0.15;

      if (profile.bassPc === rootPc) tonalGravity += 0.15;
      if (profile.firstNote && toPitchClass(profile.firstNote.pitch) === rootPc) {
        tonalGravity += 0.1;
      }
      if (profile.lastNote && toPitchClass(profile.lastNote.pitch) === rootPc) {
        tonalGravity += 0.12;
      }
      tonalGravity = Math.min(1, tonalGravity);

      // 4. Scale utilization (prevents 7-note scales from trivially crushing 5-note pentatonics or vice versa)
      const activePcs = profile.pcWeights.filter((w) => w > 0).length;
      const matchedScaleDegrees = pitchClasses.filter(
        (pc) => profile.pcWeights[pc] > 0,
      ).length;
      const richness = matchedScaleDegrees / Math.max(activePcs, def.intervals.length);

      // Composite score (0..100)
      const rawScore =
        coverage * 66 +
        tonalGravity * 20 +
        def.prior * 10 +
        richness * 4 -
        Math.min(14, outsidePcSet.size * 4.5);

      const score = Math.max(0, Math.min(100, Math.round(rawScore)));
      const relativeScaleName = getRelativeScaleName(rootPc, def, useFlats);

      let summary: string;
      if (outsideNoteCount === 0) {
        summary =
          profile.bassPc === rootPc
            ? `Every note fits cleanly, with ${rootName} anchoring the bass.`
            : `All ${profile.weightedNotes.length} notes fit cleanly inside ${displayName}.`;
      } else if (coverage >= 0.85) {
        summary = `Strong match (${Math.round(coverage * 100)}% weighted fit). Outside: ${outsidePitchNames.join(', ')} — likely passing or borrowed color tones.`;
      } else {
        summary = `${outsideNoteCount} note${outsideNoteCount === 1 ? '' : 's'} fall outside (${outsidePitchNames.join(', ')}). Works if you're using chromaticism or modulating.`;
      }

      candidates.push({
        id: `${rootPc}:${def.id}`,
        rootPc,
        rootName,
        definition: def,
        displayName,
        pitchClasses,
        noteNames,
        score,
        coverage,
        outsideNoteCount,
        outsidePitchNames,
        relativeScaleName,
        summary,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.outsideNoteCount - b.outsideNoteCount);
  return candidates;
}
