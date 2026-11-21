import React, { useEffect, useRef, useState } from 'react';
import type { SampleLoadState, SynthPatch } from '../../audio';
import { SNAP_OPTIONS, type SnapGrid, type TimeSignature } from '../../domain/music';
import { PRESETS } from '../../state/presets';

const TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 6, denominator: 4 },
];

interface TopBarProps {
  title: string;
  isPlaying: boolean;
  loop: boolean;
  tempo: number;
  timeSignature: TimeSignature;
  snap: SnapGrid;
  patch: SynthPatch;
  sampleState: SampleLoadState;
  canUndo: boolean;
  canRedo: boolean;
  showGuides: boolean;
  chordPreview: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onTitleChange: (title: string) => void;
  onTempoChange: (tempo: number) => void;
  onTimeSignatureChange: (ts: TimeSignature) => void;
  onSnapChange: (snap: SnapGrid) => void;
  onPatchChange: (patch: SynthPatch) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGuides: () => void;
  onToggleChordPreview: () => void;
  onSelectPreset: (presetId: string) => void;
  onNewProject: () => void;
  onImportMidi: (file: File) => void;
  onExportMidi: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  isPlaying,
  loop,
  tempo,
  timeSignature,
  snap,
  patch,
  sampleState,
  canUndo,
  canRedo,
  showGuides,
  chordPreview,
  onTogglePlay,
  onStop,
  onToggleLoop,
  onTitleChange,
  onTempoChange,
  onTimeSignatureChange,
  onSnapChange,
  onPatchChange,
  onUndo,
  onRedo,
  onToggleGuides,
  onToggleChordPreview,
  onSelectPreset,
  onNewProject,
  onImportMidi,
  onExportMidi,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tempoDraft, setTempoDraft] = useState(String(tempo));

  useEffect(() => {
    setTempoDraft(String(tempo));
  }, [tempo]);

  const commitTempo = () => {
    const parsed = Number(tempoDraft);
    if (!Number.isFinite(parsed) || tempoDraft.trim() === '') {
      setTempoDraft(String(tempo));
      return;
    }
    const clamped = Math.max(40, Math.min(240, Math.round(parsed)));
    setTempoDraft(String(clamped));
    if (clamped !== tempo) onTempoChange(clamped);
  };

  return (
    <header className="topbar">
      <div className="topbar-group">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            H
          </div>
          <h1 className="brand-title">Harmonia</h1>
        </div>

        <input
          id="input-project-title"
          type="text"
          className="project-title-input"
          value={title}
          placeholder="Untitled Project"
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          title="Project name (used when saving .harmonia.json or exporting .mid)"
          aria-label="Project name"
        />

        <div className="divider-v" />

        <button
          id="btn-play"
          className={`btn ${isPlaying ? 'btn-active' : 'btn-primary'}`}
          onClick={onTogglePlay}
          title="Play / Pause (Space)"
        >
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button
          id="btn-stop"
          className="btn"
          onClick={onStop}
          title="Stop & return to start"
        >
          ■ Stop
        </button>
        <button
          id="btn-loop"
          className={`btn ${loop ? 'btn-active' : ''}`}
          onClick={onToggleLoop}
          title="Toggle loop playback"
        >
          ↻ Loop
        </button>

        <div className="divider-v" />

        <label className="control-field" title="Tempo (BPM)">
          <span>BPM</span>
          <input
            id="input-tempo"
            type="number"
            min={40}
            max={240}
            value={tempoDraft}
            onChange={(e) => {
              const raw = e.target.value;
              setTempoDraft(raw);
              const parsed = Number(raw);
              if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 40 && parsed <= 240) {
                onTempoChange(Math.round(parsed));
              }
            }}
            onBlur={commitTempo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTempo();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setTempoDraft(String(tempo));
                e.currentTarget.blur();
              }
            }}
          />
        </label>

        <select
          id="select-time-sig"
          className="control-select"
          style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
          value={`${timeSignature.numerator}/${timeSignature.denominator}`}
          onChange={(e) => {
            const [num, den] = e.target.value.split('/').map(Number);
            if (num && den) onTimeSignatureChange({ numerator: num, denominator: den });
          }}
          title="Time signature"
        >
          {TIME_SIGNATURES.map((ts) => {
            const key = `${ts.numerator}/${ts.denominator}`;
            return (
              <option key={key} value={key}>
                {key}
              </option>
            );
          })}
        </select>

        <label className="control-field" title="Grid snap resolution">
          <span>Snap</span>
          <select
            id="select-snap"
            className="control-select"
            style={{ border: 'none', height: '24px', padding: '0 2px', background: 'transparent' }}
            value={snap}
            onChange={(e) => onSnapChange(Number(e.target.value) as SnapGrid)}
          >
            {SNAP_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.beats}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <select
          id="select-patch"
          className="control-select"
          value={patch}
          onChange={(e) => onPatchChange(e.target.value as SynthPatch)}
          title="Instrument sound"
        >
          <option value="grand">
            {sampleState === 'loading'
              ? 'Grand Piano (Loading…)'
              : sampleState === 'error'
                ? 'Grand Piano (Offline)'
                : 'Grand Piano (Sampled)'}
          </option>
          <option value="epiano">Piano Synth</option>
          <option value="triangle">Triangle Synth</option>
        </select>

        <button
          id="btn-guides"
          className={`btn ${showGuides ? 'btn-active' : ''}`}
          onClick={onToggleGuides}
          title="Toggle scale & chord ghost note highlights on piano roll"
        >
          Guides: {showGuides ? 'On' : 'Off'}
        </button>

        <button
          id="btn-chord-preview"
          className={`btn ${chordPreview ? 'btn-active' : ''}`}
          onClick={onToggleChordPreview}
          title="Auto-play each section's chord whenever the playhead enters a new chord"
        >
          ♪ Preview: {chordPreview ? 'On' : 'Off'}
        </button>
      </div>

      <div className="topbar-group">
        <button
          id="btn-undo"
          className="btn"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          id="btn-redo"
          className="btn"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>

        <div className="divider-v" />

        <select
          id="select-preset"
          className="control-select"
          defaultValue={PRESETS[0].id}
          onChange={(e) => onSelectPreset(e.target.value)}
          title="Load example composition"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi,.json,.harmonia.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportMidi(file);
            e.target.value = '';
          }}
        />
        <button
          id="btn-new-project"
          className="btn"
          onClick={onNewProject}
          title="Start a new empty project"
        >
          + New
        </button>
        <button
          id="btn-import-midi"
          className="btn"
          onClick={() => fileInputRef.current?.click()}
          title="Import a .mid or .harmonia.json project file (or drag & drop anywhere)"
        >
          Import
        </button>
        <button
          id="btn-export-midi"
          className="btn"
          onClick={onExportMidi}
          title="Export to .mid for LMMS / REAPER"
        >
          Export .mid
        </button>
      </div>
    </header>
  );
};
