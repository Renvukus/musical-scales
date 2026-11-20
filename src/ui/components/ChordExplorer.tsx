import React from 'react';
import { audioEngine } from '../../audio';
import type { Section } from '../../domain/music';
import type {
  ChordCandidate,
  ChordConstraint,
  ChordQualityFamily,
  HarmonicFunction,
  SectionAnalysis,
} from '../../domain/theory';
import { filterCandidatesByConstraint } from '../../theory';
import { getFitPillStyle } from '../fitColor';

interface ChordExplorerProps {
  section?: Section;
  sectionAnalysis?: SectionAnalysis;
  onSelectChord: (sectionId: string, chordId?: string) => void;
  onSetConstraint: (sectionId: string, constraint?: ChordConstraint) => void;
  onInspectChord: (chord: ChordCandidate) => void;
  onHoverChord: (chord?: ChordCandidate) => void;
  onInsertChord: (sectionId: string, chord: ChordCandidate) => void;
}

const FUNCTION_OPTIONS: Array<{
  value?: HarmonicFunction;
  label: string;
  colorClass?: string;
}> = [
  { value: undefined, label: 'Any' },
  { value: 'tonic', label: 'Tonic', colorClass: 'fn-tonic' },
  { value: 'predominant', label: 'Predom', colorClass: 'fn-predominant' },
  { value: 'dominant', label: 'Dominant', colorClass: 'fn-dominant' },
  { value: 'chromatic', label: 'Borrowed', colorClass: 'fn-chromatic' },
];

const QUALITY_OPTIONS: Array<{ value?: ChordQualityFamily; label: string }> = [
  { value: undefined, label: 'Any' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'seventh', label: '7th' },
  { value: 'triad', label: 'Triad' },
  { value: 'suspended', label: 'Sus' },
  { value: 'dim-aug', label: 'Dim/Aug' },
];

function formatConstraintTag(constraint?: ChordConstraint): string {
  if (!constraint) return 'Auto';
  const parts: string[] = [];
  if (constraint.harmonicFunction) {
    const fnOpt = FUNCTION_OPTIONS.find((o) => o.value === constraint.harmonicFunction);
    if (fnOpt) parts.push(fnOpt.label);
  }
  if (constraint.qualityFamily) {
    const qOpt = QUALITY_OPTIONS.find((o) => o.value === constraint.qualityFamily);
    if (qOpt) parts.push(qOpt.label);
  }
  return parts.length > 0 ? `Auto · ${parts.join(' ')}` : 'Auto';
}

