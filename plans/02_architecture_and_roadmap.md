# Architecture & Implementation Roadmap

This document defines the modular architecture, directory hierarchy, and phased roadmap for **Harmonia** (Music Theory Chord Visualizer), prioritizing cleanliness, separation of concerns, and fast iteration.

---

## 1. Architectural Principles

1. **Strict Separation of Concerns:** The harmonic analysis engine (`src/theory/`), audio playback (`src/audio/`), MIDI serialization (`src/midi/`), and state management (`src/state/`) are completely decoupled from React and the DOM.
2. **Pure Domain Models:** `src/domain/` defines all core types (`Note`, `Section`, `Composition`, `ScaleCandidate`, `ChordCandidate`, `AnalysisResult`) with zero external dependencies.
3. **Soft-Constraint, Transparent Scoring:** Every scale and chord is scored against placed notes using weighted musical salience (duration, beat strength, bass prominence, velocity) plus a parsimony penalty so simpler, accurate harmonies beat overly broad supersets. Outside notes are surfaced transparently, never treated as errors.
4. **Swappable Infrastructure:** Audio playback sits behind an `AudioEngine` interface (Web Audio synth today; sampled SoundFont or desktop bridge tomorrow). MIDI I/O sits behind `MidiCodec`.

---

## 2. Directory Hierarchy

```text
musical-scales/
├── plans/
│   ├── 00_music_theory_visualizer.md    # Original goal
│   ├── 01_implementation_plan.md        # Long-term reference spec
│   └── 02_architecture_and_roadmap.md   # This document
├── src/
│   ├── domain/                          # Framework-agnostic types & models
│   │   ├── music.ts                     # Note, Section, Composition, SnapGrid
│   │   ├── theory.ts                    # ScaleCandidate, ChordCandidate, HarmonicFunction, AnalysisResult
│   │   └── editor.ts                    # Selection, ClipboardData, Viewport
│   ├── theory/                          # Pure music theory & harmonic analysis engine
│   │   ├── pitch.ts                     # Pitch-class math, enharmonic spelling, interval naming
│   │   ├── catalog.ts                   # Scale/chord definitions & educational metadata
│   │   ├── weighting.ts                 # Musical salience weighting (beat, duration, bass, velocity)
│   │   ├── scaleAnalyzer.ts             # Global scale ranking + relative-key tonal gravity
│   │   ├── chordAnalyzer.ts             # Section chord ranking, inversions, bass & context scoring
│   │   ├── progressionAnalyzer.ts       # Harmonic function, Roman numerals, voice-leading smoothness
│   │   ├── explanations.ts              # Contextual educational explanations
│   │   └── index.ts                     # Unified analyzeComposition() entry point
│   ├── audio/                           # Web Audio synthesizer & transport scheduler
│   │   ├── types.ts                     # AudioEngine interface & synth patches
│   │   ├── webAudioEngine.ts            # Warm Electric Piano & Triangle synth + lookahead playback
│   │   └── index.ts
│   ├── midi/                            # Standard MIDI File (.mid) import/export
│   │   ├── codec.ts                     # @tonejs/midi <-> Composition conversion
│   │   └── index.ts
│   ├── state/                           # Immutable composition state & undo/redo
│   │   ├── history.ts                   # Generic undo/redo stack
│   │   ├── compositionStore.ts          # Reducer & actions for notes, sections, guides
│   │   └── presets.ts                   # Built-in musical starter examples
│   ├── ui/                              # React presentation layer
│   │   ├── components/
│   │   │   ├── TopBar.tsx               # Transport, tempo, snap, patch, MIDI I/O, presets
│   │   │   ├── SectionTimeline.tsx      # Click-to-split, drag-to-resize chord sections
│   │   │   ├── PianoRoll.tsx            # HTML5 Canvas piano roll (LMMS controls + ghost guides)
│   │   │   ├── ScaleExplorer.tsx        # Ranked scales + outside notes + ghost-guide toggle
│   │   │   ├── ChordExplorer.tsx        # Ranked section chords + audition + insert + Roman numerals
│   │   │   └── TheoryInspector.tsx      # Contextual mood, intervals, outside notes, tips, next chords
│   │   └── App.tsx                      # Main studio layout
│   ├── styles/
│   │   ├── tokens.css                   # Warm dark studio palette & semantic harmony colors
│   │   └── app.css                      # Layout & component styles
│   └── main.tsx
└── tests/                               # Automated Vitest suite
    ├── theory.test.ts
    └── midi.test.ts
```

---

## 3. Semantic Color System

Colors communicate harmonic meaning consistently across the piano roll, section bar, and explorers:

| Role | Color | Meaning |
| --- | --- | --- |
| **Tonic** | Emerald (`#34d399`) | Home, stability, resolution (`I`, `vi`, `iii`) |
| **Predominant** | Amber (`#f59e0b`) | Movement, color, departure (`IV`, `ii`) |
| **Dominant** | Coral (`#fb7185`) | Tension, pull back to home (`V`, `vii°`) |
| **Chromatic / Borrowed** | Sky (`#38bdf8`) | Modal mixture, secondary dominants, color |
| **Outside Note** | Muted Rose-Slate | Non-chord / non-scale tone (informational, not an error) |

---

## 4. Phased Roadmap

### Phase 1 — Core Studio & Harmonic Engine (Implemented First)
- [x] Abstract domain models (`src/domain/`)
- [x] Weighted scale & chord analysis engine with inversions, bass analysis, Roman numerals, harmonic function, and contextual explanations (`src/theory/`)
- [x] Web Audio synthesizer (Warm Electric Piano & Triangle) with playhead, loop, and note/chord audition (`src/audio/`)
- [x] LMMS-inspired Canvas Piano Roll (left-click draw/move, right-click delete, edge-drag resize, Ctrl+drag box select, copy/paste/duplicate, undo/redo, ghost scale & chord guides)
- [x] Interactive Section Timeline (click to split, drag boundaries to resize, merge/delete sections)
- [x] Scale Explorer, Chord Explorer, and Contextual Theory Inspector
- [x] `.mid` file import, export, and drag-and-drop (LMMS / Reaper interoperability)
- [x] Automated tests for theory analysis and MIDI round-tripping

### Phase 2 — Deeper Visual Theory & Voice Leading (Implemented)
- [x] Interactive **Circle of Fifths** widget synced to the active key and highlighting borrowed-chord neighbors
- [x] **Voice-Leading Overlay** on the piano roll (lines showing common tones and stepwise motion between adjacent sections)
- [x] **Chord Relationship Map** (interactive graph of closely related & next-chord transitions)
- [x] **Interval Inspector** when 2+ notes are selected on the piano roll
- [x] **Inversion & Voicing Explorer** (one-click root/1st/2nd inversion audition and insertion)
- [x] **Auto-Section Suggestion** button detecting likely harmonic boundaries from note changes

### Phase 3 — Advanced Analysis & Production Polish (Planned)
- [ ] Configurable scoring weight profiles (Pop/Diatonic, Jazz/Extended, Modal/Experimental)
- [ ] Modulation & temporary tonal center detection across sections
- [ ] Velocity lane & metronome toggle
- [ ] Sampled grand piano (Salamander Lite SoundFont) option in `AudioEngine`
- [ ] Multi-track view (melody vs. accompaniment weighting)
