import { SampledPianoBank } from './sampledPiano';
import type { AudioEngine, PlaybackOptions, SampleLoadState, SynthPatch } from './types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Web Audio synthesizer, sampled Salamander Grand Piano player, and lookahead transport scheduler.
 */
export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pianoWave: PeriodicWave | null = null;
  private hammerBuffer: AudioBuffer | null = null;
  private reverbInput: GainNode | null = null;
  private sampledPiano = new SampledPianoBank();
  private patch: SynthPatch = 'grand';
  private volume = 0.72;

  private playing = false;
  private rafId: number | null = null;
  private schedulerId: number | null = null;
  private scheduledUntilBeat = 0;
  private startAudioTime = 0;
  private startBeatOffset = 0;
  private currentOptions: PlaybackOptions | null = null;

  private activeVoiceCounts = new Map<number, number>();
  private activeNodes = new Set<{ oscs: AudioScheduledSourceNode[]; gain: GainNode }>();
  private previewNodes = new Set<{ oscs: AudioScheduledSourceNode[]; gain: GainNode }>();
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

  private buildPianoResources(ctx: AudioContext): void {
    // Rich acoustic piano harmonic spectrum (partials 1..12)
    const real = new Float32Array(13);
    const imag = new Float32Array([
      0, // DC
      1.0, // 1st (fundamental)
      0.56, // 2nd (octave)
      0.35, // 3rd (fifth)
      0.24, // 4th
      0.17, // 5th
      0.12, // 6th
      0.085, // 7th
      0.06, // 8th
      0.042, // 9th
      0.028, // 10th
      0.018, // 11th
      0.012, // 12th
    ]);
    this.pianoWave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    // Short 32ms felt-hammer noise transient buffer
    const hammerLen = Math.floor(ctx.sampleRate * 0.032);
    const hBuf = ctx.createBuffer(1, hammerLen, ctx.sampleRate);
    const hData = hBuf.getChannelData(0);
    for (let i = 0; i < hammerLen; i++) {
      const env = Math.pow(1 - i / hammerLen, 2.2);
      hData[i] = (Math.random() * 2 - 1) * env;
    }
    this.hammerBuffer = hBuf;

    // Subtle 0.75s studio room impulse response for acoustic depth
    const irLen = Math.floor(ctx.sampleRate * 0.75);
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        const decay = Math.pow(1 - i / irLen, 3.2);
        data[i] = (Math.random() * 2 - 1) * decay * 0.35;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = irBuf;

    const revFilter = ctx.createBiquadFilter();
    revFilter.type = 'lowpass';
    revFilter.frequency.value = 3800;

    const revWet = ctx.createGain();
    revWet.gain.value = 0.16;

    this.reverbInput = ctx.createGain();
    this.reverbInput.gain.value = 1;
    this.reverbInput.connect(convolver);
    convolver.connect(revFilter);
    revFilter.connect(revWet);
    if (this.masterGain) {
      revWet.connect(this.masterGain);
    }
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

      // Gentle presence boost + soft limiter so chords stay crisp and never clip
      const presence = this.ctx.createBiquadFilter();
      presence.type = 'highshelf';
      presence.frequency.value = 2600;
      presence.gain.value = 2.5;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 3.5;

      this.masterGain.connect(presence);
      presence.connect(comp);
      comp.connect(this.ctx.destination);

      this.buildPianoResources(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  subscribeSampleState(listener: (state: SampleLoadState) => void): () => void {
    return this.sampledPiano.subscribe(listener);
  }

  setPatch(patch: SynthPatch): void {
    this.patch = patch;
    if (patch === 'grand') {
      const ctx = this.ensureContext();
      void this.sampledPiano.load(ctx);
    }
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
    const peakGain = Math.max(0.015, Math.min(0.42, velocity * 0.38));

    if (this.patch === 'grand') {
      const sample = this.sampledPiano.getNearestSample(pitch);
      if (sample) {
        const source = ctx.createBufferSource();
        source.buffer = sample.buffer;
        source.playbackRate.setValueAtTime(sample.playbackRate, when);

        // Velocity-responsive warmth filter + gentle upper-register presence
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.5;
        const clampedVel = Math.max(0.05, Math.min(1, velocity));
        const filterCutoff = Math.min(
          18000,
          1600 + clampedVel * 14000 + Math.max(0, pitch - 60) * 90,
        );
        filter.frequency.setValueAtTime(filterCutoff, when);

        // Balance Salamander register energy: gently tame heavy bass, lift treble melodies
        const registerTilt = Math.max(0.72, Math.min(1.42, 1 + (pitch - 60) * 0.015));
        const amp = ctx.createGain();
        const sampleGain = Math.max(0.03, Math.min(1.15, clampedVel * 0.82 * registerTilt));
        const tAttack = when + 0.003;
        const tReleaseEnd = isPreview ? when + dur : when + dur + 0.34;
        const tReleaseStart = isPreview
          ? Math.max(tAttack + 0.01, tReleaseEnd - 0.018)
          : when + dur;

        amp.gain.setValueAtTime(0, when);
        amp.gain.linearRampToValueAtTime(sampleGain, tAttack);
        if (tReleaseStart > tAttack + 0.002) {
          amp.gain.setValueAtTime(sampleGain, tReleaseStart);
        }
        amp.gain.linearRampToValueAtTime(0, tReleaseEnd);

        source.connect(filter);
        filter.connect(amp);
        amp.connect(this.masterGain);
        if (this.reverbInput && !isPreview) {
          const revSend = ctx.createGain();
          revSend.gain.value = 0.22;
          amp.connect(revSend);
          revSend.connect(this.reverbInput);
        }

        const handle = { oscs: [source], gain: amp };
        const targetSet = isPreview ? this.previewNodes : this.activeNodes;
        targetSet.add(handle);
        source.onended = () => targetSet.delete(handle);

        source.start(when);
        source.stop(tReleaseEnd + 0.02);
        return;
      }
      // If samples are still downloading or offline, fall through to built-in Acoustic Piano synth
    }

    if (this.patch === 'triangle') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, when);

      const tAttack = when + 0.01;
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

    // Realistic Acoustic Piano synthesis:
    // Dual detuned multi-harmonic unison strings + felt hammer transient + bright velocity-scaled filter
    const stringA = ctx.createOscillator();
    const stringB = ctx.createOscillator();
    if (this.pianoWave) {
      stringA.setPeriodicWave(this.pianoWave);
      stringB.setPeriodicWave(this.pianoWave);
    } else {
      stringA.type = 'triangle';
      stringB.type = 'sawtooth';
    }
    stringA.frequency.setValueAtTime(freq, when);
    stringB.frequency.setValueAtTime(freq, when);
    stringA.detune.setValueAtTime(-2.2, when);
    stringB.detune.setValueAtTime(2.2, when);

    const mixA = ctx.createGain();
    const mixB = ctx.createGain();
    mixA.gain.value = 0.56;
    mixB.gain.value = 0.44;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.65;

    const amp = ctx.createGain();

    // Pitch-dependent natural string decay (higher notes decay faster like real piano strings)
    const naturalDecay = Math.max(0.28, Math.min(1.6, 1.45 - (pitch - 36) * 0.02));
    const tAttack = when + 0.004;
    const tReleaseEnd = isPreview ? when + dur : when + dur + 0.16;
    const tReleaseStart = isPreview
      ? Math.max(tAttack + 0.01, tReleaseEnd - 0.016)
      : when + dur;
    const tDecay = Math.min(tAttack + naturalDecay, tReleaseStart);
    const sustainGain = peakGain * Math.max(0.18, 0.42 - (pitch - 48) * 0.004);

    // Bright hammer strike opening -> natural warm string sustain (never muffled)
    const brightPeak = Math.min(14000, freq * (10 + velocity * 6) + 1800);
    const brightTail = Math.min(6200, Math.max(1100, freq * 5.2));
    filter.frequency.setValueAtTime(brightPeak, when);
    filter.frequency.exponentialRampToValueAtTime(brightTail, Math.max(tAttack + 0.05, tDecay));

    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peakGain, tAttack);
    if (tDecay > tAttack + 0.005) {
      amp.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainGain), tDecay);
      if (tReleaseStart > tDecay + 0.005) {
        amp.gain.setValueAtTime(Math.max(0.001, sustainGain), tReleaseStart);
      }
    }
    // Smooth linear ramp to exact 0 eliminates click/pop when oscillators stop
    amp.gain.linearRampToValueAtTime(0, tReleaseEnd);

    stringA.connect(mixA);
    stringB.connect(mixB);
    mixA.connect(filter);
    mixB.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain);
    if (this.reverbInput && !isPreview) {
      amp.connect(this.reverbInput);
    }

    const sources: AudioScheduledSourceNode[] = [stringA, stringB];

    // Felt hammer strike transient
    if (this.hammerBuffer) {
      const hammer = ctx.createBufferSource();
      hammer.buffer = this.hammerBuffer;
      const hammerFilter = ctx.createBiquadFilter();
      hammerFilter.type = 'bandpass';
      hammerFilter.frequency.setValueAtTime(Math.min(5500, Math.max(900, freq * 5.5)), when);
      hammerFilter.Q.value = 1.2;
      const hammerGain = ctx.createGain();
      hammerGain.gain.setValueAtTime(peakGain * 0.24, when);
      hammerGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.028);
      hammer.connect(hammerFilter);
      hammerFilter.connect(hammerGain);
      hammerGain.connect(this.masterGain);
      hammer.start(when);
      hammer.stop(when + 0.032);
      sources.push(hammer);
    }

    const handle = { oscs: sources, gain: amp };
    const targetSet = isPreview ? this.previewNodes : this.activeNodes;
    targetSet.add(handle);
    stringA.onended = () => targetSet.delete(handle);

    stringA.start(when);
    stringB.start(when);
    stringA.stop(tReleaseEnd + 0.02);
    stringB.stop(tReleaseEnd + 0.02);
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
    this.scheduledUntilBeat = options.startBeat - 1e-4;

    const scheduleLookahead = () => {
      if (!this.playing || !this.currentOptions || !this.ctx) return;
      const opt = this.currentOptions;
      const secPerBeat = 60 / opt.tempo;
      const elapsedSec = this.ctx.currentTime - this.startAudioTime;
      const currentAbsBeat = this.startBeatOffset + elapsedSec / secPerBeat;
      const lookaheadBeats = 0.35 / secPerBeat; // 350ms lookahead
      const windowEndAbs = currentAbsBeat + lookaheadBeats;
      const loopLen = Math.max(0.25, opt.loopEndBeat - opt.loopStartBeat);

      if (opt.loop) {
        // Schedule all notes falling in (scheduledUntilBeat, windowEndAbs] across loop wraps
        const minK = Math.max(
          0,
          Math.floor((this.scheduledUntilBeat - opt.loopStartBeat) / loopLen) - 1,
        );
        const maxK = Math.max(
          0,
          Math.floor((windowEndAbs - opt.loopStartBeat) / loopLen) + 1,
        );

        for (let k = minK; k <= maxK; k++) {
          const cycleOffset = k * loopLen;
          for (const note of opt.notes) {
            if (note.muted || note.velocity <= 0.001) continue;
            if (note.start < opt.loopStartBeat || note.start >= opt.loopEndBeat) {
              continue;
            }
            const noteAbsBeat = note.start + cycleOffset;
            if (
              noteAbsBeat > this.scheduledUntilBeat &&
              noteAbsBeat <= windowEndAbs
            ) {
              const when =
                this.startAudioTime +
                (noteAbsBeat - this.startBeatOffset) * secPerBeat;
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
        this.scheduledUntilBeat = Math.max(this.scheduledUntilBeat, windowEndAbs);
      } else {
        for (const note of opt.notes) {
          if (note.muted || note.velocity <= 0.001) continue;
          if (
            note.start > this.scheduledUntilBeat &&
            note.start <= windowEndAbs &&
            note.start < opt.loopEndBeat
          ) {
            const when =
              this.startAudioTime +
              (note.start - this.startBeatOffset) * secPerBeat;
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
        this.scheduledUntilBeat = Math.max(this.scheduledUntilBeat, windowEndAbs);

        if (currentAbsBeat >= opt.loopEndBeat) {
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
      const currentAbsBeat =
        this.startBeatOffset + (this.ctx.currentTime - this.startAudioTime) / secPerBeat;

      if (opt.loop) {
        const loopLen = Math.max(0.25, opt.loopEndBeat - opt.loopStartBeat);
        const rel = currentAbsBeat - opt.loopStartBeat;
        const wrapped =
          rel >= 0
            ? opt.loopStartBeat + (rel % loopLen)
            : Math.max(opt.loopStartBeat, currentAbsBeat);
        opt.onPlayhead(wrapped);
      } else {
        opt.onPlayhead(
          Math.max(opt.loopStartBeat, Math.min(opt.loopEndBeat, currentAbsBeat)),
        );
      }
      this.rafId = requestAnimationFrame(tickVisual);
    };

    scheduleLookahead();
    this.schedulerId = window.setInterval(scheduleLookahead, 35);
    this.rafId = requestAnimationFrame(tickVisual);
  }

  updatePlayback(partial: {
    notes?: PlaybackOptions['notes'];
    tempo?: number;
    loopEndBeat?: number;
    loop?: boolean;
  }): void {
    if (!this.playing || !this.currentOptions) return;

    if (
      partial.tempo !== undefined &&
      partial.tempo !== this.currentOptions.tempo &&
      this.ctx
    ) {
      // Smoothly re-anchor playhead clock so changing tempo mid-playback doesn't jump
      const now = this.ctx.currentTime;
      const oldSecPerBeat = 60 / this.currentOptions.tempo;
      const currentAbsBeat =
        this.startBeatOffset + (now - this.startAudioTime) / oldSecPerBeat;
      this.startBeatOffset = currentAbsBeat;
      this.startAudioTime = now;
      this.currentOptions.tempo = partial.tempo;
    }

    if (partial.notes !== undefined) {
      this.currentOptions.notes = partial.notes;
    }
    if (partial.loopEndBeat !== undefined) {
      this.currentOptions.loopEndBeat = partial.loopEndBeat;
    }
    if (partial.loop !== undefined) {
      this.currentOptions.loop = partial.loop;
    }
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
