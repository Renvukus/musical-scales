import { Midi } from '@tonejs/midi';
import type { Composition, Note, Section } from '../domain/music';

/**
 * Serializes a Composition into a Standard MIDI File (.mid) byte array
 * compatible with LMMS, REAPER, FL Studio, Ableton, etc.
 */
export function exportCompositionToMidi(composition: Composition): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(composition.tempo);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [
      composition.timeSignature.numerator,
      composition.timeSignature.denominator,
    ],
  });

  const track = midi.addTrack();
  track.name = composition.title || 'Harmonia Track';
  const secPerBeat = 60 / composition.tempo;

  for (const note of composition.notes) {
    track.addNote({
      midi: Math.max(0, Math.min(127, Math.round(note.pitch))),
      time: Math.max(0, note.start * secPerBeat),
      duration: Math.max(0.05, note.duration * secPerBeat),
      velocity: Math.max(0.05, Math.min(1, note.velocity)),
    });
  }

  return midi.toArray();
}

/**
 * Parses a Standard MIDI File (.mid) into a Harmonia Composition,
 * preserving tempo, time signature, note positions, durations, and velocities.
 */
export function importMidiToComposition(
  data: ArrayBuffer | Uint8Array,
  fallbackTitle = 'Imported MIDI',
): Composition {
  const midi = new Midi(data);
  const tempo = Math.round(midi.header.tempos[0]?.bpm ?? 110);
  const tsRaw = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const numerator = tsRaw[0] || 4;
  const denominator = tsRaw[1] || 4;
  const secPerBeat = 60 / tempo;

  const notes: Note[] = [];
  let maxEndBeat = numerator * 4; // Minimum 4 bars

  midi.tracks.forEach((track, trackIdx) => {
    track.notes.forEach((n, noteIdx) => {
      const start = Math.round((n.time / secPerBeat) * 16) / 16;
      const duration = Math.max(0.125, Math.round((n.duration / secPerBeat) * 16) / 16);
      maxEndBeat = Math.max(maxEndBeat, start + duration);
      notes.push({
        id: `midi-${trackIdx}-${noteIdx}-${Math.random().toString(36).slice(2, 7)}`,
        pitch: n.midi,
        start,
        duration,
        velocity: n.velocity,
      });
    });
  });

  // Round total beats up to whole bars (cap to a sensible workspace size if huge)
  const bars = Math.max(4, Math.min(32, Math.ceil(maxEndBeat / numerator)));
  const totalBeats = bars * numerator;

  // Create default 1-bar chord sections so harmonic analysis works immediately
  const sections: Section[] = [];
  for (let b = 0; b < bars; b++) {
    sections.push({
      id: `sec-${b + 1}`,
      start: b * numerator,
      end: (b + 1) * numerator,
    });
  }

  return {
    title: midi.name || fallbackTitle.replace(/\.mid$/i, ''),
    tempo,
    timeSignature: { numerator, denominator },
    totalBeats,
    notes,
    sections,
  };
}
