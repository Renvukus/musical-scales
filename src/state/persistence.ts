import type { Composition, Section } from '../domain/music';

const STORAGE_KEY = 'harmonia:autosave:v1';

interface SerializedSection extends Omit<Section, 'end'> {
  end: number | null;
}

interface SerializedComposition extends Omit<Composition, 'sections'> {
  sections: SerializedSection[];
}

export function saveCompositionToStorage(composition: Composition): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload: SerializedComposition = {
      ...composition,
      sections: composition.sections.map((s) => ({
        ...s,
        end: Number.isFinite(s.end) ? s.end : null,
      })),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export function loadCompositionFromStorage(): Composition | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SerializedComposition>;
    if (
      !parsed ||
      !Array.isArray(parsed.notes) ||
      !Array.isArray(parsed.sections) ||
      typeof parsed.tempo !== 'number' ||
      !parsed.timeSignature
    ) {
      return null;
    }

    const sortedSections = [...parsed.sections].sort((a, b) => a.start - b.start);
    const restoredSections: Section[] =
      sortedSections.length === 0
        ? [{ id: 'sec-1', start: 0, end: Infinity }]
        : sortedSections.map((s, idx) => ({
            ...s,
            start: idx === 0 ? 0 : s.start,
            end:
              idx === sortedSections.length - 1 || s.end === null
                ? Infinity
                : s.end,
          }));

    return {
      title: typeof parsed.title === 'string' ? parsed.title : 'Autosaved Session',
      tempo: Math.max(40, Math.min(240, Math.round(parsed.tempo))),
      timeSignature: {
        numerator: parsed.timeSignature.numerator || 4,
        denominator: parsed.timeSignature.denominator || 4,
      },
      totalBeats:
        typeof parsed.totalBeats === 'number' && parsed.totalBeats > 0
          ? parsed.totalBeats
          : 16,
      notes: parsed.notes,
      sections: restoredSections,
      selectedScaleId: parsed.selectedScaleId,
    };
  } catch {
    return null;
  }
}
