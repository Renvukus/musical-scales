import React, { useRef } from 'react';
import type { Section } from '../../domain/music';
import type { CompositionAnalysis } from '../../domain/theory';

interface SectionTimelineProps {
  sections: Section[];
  analysis: CompositionAnalysis;
  activeSectionId: string;
  pixelsPerBeat: number;
  scrollX: number;
  onSelectSection: (sectionId: string) => void;
  onSplitSection: (beat: number) => void;
  onMoveBoundary: (
    leftSectionId: string,
    rightSectionId: string,
    beat: number,
    commit: boolean,
  ) => void;
  onMergeWithPrev: (sectionId: string) => void;
}

export const SectionTimeline: React.FC<SectionTimelineProps> = ({
  sections,
  analysis,
  activeSectionId,
  pixelsPerBeat,
  scrollX,
  onSelectSection,
  onSplitSection,
  onMoveBoundary,
  onMergeWithPrev,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const sorted = [...sections].sort((a, b) => a.start - b.start);

  const handleTrackDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const beat = (e.clientX - rect.left + scrollX) / pixelsPerBeat;
    onSplitSection(beat);
  };

  const startBoundaryDrag = (
    e: React.MouseEvent,
    leftId: string,
    rightId: string,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const beat = (ev.clientX - rect.left + scrollX) / pixelsPerBeat;
      onMoveBoundary(leftId, rightId, beat, false);
    };

    const onUp = (ev: MouseEvent) => {
      const beat = (ev.clientX - rect.left + scrollX) / pixelsPerBeat;
      onMoveBoundary(leftId, rightId, beat, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="section-timeline">
      <div
        className="section-timeline-gutter"
        title="Double-click the chord bar to split a section, or drag dividers to resize"
      >
        <span>Chords</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>2× split</span>
      </div>
      <div
        ref={trackRef}
        className="section-timeline-track"
        onDoubleClick={handleTrackDoubleClick}
      >
        {sorted.map((section, idx) => {
          const leftPx = section.start * pixelsPerBeat - scrollX;
          const widthPx = (section.end - section.start) * pixelsPerBeat;
          const secAnalysis = analysis.sections[section.id];
          const chosenChord =
            (section.selectedChordId
              ? secAnalysis?.candidates.find((c) => c.id === section.selectedChordId)
              : undefined) ?? secAnalysis?.topChord;

          const fn = chosenChord?.harmonicFunction ?? 'tonic';
          const isActive = section.id === activeSectionId;

          return (
            <React.Fragment key={section.id}>
              <div
                className={`section-block ${isActive ? 'is-active' : ''}`}
                style={{
                  left: `${leftPx + 2}px`,
                  width: `${Math.max(24, widthPx - 4)}px`,
                }}
                onClick={() => onSelectSection(section.id)}
                title={`${chosenChord?.fullName ?? 'Empty section'} — Double-click to split`}
              >
                <div className={`section-block-accent bg-fn-${fn}`} />
                <div className="section-block-top">
                  <span className="section-chord-label">
                    {chosenChord ? chosenChord.symbol : '—'}
                    {section.selectedChordId ? ' ★' : ''}
                  </span>
                  {chosenChord && (
                    <span className={`section-roman fn-${fn}`}>
                      {chosenChord.romanNumeral}
                    </span>
                  )}
                </div>
                <div className="section-meta">
                  <span>
                    {secAnalysis?.noteCount
                      ? chosenChord && chosenChord.outsideNoteCount > 0
                        ? `${chosenChord.outsideNoteCount} out`
                        : `${chosenChord?.score ?? 0}% fit`
                      : 'empty'}
                  </span>
                  {idx > 0 && (
                    <button
                      className="section-merge-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMergeWithPrev(section.id);
                      }}
                      title="Merge with previous section"
                      aria-label="Merge section"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {idx < sorted.length - 1 && (
                <div
                  className="section-handle"
                  style={{ left: `${section.end * pixelsPerBeat - scrollX}px` }}
                  onMouseDown={(e) =>
                    startBoundaryDrag(e, section.id, sorted[idx + 1].id)
                  }
                  title="Drag to resize chord section"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
