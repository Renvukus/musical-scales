import type { Note } from '../domain/music';

export type SynthPatch = 'epiano' | 'triangle';

export interface PlaybackOptions {
  notes: Note[];
  tempo: number;
  startBeat: number;
  loopStartBeat: number;
  loopEndBeat: number;
  loop: boolean;
  onPlayhead: (beat: number) => void;
  onStop: () => void;
}

export interface AudioEngine {
  setPatch(patch: SynthPatch): void;
  getPatch(): SynthPatch;
  setVolume(volume: number): void;
  playNote(pitch: number, durationSec?: number, velocity?: number): void;
  playChord(pitches: number[], durationSec?: number, velocity?: number): void;
  playPreviewChord(pitches: number[], durationSec?: number, velocity?: number): void;
  stopPreviewChord(): void;
  start(options: PlaybackOptions): void;
  stop(): void;
  isPlaying(): boolean;
  subscribeActivePitches(listener: (pitches: ReadonlySet<number>) => void): () => void;
}
