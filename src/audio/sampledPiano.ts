import type { SampleLoadState } from './types';

const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

/**
 * Salamander Grand Piano (CC-BY 3.0, Alexander Holm) — minor-third intervals
 * across A0..C8 (max ±1 semitone pitch shift per key). Ordered middle-out so
 * the most commonly played octaves (C3–C5) become playable first.
 */
const SALAMANDER_SAMPLES: ReadonlyArray<{ midi: number; file: string }> = [
  // Core middle range first for fastest perceived readiness
  { midi: 60, file: 'C4.mp3' },
  { midi: 63, file: 'Ds4.mp3' },
  { midi: 66, file: 'Fs4.mp3' },
  { midi: 69, file: 'A4.mp3' },
  { midi: 57, file: 'A3.mp3' },
  { midi: 54, file: 'Fs3.mp3' },
  { midi: 51, file: 'Ds3.mp3' },
  { midi: 48, file: 'C3.mp3' },
  { midi: 72, file: 'C5.mp3' },
  { midi: 75, file: 'Ds5.mp3' },
  { midi: 78, file: 'Fs5.mp3' },
  { midi: 81, file: 'A5.mp3' },
  // Lower & upper extensions
  { midi: 45, file: 'A2.mp3' },
  { midi: 42, file: 'Fs2.mp3' },
  { midi: 39, file: 'Ds2.mp3' },
  { midi: 36, file: 'C2.mp3' },
  { midi: 84, file: 'C6.mp3' },
  { midi: 87, file: 'Ds6.mp3' },
  { midi: 90, file: 'Fs6.mp3' },
  { midi: 93, file: 'A6.mp3' },
  { midi: 33, file: 'A1.mp3' },
  { midi: 30, file: 'Fs1.mp3' },
  { midi: 27, file: 'Ds1.mp3' },
  { midi: 24, file: 'C1.mp3' },
  { midi: 21, file: 'A0.mp3' },
  { midi: 96, file: 'C7.mp3' },
  { midi: 99, file: 'Ds7.mp3' },
  { midi: 102, file: 'Fs7.mp3' },
  { midi: 105, file: 'A7.mp3' },
  { midi: 108, file: 'C8.mp3' },
];

export class SampledPianoBank {
  private buffers = new Map<number, AudioBuffer>();
  private state: SampleLoadState = 'idle';
  private loadPromise: Promise<void> | null = null;
  private listeners = new Set<(state: SampleLoadState) => void>();

  getState(): SampleLoadState {
    return this.state;
  }

  subscribe(listener: (state: SampleLoadState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: SampleLoadState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  /**
   * Lazily fetches & decodes the Salamander Grand Piano MP3 samples with bounded
   * concurrency so the UI stays responsive and middle octaves arrive first.
   */
  load(ctx: AudioContext): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    this.setState('loading');
    const queue = [...SALAMANDER_SAMPLES];
    let loadedCount = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry || this.buffers.has(entry.midi)) continue;
        try {
          const res = await fetch(`${SALAMANDER_BASE_URL}${entry.file}`);
          if (!res.ok) continue;
          const arr = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr);
          this.buffers.set(entry.midi, decoded);
          loadedCount++;
        } catch {
          // Individual sample failure shouldn't abort remaining samples
        }
      }
    };

    const concurrency = 6;
    this.loadPromise = Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    ).then(() => {
      this.loadPromise = null;
      if (this.buffers.size > 0 || loadedCount > 0) {
        this.setState('ready');
      } else {
        this.setState('error');
      }
    });

    return this.loadPromise;
  }

  /**
   * Finds the nearest loaded sample in semitones and computes the exact
   * Web Audio playbackRate required to play `targetMidi` cleanly.
   */
  getNearestSample(
    targetMidi: number,
  ): { buffer: AudioBuffer; playbackRate: number } | null {
    if (this.buffers.size === 0) return null;

    let bestMidi = -1;
    let bestDist = Infinity;
    for (const sampleMidi of this.buffers.keys()) {
      const dist = Math.abs(targetMidi - sampleMidi);
      if (dist < bestDist) {
        bestDist = dist;
        bestMidi = sampleMidi;
        if (dist === 0) break;
      }
    }
    if (bestMidi === -1) return null;
    const buffer = this.buffers.get(bestMidi);
    if (!buffer) return null;

    const playbackRate = Math.pow(2, (targetMidi - bestMidi) / 12);
    return { buffer, playbackRate };
  }
}
