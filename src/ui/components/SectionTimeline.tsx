import React, { useRef } from 'react';
import type { Section, SnapGrid } from '../../domain/music';
import type { CompositionAnalysis } from '../../domain/theory';
import { getFitTextColor } from '../fitColor';

interface SectionTimelineProps {
  sections: Section[];
  analysis: CompositionAnalysis;
  activeSectionId: string;
  isSectionFocused: boolean;
  snap: SnapGrid;
  pixelsPerBeat: number;
  scrollX: number;
  onSelectSection: (sectionId: string) => void;
  onSplitSection: (beat: number, snap: SnapGrid) => void;
  onMoveBoundary: (
    leftSectionId: string,
    rightSectionId: string,
    beat: number,
    snap: SnapGrid,
    commit: boolean,
  ) => void;
  onDeleteSection: (sectionId: string) => void;
}

export const SectionTimeline: React.FC<SectionTimelineProps> = ({
  sections,
  analysis,
  activeSectionId,
  isSectionFocused,
  snap,
  pixelsPerBeat,
  scrollX,
  onSelectSection,
  onSplitSection,
  onMoveBoundary,
  onDeleteSection,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const sorted = [...sections].sort((a, b) => a.start - b.start);

  const clientXToBeat = (clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + scrollX) / pixelsPerBeat);
  };

  const handleTrackSplit = (clientX: number) => {
    const beat = clientXToBeat(clientX);
    onSplitSection(beat, snap);
  };

  const handleLeftEdgeMouseDown = (
    e: React.MouseEvent,
    section: Section,
    prevSection?: Section,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();

    onSelectSection(section.id);

    if (!prevSection) return; // First chord is anchored at beat 0

    let moved = false;
    const startX = e.clientX;
    document.body.style.cursor = 'ew-resize';

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (moved) {
        onMoveBoundary(prevSection.id, section.id, clientXToBeat(ev.clientX), snap, false);
      }
    };

    const onUp = (ev: MouseEvent) => {
      document.body.style.cursor = '';
      if (moved) {
        onMoveBoundary(prevSection.id, section.id, clientXToBeat(ev.clientX), snap, true);
      }
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
        title="Click a chord's left edge to select (Del/X to delete) or drag to move; right-click or double-click to split at the current snap"
      >
        <span>Chords</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>R-click split</span>
      </div>
      <div
        ref={trackRef}
        className="section-timeline-track"
        onDoubleClick={(e) => handleTrackSplit(e.clientX)}
        onContextMenu={(e) => {
          e.preventDefault();
          handleTrackSplit(e.clientX);
        }}
      >
        {sorted.map((section, idx) => {
          const leftPx = section.start * pixelsPerBeat - scrollX;
          const isLast = idx === sorted.length - 1;
          const finiteWidthPx = Number.isFinite(section.end)
            ? (section.end - section.start) * pixelsPerBeat
            : 0;
          const secAnalysis = analysis.sections[section.id];
          const chosenChord =
            (section.selectedChordId
              ? secAnalysis?.candidates.find((c) => c.id === section.selectedChordId)
              : undefined) ?? secAnalysis?.topChord;

          const fn = chosenChord?.harmonicFunction ?? 'tonic';
          const isActive = section.id === activeSectionId;
          const isFocused = isActive && isSectionFocused;
          const prevSection = idx > 0 ? sorted[idx - 1] : undefined;

          // Last chord extends to the end of time (right edge of the timeline)
          const blockStyle: React.CSSProperties = isLast
            ? {
                left: `${leftPx}px`,
                right: '0px',
                minWidth: '48px',
                borderRadius: '0',
                borderRight: 'none',
              }
            : {
                left: `${leftPx}px`,
                width: `${Math.max(24, finiteWidthPx - 2)}px`,
              };

          return (
            <div
              key={section.id}
              className={`section-block ${isActive ? 'is-active' : ''} ${isFocused ? 'is-focused' : ''}`}
              style={blockStyle}
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
                  {secAnalysis?.noteCount ? (
                    chosenChord && chosenChord.outsideNoteCount > 0 ? (
                      <span style={{ color: getFitTextColor(chosenChord.noteFit) }}>
                        {Math.round(chosenChord.noteFit * 100)}% ({chosenChord.outsideNoteCount} out)
                      </span>
                    ) : (
                      `${chosenChord?.score ?? 0}% fit`
                    )
                  ) : (
                    'empty'
                  )}
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
          );
        })}
      </div>
    </div>
  );
};
