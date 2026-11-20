/**
 * Editor interaction & UI state domain models.
 */

export interface ClipboardNote {
  pitch: number;
  /** Offset in beats relative to the earliest copied note. */
  startOffset: number;
  duration: number;
  velocity: number;
}

export interface PianoRollViewport {
  /** Horizontal scale in pixels per beat. */
  pixelsPerBeat: number;
  /** Vertical scale in pixels per semitone row. */
  rowHeight: number;
  /** Highest visible MIDI pitch (top of piano roll). */
  topPitch: number;
  /** Lowest MIDI pitch supported in editor. */
  minPitch: number;
  /** Highest MIDI pitch supported in editor. */
  maxPitch: number;
}
