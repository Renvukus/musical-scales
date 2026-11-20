import type { Composition, Note, Section } from '../domain/music';
import type { PitchClass } from '../domain/theory';
import {
  createHistory,
  pushHistory,
  redoHistory,
  replacePresent,
  undoHistory,
  type HistoryState,
} from './history';
import { PRESETS } from './presets';

export type CompositionAction =
  | { type: 'LOAD_COMPOSITION'; composition: Composition }
  | { type: 'SET_TEMPO'; tempo: number }
  | { type: 'ADD_NOTE'; note: Note }
  | { type: 'ADD_NOTES'; notes: Note[] }
  | { type: 'DELETE_NOTES'; ids: string[] }
  | { type: 'UPDATE_NOTES'; notes: Note[]; commit?: boolean }
  | { type: 'SELECT_SCALE'; scaleId?: string }
  | { type: 'SELECT_SECTION_CHORD'; sectionId: string; chordId?: string }
  | { type: 'SPLIT_SECTION'; beat: number }
  | { type: 'ADD_SECTION_AT'; beat?: number }
  | { type: 'MOVE_SECTION_BOUNDARY'; leftSectionId: string; rightSectionId: string; beat: number; commit?: boolean }
  | { type: 'RESIZE_LAST_SECTION'; sectionId: string; endBeat: number; commit?: boolean }
  | { type: 'DELETE_SECTION'; sectionId: string }
  | { type: 'MERGE_SECTION_WITH_PREV'; sectionId: string }
  | { type: 'INSERT_CHORD_IN_SECTION'; sectionId: string; pitchClasses: PitchClass[]; octave?: number; replaceExisting?: boolean }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export function createInitialHistory(): HistoryState<Composition> {
  return createHistory(PRESETS[0].composition);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function computeTotalBeats(comp: Composition, notes: Note[], sections: Section[]): number {
  const beatsPerBar = comp.timeSignature.numerator;
  let maxEnd = comp.totalBeats;
  for (const n of notes) {
    maxEnd = Math.max(maxEnd, n.start + n.duration);
  }
  for (const s of sections) {
    maxEnd = Math.max(maxEnd, s.end);
  }
  return Math.max(beatsPerBar * 4, Math.ceil(maxEnd / beatsPerBar) * beatsPerBar);
}

export function compositionReducer(
  state: HistoryState<Composition>,
  action: CompositionAction,
): HistoryState<Composition> {
  const comp = state.present;

  switch (action.type) {
    case 'UNDO':
      return undoHistory(state);

    case 'REDO':
      return redoHistory(state);

    case 'LOAD_COMPOSITION':
      return createHistory(action.composition);

    case 'SET_TEMPO': {
      const tempo = Math.max(40, Math.min(240, Math.round(action.tempo)));
      return replacePresent(state, { ...comp, tempo });
    }

    case 'ADD_NOTE': {
      const notes = [...comp.notes, action.note];
      const totalBeats = computeTotalBeats(comp, notes, comp.sections);
      return pushHistory(state, { ...comp, notes, totalBeats });
    }

    case 'ADD_NOTES': {
      const notes = [...comp.notes, ...action.notes];
      const totalBeats = computeTotalBeats(comp, notes, comp.sections);
      return pushHistory(state, { ...comp, notes, totalBeats });
    }

    case 'DELETE_NOTES': {
      if (action.ids.length === 0) return state;
      const toDelete = new Set(action.ids);
      const filtered = comp.notes.filter((n) => !toDelete.has(n.id));
      if (filtered.length === comp.notes.length) return state;
      return pushHistory(state, { ...comp, notes: filtered });
    }

    case 'UPDATE_NOTES': {
      const totalBeats = computeTotalBeats(comp, action.notes, comp.sections);
      const next = { ...comp, notes: action.notes, totalBeats };
      return action.commit === false
        ? replacePresent(state, next)
        : pushHistory(state, next);
    }

    case 'SELECT_SCALE':
      return replacePresent(state, {
        ...comp,
        selectedScaleId: action.scaleId,
      });

    case 'SELECT_SECTION_CHORD': {
      const sections = comp.sections.map((s) =>
        s.id === action.sectionId
          ? { ...s, selectedChordId: action.chordId }
          : s,
      );
      return replacePresent(state, { ...comp, sections });
    }

    case 'SPLIT_SECTION': {
      const beat = Math.round(action.beat * 2) / 2; // Snap section splits to 1/2 beat
      const target = comp.sections.find(
        (s) => beat > s.start + 0.5 && beat < s.end - 0.5,
      );
      if (!target) return state;

      const left: Section = { ...target, end: beat };
      const right: Section = {
        id: uid('sec'),
        start: beat,
        end: target.end,
      };
      const sections = comp.sections
        .flatMap((s) => (s.id === target.id ? [left, right] : [s]))
        .sort((a, b) => a.start - b.start);

      return pushHistory(state, { ...comp, sections });
    }

    case 'ADD_SECTION_AT': {
      const sorted = [...comp.sections].sort((a, b) => a.start - b.start);
      const lastEnd = sorted.length > 0 ? sorted[sorted.length - 1].end : 0;
      const beatsPerBar = comp.timeSignature.numerator;

      // If clicked inside an existing section, split it cleanly
      if (action.beat !== undefined && action.beat < lastEnd) {
        const beat = Math.round(action.beat * 2) / 2;
        const target = sorted.find((s) => beat > s.start + 0.5 && beat < s.end - 0.5);
        if (!target) return state;
        const left: Section = { ...target, end: beat };
        const right: Section = { id: uid('sec'), start: beat, end: target.end };
        const sections = sorted.flatMap((s) => (s.id === target.id ? [left, right] : [s]));
        return pushHistory(state, { ...comp, sections });
      }

      // Otherwise append a new chord section after the last one
      const targetEnd =
        action.beat !== undefined
          ? Math.max(lastEnd + beatsPerBar, Math.ceil(action.beat / beatsPerBar) * beatsPerBar)
          : lastEnd + beatsPerBar;
      const newSection: Section = {
        id: uid('sec'),
        start: lastEnd,
        end: targetEnd,
      };
      const sections = [...sorted, newSection];
      const totalBeats = computeTotalBeats(comp, comp.notes, sections);
      return pushHistory(state, { ...comp, sections, totalBeats });
    }

    case 'MOVE_SECTION_BOUNDARY': {
      const left = comp.sections.find((s) => s.id === action.leftSectionId);
      const right = comp.sections.find((s) => s.id === action.rightSectionId);
      if (!left || !right) return state;

      const snapped = Math.round(action.beat * 2) / 2;
      const clamped = Math.max(left.start + 0.5, Math.min(right.end - 0.5, snapped));
      const sections = comp.sections.map((s) => {
        if (s.id === left.id) return { ...s, end: clamped };
        if (s.id === right.id) return { ...s, start: clamped };
        return s;
      });
      const next = { ...comp, sections };
      return action.commit === false
        ? replacePresent(state, next)
        : pushHistory(state, next);
    }

    case 'RESIZE_LAST_SECTION': {
      const target = comp.sections.find((s) => s.id === action.sectionId);
      if (!target) return state;
      const snapped = Math.round(action.endBeat * 2) / 2;
      const clampedEnd = Math.max(target.start + 0.5, snapped);
      const sections = comp.sections.map((s) =>
        s.id === target.id ? { ...s, end: clampedEnd } : s,
      );
      const totalBeats = computeTotalBeats(comp, comp.notes, sections);
      const next = { ...comp, sections, totalBeats };
      return action.commit === false
        ? replacePresent(state, next)
        : pushHistory(state, next);
    }

    case 'DELETE_SECTION': {
      const sorted = [...comp.sections].sort((a, b) => a.start - b.start);
      if (sorted.length <= 1) return state;
      const idx = sorted.findIndex((s) => s.id === action.sectionId);
      if (idx === -1) return state;

      let sections: Section[];
      if (idx < sorted.length - 1) {
        // Delete this chord's left edge and merge its span into the later chord
        const deleted = sorted[idx];
        const nextSec = { ...sorted[idx + 1], start: deleted.start };
        sections = [
          ...sorted.slice(0, idx),
          nextSec,
          ...sorted.slice(idx + 2),
        ];
      } else {
        // Last chord section: remove it cleanly
        sections = sorted.slice(0, idx);
      }
      return pushHistory(state, { ...comp, sections });
    }

    case 'MERGE_SECTION_WITH_PREV': {
      const sorted = [...comp.sections].sort((a, b) => a.start - b.start);
      const idx = sorted.findIndex((s) => s.id === action.sectionId);
      if (idx <= 0) return state;
      const prev = sorted[idx - 1];
      const curr = sorted[idx];
      const merged: Section = { ...prev, end: curr.end };
      const sections = [
        ...sorted.slice(0, idx - 1),
        merged,
        ...sorted.slice(idx + 1),
      ];
      return pushHistory(state, { ...comp, sections });
    }

    case 'INSERT_CHORD_IN_SECTION': {
      const section = comp.sections.find((s) => s.id === action.sectionId);
      if (!section || action.pitchClasses.length === 0) return state;

      const baseOctave = action.octave ?? 3; // C3..B3 range
      const rootPc = action.pitchClasses[0];
      const baseMidi = (baseOctave + 1) * 12 + rootPc;
      const chordNotes: Note[] = action.pitchClasses.map((pc, idx) => {
        const semitonesAboveRoot = (((pc - rootPc) % 12) + 12) % 12;
        return {
          id: uid(`ch-${idx}`),
          pitch: baseMidi + semitonesAboveRoot,
          start: section.start,
          duration: Math.max(0.5, section.end - section.start),
          velocity: idx === 0 ? 0.76 : 0.68,
        };
      });

      const keptNotes = action.replaceExisting
        ? comp.notes.filter(
            (n) => n.start + n.duration <= section.start || n.start >= section.end,
          )
        : comp.notes;

      return pushHistory(state, {
        ...comp,
        notes: [...keptNotes, ...chordNotes],
      });
    }

    default:
      return state;
  }
}
