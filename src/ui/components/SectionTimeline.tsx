import React, { useRef } from 'react';
import type { Section } from '../../domain/music';
import type { CompositionAnalysis } from '../../domain/theory';

interface SectionTimelineProps {
  sections: Section[];
  analysis: CompositionAnalysis;
  activeSectionId: string;
  isSectionFocused: boolean;
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
  onDeleteSection: (sectionId: string) => void;
}

export const SectionTimeline: React.FC<SectionTimelineProps> = ({
  sections,
  analysis,
  activeSectionId,
  isSectionFocused,
  pixelsPerBeat,
  scrollX,
  onSelectSection,
  onSplitSection,
  onAddSectionAt,
  onMoveBoundary,
  onResizeLastSection,
  onDeleteSection,
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

  const handleLeftEdgeMouseDown = (
    e: React.MouseEvent,
    section: Section,
    prevSection?: Section,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();

    // Clicking the left edge always selects & focuses this chord section
    onSelectSection(section.id);

    if (!prevSection) return; // Beat 0 anchor stays at 0

    let moved = false;
    const startX = e.clientX;
    document.body.style.cursor = 'ew-resize';

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (moved) {
        onMoveBoundary(prevSection.id, section.id, clientXToBeat(ev.clientX), false);
      }
    };

    const onUp = (ev: MouseEvent) => {
      document.body.style.cursor = '';
      if (moved) {
        onMoveBoundary(prevSection.id, section.id, clientXToBeat(ev.clientX), true);
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startLastEdgeDrag = (e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    document.body.style.cursor = 'ew-resize';

    const onMove = (ev: MouseEvent) => {
      onResizeLastSection(sectionId, clientXToBeat(ev.clientX), false);
    };

    const onUp = (ev: MouseEvent) => {
      document.body.style.cursor = '';
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
        title="Click a chord's left edge to select (Del/X to delete) or drag to move; right-click to add/split"
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
          const isFocused = isActive && isSectionFocused;
          const isLast = idx === sorted.length - 1;
          const prevSection = idx > 0 ? sorted[idx - 1] : undefined;

          return (
            <React.Fragment key={section.id}>
              <div
                className={`section-block ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
                style={{
                  left: `${leftPx}px`,
                  width: `${Math.max(24, widthPx - 2)}px`,
                }}
                onClick={() => onSelectSection(section.id)}
                title={`${chosenChord?.fullName ?? 'Empty section'} — Click left edge to select (Del/X to delete), drag edge to move, right-click to split`}
              >
                {/* Highlighted interactive left edge */}
                <div
                  className="section-left-edge"
                  style={{ cursor: prevSection ? 'ew-resize' : 'pointer' }}
                  onMouseDown={(e) => handleLeftEdgeMouseDown(e, section, prevSection)}
                  title={
                    prevSection
                      ? 'Click to select chord (Del/X to delete) · Drag to move boundary'
                      : 'Click to select chord (Del/X to delete)'
                  }
                >
                  <div className={`section-left-edge-bar bg-fn-${fn} fn-${fn}`} />
                </div>

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
                  {sorted.length > 1 && (
                    <button
                      className="section-merge-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSection(section.id);
                      }}
                      title="Delete chord section (merges into later chord)"
                      aria-label="Delete section"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {isLast && (
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
