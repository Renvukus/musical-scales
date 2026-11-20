import type { Composition, Section } from '../domain/music';

const STORAGE_KEY = 'harmonia:autosave:v1';

interface SerializedSection extends Omit<Section, 'end'> {
  end: number | null;
}

interface SerializedComposition extends Omit<Composition, 'sections'> {
  sections: SerializedSection[];
}

interface HarmoniaProjectFile {
  harmoniaProject: 1;
  savedAt: string;
  composition: SerializedComposition;
}

function toSerialized(composition: Composition): SerializedComposition {
  return {
    ...composition,
    sections: composition.sections.map((s) => ({
      ...s,
      end: Number.isFinite(s.end) ? s.end : null,
    })),
  };
}

function fromSerialized(
  parsed: Partial<SerializedComposition> | null | undefined,
): Composition | null {
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
    title: typeof parsed.title === 'string' ? parsed.title : 'Saved Project',
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
}

export function serializeProject(composition: Composition): string {
  const payload: HarmoniaProjectFile = {
    harmoniaProject: 1,
    savedAt: new Date().toISOString(),
    composition: toSerialized(composition),
  };
  return JSON.stringify(payload, null, 2);
}

export function deserializeProject(raw: string): Composition | null {
  try {
    const parsed = JSON.parse(raw) as
      | Partial<HarmoniaProjectFile>
      | Partial<SerializedComposition>;
    if (
      parsed &&
      'harmoniaProject' in parsed &&
      parsed.composition
    ) {
      return fromSerialized(parsed.composition);
    }
    return fromSerialized(parsed as Partial<SerializedComposition>);
  } catch {
    return null;
  }
}

export function saveCompositionToStorage(composition: Composition): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(toSerialized(composition)),
    );
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export function loadCompositionFromStorage(): Composition | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return fromSerialized(JSON.parse(raw) as Partial<SerializedComposition>);
  } catch {
    return null;
  }
}

interface FilePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/**
 * Opens a native Save As dialog (when supported by the browser) or falls back
 * to a direct Blob download, exporting the full Harmonia project including all
 * notes, chord splits, pinned chords, and scale selection.
 */
export async function saveProjectAsFile(composition: Composition): Promise<boolean> {
  const json = serializeProject(composition);
  const blob = new Blob([json], { type: 'application/json' });
  const baseName = (composition.title || 'harmonia-project')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .toLowerCase();
  const suggestedName = `${baseName}.harmonia.json`;

  const win = window as FilePickerWindow;
  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Harmonia Project (.harmonia.json)',
            accept: { 'application/json': ['.harmonia.json', '.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      // User cancelled the Save As dialog
      if (err instanceof DOMException && err.name === 'AbortError') return false;
    }
  }

  // Fallback download for browsers without File System Access API
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
