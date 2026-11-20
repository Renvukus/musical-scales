import type { AudioEngine, PlaybackOptions, SynthPatch } from './types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Lightweight, zero-asset Web Audio synthesizer and lookahead transport scheduler.
 */
export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private patch: SynthPatch = 'epiano';
  private volume = 0.7;

  private playing = false;
  private rafId: number | null = null;
  private schedulerId: number | null = null;
  private scheduledUntilBeat = 0;
  private startAudioTime = 0;
  private startBeatOffset = 0;
  private currentOptions: PlaybackOptions | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      // Gentle soft-clipping limiter via compressor to keep chords clean
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  setPatch(patch: SynthPatch): void {
    this.patch = patch;
  }

  getPatch(): SynthPatch {
    return this.patch;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  private triggerVoice(
    pitch: number,
    when: number,
    durationSec: number,
    velocity: number,
  ): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    const freq = midiToFreq(pitch);
    const dur = Math.max(0.06, durationSec);
    const peakGain = Math.max(0.04, Math.min(0.45, velocity * 0.34));

    if (this.patch === 'triangle') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, when);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peakGain, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(peakGain * 0.65, when + Math.min(0.2, dur));
      gain.gain.setValueAtTime(peakGain * 0.65, when + Math.max(0.02, dur - 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(when);
      osc.stop(when + dur + 0.1);
      return;
    }

    // Warm electric-piano patch: fundamental sine + soft 2nd harmonic + gentle bell attack
    const fund = ctx.createOscillator();
    const over = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const overGain = ctx.createGain();

    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, when);

    over.type = 'triangle';
    over.frequency.setValueAtTime(freq * 2, when);

    overGain.gain.setValueAtTime(0.22, when);
    overGain.gain.exponentialRampToValueAtTime(0.02, when + Math.min(0.45, dur + 0.15));

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(5500, freq * 6), when);
    filter.frequency.exponentialRampToValueAtTime(
      Math.min(2200, freq * 2.5),
      when + Math.min(0.6, dur + 0.2),
    );

    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(peakGain, when + 0.008);
    amp.gain.exponentialRampToValueAtTime(
      peakGain * 0.48,
      when + Math.min(0.55, dur + 0.1),
    );
    amp.gain.setValueAtTime(
      Math.max(0.0002, peakGain * 0.38),
      when + Math.max(0.02, dur - 0.03),
    );
    amp.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.22);

    fund.connect(filter);
    over.connect(overGain);
    overGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain);

    fund.start(when);
    over.start(when);
    fund.stop(when + dur + 0.25);
    over.stop(when + dur + 0.25);
  }

  playNote(pitch: number, durationSec = 0.45, velocity = 0.8): void {
    const ctx = this.ensureContext();
    this.triggerVoice(pitch, ctx.currentTime + 0.005, durationSec, velocity);
  }

  playChord(pitches: number[], durationSec = 0.95, velocity = 0.72): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime + 0.008;
    const perNoteVel = velocity / Math.sqrt(Math.max(1, pitches.length * 0.55));
    // Subtle 18ms strum makes chords sound musical rather than robotic
    pitches.forEach((pitch, idx) => {
      this.triggerVoice(pitch, now + idx * 0.018, durationSec, perNoteVel);
    });
  }

  start(options: PlaybackOptions): void {
    this.stop();
    const ctx = this.ensureContext();

    this.playing = true;
    this.currentOptions = options;
    this.startBeatOffset = options.startBeat;
    this.startAudioTime = ctx.currentTime + 0.03;
    this.scheduledUntilBeat = options.startBeat - 0.001;

    const scheduleLookahead = () => {
      if (!this.playing || !this.currentOptions || !this.ctx) return;
      const opt = this.currentOptions;
      const secPerBeat = 60 / opt.tempo;
      const elapsedSec = this.ctx.currentTime - this.startAudioTime;
      const currentBeat = this.startBeatOffset + elapsedSec / secPerBeat;
      const lookaheadBeats = 0.35 / secPerBeat; // 350ms lookahead
      const windowEnd = currentBeat + lookaheadBeats;

      for (const note of opt.notes) {
        if (note.start > this.scheduledUntilBeat && note.start <= windowEnd) {
          if (note.start < opt.loopEndBeat) {
            const when =
              this.startAudioTime + (note.start - this.startBeatOffset) * secPerBeat;
            if (when >= this.ctx.currentTime - 0.05) {
              this.triggerVoice(
                note.pitch,
                Math.max(this.ctx.currentTime, when),
                note.duration * secPerBeat,
                note.velocity,
              );
            }
          }
        }
      }
      this.scheduledUntilBeat = Math.max(this.scheduledUntilBeat, windowEnd);

      if (currentBeat >= opt.loopEndBeat) {
        if (opt.loop) {
          this.startBeatOffset = opt.loopStartBeat;
          this.startAudioTime = this.ctx.currentTime;
          this.scheduledUntilBeat = opt.loopStartBeat - 0.001;
        } else {
          const onStop = opt.onStop;
          this.stop();
          onStop();
        }
      }
    };

    const tickVisual = () => {
      if (!this.playing || !this.currentOptions || !this.ctx) return;
      const opt = this.currentOptions;
      const secPerBeat = 60 / opt.tempo;
      const currentBeat = Math.max(
        opt.loopStartBeat,
        this.startBeatOffset + (this.ctx.currentTime - this.startAudioTime) / secPerBeat,
      );
      opt.onPlayhead(Math.min(opt.loopEndBeat, currentBeat));
      this.rafId = requestAnimationFrame(tickVisual);
    };

    scheduleLookahead();
    this.schedulerId = window.setInterval(scheduleLookahead, 40);
    this.rafId = requestAnimationFrame(tickVisual);
  }

  stop(): void {
    this.playing = false;
    this.currentOptions = null;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }
}
