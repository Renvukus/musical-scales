import React from 'react';
import { audioEngine } from '../../audio';
import type { ScaleCandidate } from '../../domain/theory';

interface ScaleExplorerProps {
  scales: ScaleCandidate[];
  selectedScaleId?: string;
  activeScaleId?: string;
  onSelectScale: (scaleId?: string) => void;
  onInspectScale: (scale: ScaleCandidate) => void;
}

export const ScaleExplorer: React.FC<ScaleExplorerProps> = ({
  scales,
  selectedScaleId,
  activeScaleId,
  onSelectScale,
  onInspectScale,
}) => {
  const topScales = scales.slice(0, 18);

  const auditionScale = (e: React.MouseEvent, scale: ScaleCandidate) => {
    e.stopPropagation();
    const baseMidi = 60 + scale.rootPc;
    scale.definition.intervals.forEach((semi, idx) => {
      window.setTimeout(() => {
        audioEngine.playNote(baseMidi + semi, 0.28, 0.72);
      }, idx * 120);
    });
  };

  return (
    <div className="explorer-list">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 2px 4px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Ranked by note fit &amp; tonal gravity
        </span>
        {selectedScaleId && (
          <button
            className="btn btn-sm"
            onClick={() => onSelectScale(undefined)}
            title="Return to automatic top scale detection"
          >
            Reset to Auto
          </button>
        )}
      </div>

      {topScales.map((scale) => {
        const isActive = scale.id === activeScaleId;
        const isPinned = scale.id === selectedScaleId;

        return (
          <div
            key={scale.id}
            className={`candidate-row ${isActive ? 'is-selected' : ''}`}
            onClick={() => {
              onSelectScale(isPinned ? undefined : scale.id);
              onInspectScale(scale);
            }}
          >
            <div
              className={`candidate-accent-bar ${
                scale.definition.category === 'minor'
                  ? 'bg-fn-chromatic'
                  : scale.definition.category === 'mode'
                    ? 'bg-fn-predominant'
                    : 'bg-fn-tonic'
              }`}
            />
            <div className="candidate-top">
              <div className="candidate-title-group">
                <span className="candidate-symbol">
                  {scale.displayName}
                  {isPinned ? ' ★' : ''}
                </span>
                <span className="pill pill-muted">{scale.definition.category}</span>
              </div>
              <span className="candidate-score">{scale.score}%</span>
            </div>

            <div className="candidate-bottom">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px' }}>
                {scale.noteNames.join(' · ')}
              </span>
              <div className="candidate-actions">
                {scale.outsideNoteCount === 0 ? (
                  <span className="pill pill-clean">0 out</span>
                ) : (
                  <span
                    className="pill pill-outside"
                    title={`Outside notes: ${scale.outsidePitchNames.join(', ')}`}
                  >
                    {scale.outsideNoteCount} out
                  </span>
                )}
                <button
                  className="btn btn-sm"
                  onClick={(e) => auditionScale(e, scale)}
                  title={`Hear ${scale.displayName}`}
                >
                  ▶
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
