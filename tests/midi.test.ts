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

  it('merges consecutive bars that belong to the same chord while splitting chord changes', () => {
    const twoBarChords = {
      ...PRESETS[0].composition,
      totalBeats: 16,
      notes: [
        // Bars 1 & 2: C major split across two bars
        { id: 'c1', pitch: 48, start: 0, duration: 4, velocity: 0.8 },
        { id: 'c2', pitch: 52, start: 0, duration: 4, velocity: 0.8 },
        { id: 'c3', pitch: 55, start: 4, duration: 4, velocity: 0.8 },
        { id: 'c4', pitch: 60, start: 4, duration: 4, velocity: 0.8 },
        // Bars 3 & 4: F major split across two bars
        { id: 'f1', pitch: 53, start: 8, duration: 4, velocity: 0.8 },
        { id: 'f2', pitch: 57, start: 8, duration: 4, velocity: 0.8 },
        { id: 'f3', pitch: 60, start: 12, duration: 4, velocity: 0.8 },
        { id: 'f4', pitch: 65, start: 12, duration: 4, velocity: 0.8 },
      ],
    };
    const bytes = exportCompositionToMidi(twoBarChords);
    const restored = importMidiToComposition(bytes, 'TwoBarChords.mid');

    expect(restored.sections.length).toBe(2);
    expect(restored.sections[0]).toMatchObject({ start: 0, end: 8 });
    expect(restored.sections[1]).toMatchObject({ start: 8, end: Infinity });
  });

  it('spans the full length of long MIDI files (>32 bars) without capping at 32 bars', () => {
    const longComp = {
      ...PRESETS[0].composition,
      totalBeats: 192, // 48 bars in 4/4
      notes: [
        // Bar 1: C major
        { id: 'start1', pitch: 48, start: 0, duration: 4, velocity: 0.8 },
        { id: 'start2', pitch: 52, start: 0, duration: 4, velocity: 0.8 },
        { id: 'start3', pitch: 55, start: 0, duration: 4, velocity: 0.8 },
        // Bar 48: G major
        { id: 'end1', pitch: 55, start: 188, duration: 4, velocity: 0.8 },
        { id: 'end2', pitch: 59, start: 188, duration: 4, velocity: 0.8 },
        { id: 'end3', pitch: 62, start: 188, duration: 4, velocity: 0.8 },
      ],
    };
    const bytes = exportCompositionToMidi(longComp);
    const restored = importMidiToComposition(bytes, 'LongPiece.mid');

    expect(restored.totalBeats).toBe(192);
    expect(restored.sections[0].start).toBe(0);
    // Bar 48 starts its own chord section at beat 188 and extends to Infinity
    const lastSec = restored.sections[restored.sections.length - 1];
    expect(lastSec.start).toBe(188);
    expect(lastSec.end).toBe(Infinity);
  });
});
