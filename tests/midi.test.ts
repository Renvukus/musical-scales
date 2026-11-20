import { describe, expect, it } from 'vitest';
import { exportCompositionToMidi, importMidiToComposition } from '../src/midi';
import { PRESETS } from '../src/state/presets';

describe('MIDI File Codec (.mid)', () => {
  it('round-trips a composition through Standard MIDI File bytes', () => {
    const original = PRESETS[0].composition;
    const bytes = exportCompositionToMidi(original);
    expect(bytes.byteLength).toBeGreaterThan(50);

    const restored = importMidiToComposition(bytes, 'Roundtrip.mid');
    expect(restored.tempo).toBe(original.tempo);
    expect(restored.notes.length).toBe(original.notes.length);

    const origPitches = original.notes.map((n) => n.pitch).sort((a, b) => a - b);
    const restPitches = restored.notes.map((n) => n.pitch).sort((a, b) => a - b);
    expect(restPitches).toEqual(origPitches);
    expect(restored.sections.length).toBeGreaterThanOrEqual(4);
  });

  it('creates 1-bar chord sections across the full length of long MIDI files (>32 bars)', () => {
    const longComp = {
      ...PRESETS[0].composition,
      totalBeats: 192, // 48 bars in 4/4
      notes: [
        { id: 'start', pitch: 60, start: 0, duration: 4, velocity: 0.8 },
        { id: 'end', pitch: 67, start: 188, duration: 4, velocity: 0.8 },
      ],
    };
    const bytes = exportCompositionToMidi(longComp);
    const restored = importMidiToComposition(bytes, 'LongPiece.mid');

    expect(restored.sections.length).toBe(48);
    expect(restored.sections[0].start).toBe(0);
    expect(restored.sections[47].start).toBe(188);
    expect(restored.sections[47].end).toBe(Infinity);
  });
});
