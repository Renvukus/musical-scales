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
});
