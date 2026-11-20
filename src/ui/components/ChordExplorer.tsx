import React from 'react';
import { audioEngine } from '../../audio';
import type { Section } from '../../domain/music';
import type { ChordCandidate, SectionAnalysis } from '../../domain/theory';

interface ChordExplorerProps {
  section?: Section;
  sectionAnalysis?: SectionAnalysis;
  onSelectChord: (sectionId: string, chordId?: string) => void;
  onInspectChord: (chord: ChordCandidate) => void;
  onHoverChord: (chord?: ChordCandidate) => void;
  onInsertChord: (sectionId: string, chord: ChordCandidate) => void;
}

export const ChordExplorer: React.FC<ChordExplorerProps> = ({
  section,
  sectionAnalysis,
  onSelectChord,
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

  const topCandidates = sectionAnalysis.candidates.slice(0, 18);
  const activeChordId = section.selectedChordId ?? sectionAnalysis.topChord?.id;

  const auditionChord = (e: React.MouseEvent, chord: ChordCandidate) => {
    e.stopPropagation();
    const baseMidi = 48 + chord.rootPc; // C3..B3 root
    const pitches = chord.definition.intervals.map((semi) => baseMidi + semi);
    audioEngine.playChord(pitches, 0.95, 0.78);
  };

  return (
    <div className="explorer-list" onMouseLeave={() => onHoverChord(undefined)}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 2px 4px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Beats {section.start + 1}–{section.end} · {sectionAnalysis.noteCount} note
          {sectionAnalysis.noteCount === 1 ? '' : 's'}
          {sectionAnalysis.isAmbiguous ? ' · Multiple strong fits' : ''}
        </span>
        {section.selectedChordId && (
          <button
            className="btn btn-sm"
            onClick={() => onSelectChord(section.id, undefined)}
            title="Use automatically detected top chord"
          >
            Auto
          </button>
        )}
      </div>

      {topCandidates.map((chord) => {
        const isActive = chord.id === activeChordId;
        const isPinned = chord.id === section.selectedChordId;
        const fn = chord.harmonicFunction;

        return (
          <div
            key={chord.id}
            className={`candidate-row ${isActive ? 'is-selected' : ''}`}
            onMouseEnter={() => onHoverChord(chord)}
            onClick={() => {
              onSelectChord(section.id, isPinned ? undefined : chord.id);
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
                    <span className="pill pill-clean">0 out</span>
                  ) : (
                    <span
                      className="pill pill-outside"
                      title={`Outside notes: ${chord.outsidePitchNames.join(', ')}`}
                    >
                      {chord.outsideNoteCount} out
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
