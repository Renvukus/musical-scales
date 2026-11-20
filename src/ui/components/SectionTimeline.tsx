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
  onAddSectionAt: (beat?: number) => void;
  onMoveBoundary: (
    leftSectionId: string,
    rightSectionId: string,
    beat: number,
    commit: boolean,
  ) => void;
  onResizeLastSection: (sectionId: string, endBeat: number, commit: boolean) => void;
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
  onAddSectionAt,
  onMoveBoundary,
  onResizeLastSection,
  onMergeWithPrev,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  const lastSection = sorted[sorted.length - 1];

  const clientXToBeat = (clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + scrollX) / pixelsPerBeat);
  };

  const handleTrackDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const beat = clientXToBeat(e.clientX);
    if (lastSection && beat > lastSection.end) {
      onAddSectionAt(beat);
    } else {
      onSplitSection(beat);
    }
  };

  const handleTrackContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const beat = clientXToBeat(e.clientX);
    onAddSectionAt(beat);
  };

  const startBoundaryDrag = (
    e: React.MouseEvent,
    leftId: string,
    rightId: string,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      onMoveBoundary(leftId, rightId, clientXToBeat(ev.clientX), false);
    };

    const onUp = (ev: MouseEvent) => {
      onMoveBoundary(leftId, rightId, clientXToBeat(ev.clientX), true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startLastEdgeDrag = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      onResizeLastSection(sectionId, clientXToBeat(ev.clientX), false);
    };

    const onUp = (ev: MouseEvent) => {
      onResizeLastSection(sectionId, clientXToBeat(ev.clientX), true);
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
        title="Right-click or double-click the chord bar to add/split sections, or drag any edge to resize"
      >
        <span>Chords</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>R-click +</span>
      </div>
      <div
        ref={trackRef}
        className="section-timeline-track"
        onDoubleClick={handleTrackDoubleClick}
        onContextMenu={handleTrackContextMenu}
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
          const isLast = idx === sorted.length - 1;

          return (
            <React.Fragment key={section.id}>
              <div
                className={`section-block ${isActive ? 'is-active' : ''}`}
                style={{
                  left: `${leftPx + 2}px`,
                  width: `${Math.max(24, widthPx - 4)}px`,
                }}
                onClick={() => onSelectSection(section.id)}
                title={`${chosenChord?.fullName ?? 'Empty section'} — Right-click to split, drag edges to resize`}
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

              {!isLast ? (
                <div
                  className="section-handle"
                  style={{ left: `${section.end * pixelsPerBeat - scrollX}px` }}
                  onMouseDown={(e) =>
                    startBoundaryDrag(e, section.id, sorted[idx + 1].id)
                  }
                  title="Drag to resize chord sections"
                />
              ) : (
                <>
                  <div
                    className="section-handle"
                    style={{ left: `${section.end * pixelsPerBeat - scrollX}px` }}
                    onMouseDown={(e) => startLastEdgeDrag(e, section.id)}
                    title="Drag to extend or shrink the last chord section"
                  />
                  <button
                    className="btn btn-sm"
                    style={{
                      position: 'absolute',
                      top: '15px',
                      left: `${section.end * pixelsPerBeat - scrollX + 10}px`,
                      opacity: 0.85,
                    }}
                    onClick={() => onAddSectionAt()}
                    title="Add a new chord section (or right-click anywhere on the chord bar)"
                  >
                    + Section
                  </button>
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
