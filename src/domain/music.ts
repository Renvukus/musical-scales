import type { ChordConstraint } from './theory';

/**
 * Core musical composition domain models.
 * Intentionally framework-agnostic (zero React/DOM/WebAudio dependencies).
 */

export interface Note {
  id: string;
  /** MIDI pitch number (0–127, where 60 = C4). */
  pitch: number;
  /** Start time in beats (quarter notes from beat 0). */
  start: number;
  /** Duration in beats (quarter notes). */
  duration: number;
  /** Velocity normalized to 0..1. */
  velocity: number;
}

export interface Section {
  id: string;
  /** Start time in beats (inclusive). */
  start: number;
  /** End time in beats (exclusive). */
  end: number;
  /** Optional user-pinned chord ID (e.g., "0:maj" for C major) to highlight & compare. */
  selectedChordId?: string;
  /** Optional chord-type constraint (e.g., Dominant or Minor) while keeping chord selection automatic. */
  chordConstraint?: ChordConstraint;
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Composition {
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  /** Total length of the editable timeline in beats. */
  totalBeats: number;
  notes: Note[];
  sections: Section[];
  /** Optional user-selected global scale ID (e.g., "0:major") for ghost guides. */
  selectedScaleId?: string;
}

export interface SnapOption {
  label: string;
  /** Step size in beats (quarter notes). E.g. 1/12 note = 4/12 = 1/3 beat. */
  beats: number;
}

export const SNAP_OPTIONS: SnapOption[] = [
  { label: '1/1 (Bar)', beats: 4 },
  { label: '1/2', beats: 2 },
  { label: '1/4', beats: 1 },
  { label: '1/6 (¼T)', beats: 2 / 3 },
  { label: '1/8', beats: 0.5 },
  { label: '1/12 (⅛T)', beats: 1 / 3 },
  { label: '1/16', beats: 0.25 },
  { label: '1/24 (1/16T)', beats: 1 / 6 },
  { label: '1/32', beats: 0.125 },
];

export type SnapGrid = number;