export const ChordExplorer: React.FC<ChordExplorerProps> = ({
  section,
  sectionAnalysis,
  onSelectChord,
  onSetConstraint,
  onInspectChord,
  onHoverChord,
  onInsertChord,
}) => {
  if (!section || !sectionAnalysis) {
    return (
      <div className="explorer-list">
        <p style={{ color: 'var(--text-muted)', padding: '12px' }}>
          Select a section on the chord bar to view ranked chord suggestions.
        </p>
      </div>
    );
  }

  const constraint = section.chordConstraint;
  const filteredCandidates = filterCandidatesByConstraint(
    sectionAnalysis.candidates,
    constraint,
  );
  const topCandidates = filteredCandidates.slice(0, 18);
  const autoChord = filteredCandidates[0] ?? sectionAnalysis.topChord;
  const isAutoSelected = !section.selectedChordId;

  const auditionChord = (e: React.MouseEvent, chord: ChordCandidate) => {
    e.stopPropagation();
    const baseMidi = 48 + chord.rootPc; // C3..B3 root
    const pitches = chord.definition.intervals.map((semi) => baseMidi + semi);
    audioEngine.playChord(pitches, 0.95, 0.78);
  };

  const applyConstraint = (next: ChordConstraint) => {
    const cleaned: ChordConstraint | undefined =
      next.harmonicFunction || next.qualityFamily ? next : undefined;
    onSetConstraint(section.id, cleaned);
    const nextFiltered = filterCandidatesByConstraint(
      sectionAnalysis.candidates,
      cleaned,
    );
    const nextAuto = nextFiltered[0];
    if (nextAuto) {
      onInspectChord(nextAuto);
      const baseMidi = 48 + nextAuto.rootPc;
      audioEngine.playChord(
        nextAuto.definition.intervals.map((s) => baseMidi + s),
        0.75,
        0.72,
      );
    }
  };

  const rangeLabel = Number.isFinite(section.end)
    ? `Beats ${section.start + 1}–${section.end}`
    : `Beats ${section.start + 1}+`;

  return (
    <div className="explorer-list" onMouseLeave={() => onHoverChord(undefined)}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 2px 2px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {rangeLabel} · {sectionAnalysis.noteCount} note
          {sectionAnalysis.noteCount === 1 ? '' : 's'}
          {sectionAnalysis.isAmbiguous ? ' · Multiple strong fits' : ''}
        </span>
      </div>

      {/* Versatile Chord Role / Type Auto-Constraint Selector */}
      <div className="constraint-panel">
        <div className="constraint-row">
          <span className="constraint-label">Role</span>
          {FUNCTION_OPTIONS.map((opt) => {
            const active = constraint?.harmonicFunction === opt.value;
            return (
              <button
                key={opt.label}
                className={`constraint-chip ${active ? 'is-active' : ''} ${opt.colorClass ?? ''}`}
                onClick={() =>
                  applyConstraint({
                    ...constraint,
                    harmonicFunction: opt.value,
                  })
                }
                title={
                  opt.value
                    ? `Keep chord automatic, constrained to ${opt.label} chords`
                    : 'Allow any harmonic role'
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="constraint-row">
          <span className="constraint-label">Type</span>
          {QUALITY_OPTIONS.map((opt) => {
            const active = constraint?.qualityFamily === opt.value;
            return (
              <button
                key={opt.label}
                className={`constraint-chip ${active ? 'is-active' : ''}`}
                onClick={() =>
                  applyConstraint({
                    ...constraint,
                    qualityFamily: opt.value,
                  })
                }
                title={
                  opt.value
                    ? `Keep chord automatic, constrained to ${opt.label} chords`
                    : 'Allow any chord type'
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Prominent always-visible Auto chord card */}
      {autoChord && (
        <div
          className={`candidate-row ${isAutoSelected ? 'is-selected' : ''}`}
          style={{
            marginBottom: '4px',
            borderColor: isAutoSelected ? 'var(--border-strong)' : 'var(--border-medium)',
          }}
          onMouseEnter={() => onHoverChord(autoChord)}
          onClick={() => {
            onSelectChord(section.id, undefined);
            onInspectChord(autoChord);
            const baseMidi = 48 + autoChord.rootPc;
            audioEngine.playChord(
              autoChord.definition.intervals.map((s) => baseMidi + s),
              0.75,
              0.72,
            );
          }}
          title="Automatically pick the highest-scoring chord matching your selected Role/Type filters"
        >
          <div className={`candidate-accent-bar bg-fn-${autoChord.harmonicFunction}`} />
          <div className="candidate-top">
            <div className="candidate-title-group">
              <span className="pill pill-clean" style={{ fontSize: '10px' }}>
                {formatConstraintTag(constraint)}
              </span>
              <span className="candidate-symbol">
                {autoChord.symbol}
                {isAutoSelected ? ' ★' : ''}
              </span>
              <span className={`candidate-roman soft-fn-${autoChord.harmonicFunction}`}>
                {autoChord.romanNumeral}
              </span>
            </div>
            <span className="candidate-score">{autoChord.score}%</span>
          </div>

          <div className="candidate-bottom">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
              {autoChord.noteNames.join(' · ')}
            </span>
            <div className="candidate-actions">
              {sectionAnalysis.noteCount > 0 &&
                (autoChord.outsideNoteCount === 0 ? (
                  <span className="pill pill-clean">100% · 0 out</span>
                ) : (
                  <span
                    className="pill"
                    style={getFitPillStyle(autoChord.noteFit)}
                    title={`Outside notes: ${autoChord.outsidePitchNames.join(', ')}`}
                  >
                    {Math.round(autoChord.noteFit * 100)}% ({autoChord.outsideNoteCount} out)
                  </span>
                ))}
              <button
                className="btn btn-sm"
                onClick={(e) => auditionChord(e, autoChord)}
                title={`Play ${autoChord.fullName}`}
              >
                ▶
              </button>
              <button
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertChord(section.id, autoChord);
                }}
                title={`Insert ${autoChord.symbol} into this section`}
              >
                + Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          padding: '2px 2px 0',
        }}
      >
        {constraint ? 'Matching Chords' : 'Ranked Chords'}
      </div>

      {topCandidates.map((chord) => {
        const isPinned = chord.id === section.selectedChordId;
        const fn = chord.harmonicFunction;
        const inPct = Math.round(chord.noteFit * 100);

        return (
          <div
            key={chord.id}
            className={`candidate-row ${isPinned ? 'is-selected' : ''}`}
            onMouseEnter={() => onHoverChord(chord)}
            onClick={() => {
              onSelectChord(section.id, chord.id);
              onInspectChord(chord);
              const baseMidi = 48 + chord.rootPc;
              audioEngine.playChord(
                chord.definition.intervals.map((s) => baseMidi + s),
                0.75,
                0.72,
              );
            }}
          >
            <div className={`candidate-accent-bar bg-fn-${fn}`} />
            <div className="candidate-top">
              <div className="candidate-title-group">
                <span className="candidate-symbol">
                  {chord.symbol}
                  {isPinned ? ' ★' : ''}
                </span>
                <span className={`candidate-roman soft-fn-${fn}`}>
                  {chord.romanNumeral}
                </span>
                {!chord.isDiatonic && (
                  <span className="pill pill-muted">borrowed</span>
                )}
              </div>
              <span className="candidate-score">{chord.score}%</span>
            </div>

            <div className="candidate-bottom">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
                {chord.noteNames.join(' · ')}
              </span>

              <div className="candidate-actions">
                {sectionAnalysis.noteCount > 0 &&
                  (chord.outsideNoteCount === 0 ? (
                    <span className="pill pill-clean">100% · 0 out</span>
                  ) : (
                    <span
                      className="pill"
                      style={getFitPillStyle(chord.noteFit)}
                      title={`Outside notes: ${chord.outsidePitchNames.join(', ')}`}
                    >
                      {inPct}% ({chord.outsideNoteCount} out)
                    </span>
                  ))}
                <button
                  className="btn btn-sm"
                  onClick={(e) => auditionChord(e, chord)}
                  title={`Play ${chord.fullName}`}
                >
                  ▶
                </button>
                <button
                  className="btn btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertChord(section.id, chord);
                  }}
                  title={`Insert ${chord.symbol} triad/voicing into this section`}
                >
                  + Insert
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
