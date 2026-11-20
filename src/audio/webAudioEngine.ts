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

  private activeVoiceCounts = new Map<number, number>();
  private activeNodes = new Set<{ oscs: OscillatorNode[]; gain: GainNode }>();
  private previewNodes = new Set<{ oscs: OscillatorNode[]; gain: GainNode }>();
  private voiceTimers = new Set<number>();
  private pitchListeners = new Set<(pitches: ReadonlySet<number>) => void>();

  private emitActivePitches(): void {
    const active = new Set<number>();
    for (const [pitch, count] of this.activeVoiceCounts) {
      if (count > 0) active.add(pitch);
    }
    for (const listener of this.pitchListeners) {
      listener(active);
    }
  }

  private trackVoiceWindow(pitch: number, when: number, durationSec: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const startDelayMs = Math.max(0, Math.round((when - now) * 1000));
    const endDelayMs = Math.max(startDelayMs + 40, Math.round((when + durationSec - now) * 1000));

    const startNote = () => {
      this.activeVoiceCounts.set(pitch, (this.activeVoiceCounts.get(pitch) ?? 0) + 1);
      this.emitActivePitches();
    };

    const endNote = () => {
      const next = (this.activeVoiceCounts.get(pitch) ?? 1) - 1;
      if (next <= 0) this.activeVoiceCounts.delete(pitch);
      else this.activeVoiceCounts.set(pitch, next);
      this.emitActivePitches();
    };

    if (startDelayMs <= 8) {
      startNote();
    } else {
      const tStart = window.setTimeout(() => {
        this.voiceTimers.delete(tStart);
        startNote();
      }, startDelayMs);
      this.voiceTimers.add(tStart);
    }

    const tEnd = window.setTimeout(() => {
      this.voiceTimers.delete(tEnd);
      endNote();
    }, endDelayMs);
    this.voiceTimers.add(tEnd);
  }

  subscribeActivePitches(listener: (pitches: ReadonlySet<number>) => void): () => void {
    this.pitchListeners.add(listener);
    const active = new Set<number>();
    for (const [pitch, count] of this.activeVoiceCounts) {
      if (count > 0) active.add(pitch);
    }
    listener(active);
    return () => {
      this.pitchListeners.delete(listener);
    };
  }

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
    isPreview = false,
  ): void {
    const ctx = this.ensureContext();
    if (!this.masterGain) return;

    const freq = midiToFreq(pitch);
    const dur = Math.max(0.06, durationSec);
    if (!isPreview) {
      this.trackVoiceWindow(pitch, when, dur);
    }
    const peakGain = Math.max(0.04, Math.min(0.42, velocity * 0.32));

    if (this.patch === 'triangle') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, when);

      const tAttack = when + 0.012;
      const tReleaseEnd = isPreview ? when + dur : when + dur + 0.09;
      const tReleaseStart = isPreview
        ? Math.max(tAttack + 0.01, tReleaseEnd - 0.016)
        : when + dur;
      const tDecay = Math.min(tAttack + 0.16, tReleaseStart);
      const sustainGain = peakGain * 0.62;

      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(peakGain, tAttack);
      if (tDecay > tAttack + 0.005) {
        gain.gain.linearRampToValueAtTime(sustainGain, tDecay);
        if (tReleaseStart > tDecay + 0.005) {
          gain.gain.setValueAtTime(sustainGain, tReleaseStart);
        }
      }
      gain.gain.linearRampToValueAtTime(0, tReleaseEnd);

      osc.connect(gain);
      gain.connect(this.masterGain);
      const handle = { oscs: [osc], gain };
      const targetSet = isPreview ? this.previewNodes : this.activeNodes;
      targetSet.add(handle);
      osc.onended = () => targetSet.delete(handle);
      osc.start(when);
      osc.stop(tReleaseEnd + 0.02);
      return;
    }

    // Warm electric-piano patch: fundamental sine + soft 2nd harmonic + smooth pop-free ADSR
    const fund = ctx.createOscillator();
    const over = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const overGain = ctx.createGain();

    const tAttack = when + 0.01;
    const tReleaseEnd = isPreview ? when + dur : when + dur + 0.14;
    const tReleaseStart = isPreview
      ? Math.max(tAttack + 0.01, tReleaseEnd - 0.016)
      : when + dur;
    const tDecay = Math.min(tAttack + 0.38, tReleaseStart);
    const sustainGain = peakGain * 0.45;

    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, when);

    over.type = 'triangle';
    over.frequency.setValueAtTime(freq * 2, when);

    overGain.gain.setValueAtTime(0.2, when);
    overGain.gain.exponentialRampToValueAtTime(0.015, tReleaseEnd);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(5200, freq * 5.5), when);
    filter.frequency.exponentialRampToValueAtTime(
      Math.min(2000, freq * 2.4),
      tReleaseEnd,
    );

    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peakGain, tAttack);
    if (tDecay > tAttack + 0.005) {
      amp.gain.linearRampToValueAtTime(sustainGain, tDecay);
      if (tReleaseStart > tDecay + 0.005) {
        amp.gain.setValueAtTime(sustainGain, tReleaseStart);
      }
    }
    // Smooth linear ramp to exact 0 eliminates click/pop when oscillator stops
    amp.gain.linearRampToValueAtTime(0, tReleaseEnd);

    fund.connect(filter);
    over.connect(overGain);
    overGain.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain);

    const handle = { oscs: [fund, over], gain: amp };
    const targetSet = isPreview ? this.previewNodes : this.activeNodes;
    targetSet.add(handle);
    fund.onended = () => targetSet.delete(handle);

    fund.start(when);
    over.start(when);
    fund.stop(tReleaseEnd + 0.02);
    over.stop(tReleaseEnd + 0.02);
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

  stopPreviewChord(): void {
    if (!this.ctx || this.previewNodes.size === 0) return;
    const now = this.ctx.currentTime;
    for (const handle of this.previewNodes) {
      try {
        handle.gain.gain.cancelScheduledValues(now);
        handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
        handle.gain.gain.linearRampToValueAtTime(0, now + 0.008);
        for (const osc of handle.oscs) {
          osc.stop(now + 0.012);
        }
      } catch {
        // Already stopped
      }
    }
    this.previewNodes.clear();
  }

  playPreviewChord(pitches: number[], durationSec = 1.0, velocity = 0.52): void {
    const ctx = this.ensureContext();
    // Cut off previous preview chord immediately so there is zero leak across transitions
    this.stopPreviewChord();
    const start = ctx.currentTime + 0.008;
    const chordEnd = start + Math.max(0.08, durationSec);
    const perNoteVel = velocity / Math.sqrt(Math.max(1, pitches.length * 0.55));
    // Very subtle 7ms onset strum; all notes terminate together at exact chordEnd
    pitches.forEach((pitch, idx) => {
      const onset = start + idx * 0.007;
      const noteDur = Math.max(0.06, chordEnd - onset);
      this.triggerVoice(pitch, onset, noteDur, perNoteVel, true);
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
    this.stopPreviewChord();
    if (this.ctx && this.activeNodes.size > 0) {
      const now = this.ctx.currentTime;
      for (const handle of this.activeNodes) {
        try {
          handle.gain.gain.cancelScheduledValues(now);
          handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
          handle.gain.gain.linearRampToValueAtTime(0, now + 0.012);
          for (const osc of handle.oscs) {
            osc.stop(now + 0.02);
          }
        } catch {
          // Oscillator may have already stopped
        }
      }
      this.activeNodes.clear();
    }
    for (const id of this.voiceTimers) {
      clearTimeout(id);
    }
    this.voiceTimers.clear();
    if (this.activeVoiceCounts.size > 0) {
      this.activeVoiceCounts.clear();
      this.emitActivePitches();
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }
}
