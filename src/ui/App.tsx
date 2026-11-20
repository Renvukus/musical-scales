import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { audioEngine, type SynthPatch } from '../audio';
import type { SnapGrid } from '../domain/music';
import type { ChordCandidate, ScaleCandidate } from '../domain/theory';
import { exportCompositionToMidi, importMidiToComposition } from '../midi';
import { compositionReducer, createInitialHistory } from '../state/compositionStore';
import { saveCompositionToStorage } from '../state/persistence';
import { PRESETS } from '../state/presets';
import { analyzeComposition } from '../theory';
import { ChordExplorer } from './components/ChordExplorer';
import { PianoRoll } from './components/PianoRoll';
import { ScaleExplorer } from './components/ScaleExplorer';
import { SectionTimeline } from './components/SectionTimeline';
import { TheoryInspector } from './components/TheoryInspector';
import { TopBar } from './components/TopBar';
import { getFitPillStyle } from './fitColor';

export const App: React.FC = () => {
  const [history, dispatch] = useReducer(compositionReducer, undefined, createInitialHistory);
  const composition = history.present;

  const [activeSectionId, setActiveSectionId] = useState<string>(
    () => composition.sections[0]?.id ?? 'sec-1',
  );
  const [sectionFocused, setSectionFocused] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chords' | 'scales'>('chords');
  const [snap, setSnap] = useState<SnapGrid>(0.5);
  const [patch, setPatch] = useState<SynthPatch>('epiano');
  const [showGuides, setShowGuides] = useState(true);
  const [chordPreview, setChordPreview] = useState(false);
  const [loop, setLoop] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(64);
  const [scrollX, setScrollX] = useState(0);
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);

  const [inspectedChord, setInspectedChord] = useState<ChordCandidate | undefined>();
  const [hoveredChord, setHoveredChord] = useState<ChordCandidate | undefined>();
  const [inspectedScale, setInspectedScale] = useState<ScaleCandidate | undefined>();
  const [hoveredScale, setHoveredScale] = useState<ScaleCandidate | undefined>();
  const playbackOriginRef = React.useRef<number>(0);
  const lastPreviewSectionRef = React.useRef<string | null>(null);

  // Real-time harmonic analysis (pure, memoized)
  const analysis = useMemo(() => analyzeComposition(composition), [composition]);

  // Keep activeSectionId valid if sections change
  const activeSection =
    composition.sections.find((s) => s.id === activeSectionId) ??
    composition.sections[0];
  const activeSectionAnalysis = activeSection
    ? analysis.sections[activeSection.id]
    : undefined;

  const displayedChord = useMemo(() => {
    if (hoveredChord) return hoveredChord;
    if (!activeSection || !activeSectionAnalysis) return undefined;
    if (
      inspectedChord &&
      activeSectionAnalysis.candidates.some((c) => c.id === inspectedChord.id)
    ) {
      return activeSectionAnalysis.candidates.find((c) => c.id === inspectedChord.id);
    }
    if (activeSection.selectedChordId) {
      return activeSectionAnalysis.candidates.find(
        (c) => c.id === activeSection.selectedChordId,
      );
    }
    return activeSectionAnalysis.topChord;
  }, [activeSection, activeSectionAnalysis, hoveredChord, inspectedChord]);

  const displayedScale = hoveredScale ?? inspectedScale ?? analysis.activeScale;

  // Auto-play each chord section whenever playback enters a new section (if Chord Preview is On)
  useEffect(() => {
    if (!isPlaying || !chordPreview) {
      lastPreviewSectionRef.current = null;
      audioEngine.stopPreviewChord();
      return;
    }
    const currentSec = composition.sections.find(
      (s) => playheadBeat >= s.start && playheadBeat < s.end,
    );
    if (!currentSec || currentSec.id === lastPreviewSectionRef.current) return;
    lastPreviewSectionRef.current = currentSec.id;

    const secAnalysis = analysis.sections[currentSec.id];
    const chosen =
      (currentSec.selectedChordId
        ? secAnalysis?.candidates.find((c) => c.id === currentSec.selectedChordId)
        : undefined) ?? secAnalysis?.topChord;
    if (!chosen) {
      audioEngine.stopPreviewChord();
      return;
    }

    const baseMidi = 48 + chosen.rootPc;
    const pitches = chosen.definition.intervals.map((semi) => baseMidi + semi);
    const remainingBeats = Number.isFinite(currentSec.end)
      ? Math.max(0.1, currentSec.end - playheadBeat)
      : composition.timeSignature.numerator;
    const durSec = (remainingBeats * 60) / composition.tempo;
    audioEngine.playPreviewChord(pitches, durSec, 0.52);
  }, [
    isPlaying,
    chordPreview,
    playheadBeat,
    composition.sections,
    composition.tempo,
    composition.timeSignature.numerator,
    analysis.sections,
  ]);

  const handleDeleteSection = useCallback(
    (sectionId: string) => {
      const sorted = [...composition.sections].sort((a, b) => a.start - b.start);
      if (sorted.length <= 1) return;
      const idx = sorted.findIndex((s) => s.id === sectionId);
      const nextActive = idx > 0 ? sorted[idx - 1].id : sorted[1]?.id;
      dispatch({ type: 'DELETE_SECTION', sectionId });
      if (nextActive) setActiveSectionId(nextActive);
      setInspectedChord(undefined);
    },
    [composition.sections],
  );

  // Compute playable end beat strictly from notes (never capped by chord sections)
  const getPlaybackEndBeat = useCallback(
    (fromBeat: number) => {
      const beatsPerBar = composition.timeSignature.numerator;
      const lastNoteEnd = composition.notes.reduce(
        (max, n) => Math.max(max, n.start + n.duration),
        0,
      );
      const minContentEnd = Math.max(beatsPerBar * 4, Math.ceil(lastNoteEnd / beatsPerBar) * beatsPerBar);
      if (fromBeat >= minContentEnd) {
        return Math.ceil((fromBeat + beatsPerBar * 4) / beatsPerBar) * beatsPerBar;
      }
      return minContentEnd;
    },
    [composition.notes, composition.timeSignature.numerator],
  );

  // Audio playback controls
  const startPlayback = useCallback(
    (fromBeat: number) => {
      playbackOriginRef.current = fromBeat;
      lastPreviewSectionRef.current = null;
      setIsPlaying(true);
      const endBeat = getPlaybackEndBeat(fromBeat);
      audioEngine.start({
        notes: composition.notes,
        tempo: composition.tempo,
        startBeat: fromBeat,
        loopStartBeat: 0,
        loopEndBeat: endBeat,
        loop,
        onPlayhead: (beat) => setPlayheadBeat(beat),
        onStop: () => {
          setIsPlaying(false);
          setPlayheadBeat(playbackOriginRef.current);
        },
      });
    },
    [composition.notes, composition.tempo, getPlaybackEndBeat, loop],
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      audioEngine.stop();
      setIsPlaying(false);
      // Return playhead to where playback began (DAW-style pause)
      setPlayheadBeat(playbackOriginRef.current);
    } else {
      startPlayback(playheadBeat);
    }
  }, [isPlaying, playheadBeat, startPlayback]);

  const handleStop = useCallback(() => {
    audioEngine.stop();
    setIsPlaying(false);
    playbackOriginRef.current = 0;
    setPlayheadBeat(0);
  }, []);

  // Keep live playback in sync when notes, tempo, or loop toggle change while playing
  useEffect(() => {
    if (!isPlaying) return;
    audioEngine.updatePlayback({
      notes: composition.notes,
      tempo: composition.tempo,
      loop,
      loopEndBeat: getPlaybackEndBeat(playbackOriginRef.current),
    });
  }, [isPlaying, composition.notes, composition.tempo, loop, getPlaybackEndBeat]);

  // Global keyboard shortcuts (Space = Play/Pause, Ctrl+Z/Y = Undo/Redo, Del/X = Delete focused chord section)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) dispatch({ type: 'REDO' });
        else dispatch({ type: 'UNDO' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      } else if (
        sectionFocused &&
        activeSection &&
        (e.key === 'Delete' ||
          e.key === 'Backspace' ||
          (!mod && !e.altKey && e.key.toLowerCase() === 'x'))
      ) {
        e.preventDefault();
        handleDeleteSection(activeSection.id);
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'c' && displayedChord) {
        e.preventDefault();
        const baseMidi = 48 + displayedChord.rootPc;
        audioEngine.playChord(
          displayedChord.definition.intervals.map((semi) => baseMidi + semi),
          0.9,
          0.76,
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePlay, sectionFocused, activeSection, handleDeleteSection, displayedChord]);

  // Stop audio on unmount
  useEffect(() => () => audioEngine.stop(), []);

  // Browser localStorage autosave (debounced + immediate flush before tab close)
  const latestCompRef = React.useRef(composition);
  latestCompRef.current = composition;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveCompositionToStorage(composition);
    }, 250);
    return () => clearTimeout(timer);
  }, [composition]);

  useEffect(() => {
    const flushSave = () => saveCompositionToStorage(latestCompRef.current);
    window.addEventListener('beforeunload', flushSave);
    return () => window.removeEventListener('beforeunload', flushSave);
  }, []);

  // MIDI Import / Export handlers
  const handleImportMidiFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const loaded = importMidiToComposition(buf, file.name);
      handleStop();
      dispatch({ type: 'LOAD_COMPOSITION', composition: loaded });
      setActiveSectionId(loaded.sections[0]?.id ?? 'sec-1');
      setInspectedChord(undefined);
      setInspectedScale(undefined);
    } catch (err) {
      console.error('MIDI import failed:', err);
      alert('Could not read that MIDI file. Please verify it is a valid .mid file.');
    }
  };

  const handleExportMidi = () => {
    const bytes = exportCompositionToMidi(composition);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(composition.title || 'harmonia').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="studio-shell"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingMidi(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingMidi(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingMidi(false);
        const file = e.dataTransfer.files?.[0];
        if (file && /\.midi?$/i.test(file.name)) {
          void handleImportMidiFile(file);
        }
      }}
    >
      <TopBar
        title={composition.title}
        isPlaying={isPlaying}
        loop={loop}
        tempo={composition.tempo}
        timeSignature={composition.timeSignature}
        snap={snap}
        patch={patch}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        showGuides={showGuides}
        chordPreview={chordPreview}
        onTogglePlay={handleTogglePlay}
        onStop={handleStop}
        onToggleLoop={() => setLoop((l) => !l)}
        onTempoChange={(tempo) => dispatch({ type: 'SET_TEMPO', tempo })}
        onTimeSignatureChange={(timeSignature) =>
          dispatch({ type: 'SET_TIME_SIGNATURE', timeSignature })
        }
        onSnapChange={setSnap}
        onPatchChange={(p) => {
          setPatch(p);
          audioEngine.setPatch(p);
        }}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onToggleGuides={() => setShowGuides((g) => !g)}
        onToggleChordPreview={() => setChordPreview((p) => !p)}
        onSelectPreset={(id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (!preset) return;
          handleStop();
          dispatch({ type: 'LOAD_COMPOSITION', composition: preset.composition });
          setActiveSectionId(preset.composition.sections[0]?.id ?? 'sec-1');
          setInspectedChord(undefined);
          setInspectedScale(undefined);
        }}
        onImportMidi={handleImportMidiFile}
        onExportMidi={handleExportMidi}
      />

      <main className="workspace">
        <div className="editor-column">
          <SectionTimeline
            sections={composition.sections}
            analysis={analysis}
            activeSectionId={activeSection?.id ?? ''}
            isSectionFocused={sectionFocused}
            snap={snap}
            pixelsPerBeat={pixelsPerBeat}
            scrollX={scrollX}
            onSelectSection={(id) => {
              setActiveSectionId(id);
              setSectionFocused(true);
              setInspectedChord(undefined);
              setSidebarTab('chords');
            }}
            onSplitSection={(beat, s) => dispatch({ type: 'SPLIT_SECTION', beat, snap: s })}
            onMoveBoundary={(leftId, rightId, beat, s, commit) =>
              dispatch({
                type: 'MOVE_SECTION_BOUNDARY',
                leftSectionId: leftId,
                rightSectionId: rightId,
                beat,
                snap: s,
                commit,
              })
            }
            onClearSections={() => {
              dispatch({ type: 'CLEAR_SECTIONS' });
              setActiveSectionId('sec-1');
              setInspectedChord(undefined);
            }}
          />

          <PianoRoll
            composition={composition}
            analysis={analysis}
            activeSectionId={activeSection?.id ?? ''}
            snap={snap}
            showGuides={showGuides}
            isPlaying={isPlaying}
            isSectionFocused={sectionFocused}
            playheadBeat={playheadBeat}
            pixelsPerBeat={pixelsPerBeat}
            scrollX={scrollX}
            onScrollXChange={setScrollX}
            onPixelsPerBeatChange={setPixelsPerBeat}
            onSeek={(beat) => {
              playbackOriginRef.current = beat;
              lastPreviewSectionRef.current = null;
              setPlayheadBeat(beat);
              if (isPlaying) startPlayback(beat);
            }}
            onSelectSection={(id) => {
              setActiveSectionId(id);
              setInspectedChord(undefined);
            }}
            onFocusNotes={() => setSectionFocused(false)}
            onAddNote={(note) => {
              setInspectedChord(undefined);
              dispatch({ type: 'ADD_NOTE', note });
            }}
            onAddNotes={(notes) => {
              setInspectedChord(undefined);
              dispatch({ type: 'ADD_NOTES', notes });
            }}
            onPatchNotes={(patches, commit) => {
              setInspectedChord(undefined);
              dispatch({ type: 'PATCH_NOTES', patches, commit });
            }}
            onUpdateNotes={(notes, commit) => {
              setInspectedChord(undefined);
              dispatch({ type: 'UPDATE_NOTES', notes, commit });
            }}
            onDeleteNotes={(ids) => {
              setInspectedChord(undefined);
              dispatch({ type: 'DELETE_NOTES', ids });
            }}
          />

          <footer className="editor-statusbar">
            <div className="shortcut-hints">
              <span>
                <span className="kbd">Click</span> Draw / Move
              </span>
              <span>
                <span className="kbd">R-Click / X</span> Delete
              </span>
              <span>
                <span className="kbd">R-Click Drag</span> Box Select
              </span>
              <span>
                <span className="kbd">Middle-Drag</span> Pan
              </span>
              <span>
                <span className="kbd">R-Click Chord Bar</span> Split Chord
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span className="fn-tonic">● Tonic</span>
              <span className="fn-predominant">● Predominant</span>
              <span className="fn-dominant">● Dominant</span>
              <span className="fn-chromatic">● Borrowed</span>
            </div>
          </footer>
        </div>

        <aside className="harmony-sidebar">
          <div className="scale-strip">
            <div className="scale-strip-info">
              <span className="scale-strip-eyebrow">
                {composition.selectedScaleId ? 'Pinned Scale' : 'Detected Scale'}
              </span>
              <div className="scale-strip-name">
                <span>{analysis.activeScale?.displayName ?? '—'}</span>
                {analysis.activeScale && (
                  <span
                    className={`pill ${
                      analysis.activeScale.outsideNoteCount === 0 ? 'pill-clean' : ''
                    }`}
                    style={
                      analysis.activeScale.outsideNoteCount === 0
                        ? undefined
                        : getFitPillStyle(analysis.activeScale.coverage)
                    }
                  >
                    {analysis.activeScale.outsideNoteCount === 0
                      ? '100% · 0 out'
                      : `${Math.round(analysis.activeScale.coverage * 100)}% (${
                          analysis.activeScale.outsideNoteCount
                        } out)`}
                  </span>
                )}
              </div>
              {analysis.activeScale && (
                <span className="scale-notes-inline">
                  {analysis.activeScale.noteNames.join(' · ')}
                </span>
              )}
            </div>
            <button
              className="btn btn-sm"
              onClick={() => {
                setSidebarTab('scales');
                if (analysis.activeScale) setInspectedScale(analysis.activeScale);
              }}
            >
              Change
            </button>
          </div>

          <div className="sidebar-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={sidebarTab === 'chords'}
              className={`sidebar-tab ${sidebarTab === 'chords' ? 'is-active' : ''}`}
              onClick={() => setSidebarTab('chords')}
            >
              Section Chords
            </button>
            <button
              role="tab"
              aria-selected={sidebarTab === 'scales'}
              className={`sidebar-tab ${sidebarTab === 'scales' ? 'is-active' : ''}`}
              onClick={() => setSidebarTab('scales')}
            >
              Global Scales
            </button>
          </div>

          {sidebarTab === 'chords' ? (
            <ChordExplorer
              section={activeSection}
              sectionAnalysis={activeSectionAnalysis}
              onSelectChord={(sectionId, chordId) =>
                dispatch({ type: 'SELECT_SECTION_CHORD', sectionId, chordId })
              }
              onInspectChord={(chord) => setInspectedChord(chord)}
              onHoverChord={setHoveredChord}
              onInsertChord={(sectionId, chord) => {
                dispatch({
                  type: 'INSERT_CHORD_IN_SECTION',
                  sectionId,
                  pitchClasses: chord.pitchClasses,
                });
                const baseMidi = 48 + chord.rootPc;
                audioEngine.playChord(
                  chord.definition.intervals.map((s) => baseMidi + s),
                  0.9,
                  0.75,
                );
              }}
            />
          ) : (
            <ScaleExplorer
              scales={analysis.scales}
              selectedScaleId={composition.selectedScaleId}
              activeScaleId={analysis.activeScale?.id}
              onSelectScale={(scaleId) => dispatch({ type: 'SELECT_SCALE', scaleId })}
              onInspectScale={(scale) => setInspectedScale(scale)}
              onHoverScale={setHoveredScale}
            />
          )}

          <TheoryInspector
            mode={sidebarTab === 'scales' ? 'scale' : 'chord'}
            chord={displayedChord}
            scale={displayedScale}
          />
        </aside>
      </main>

      {isDraggingMidi && (
        <div className="drop-overlay">
          <div className="drop-overlay-box">Drop a .mid file to load it into Harmonia</div>
        </div>
      )}
    </div>
  );
};
