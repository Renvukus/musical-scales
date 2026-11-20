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

export type SnapGrid = 0.25 | 0.5 | 1 | 2 | 4;
