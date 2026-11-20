import React, { useRef } from 'react';
import type { Section, SnapGrid } from '../../domain/music';
import type { CompositionAnalysis } from '../../domain/theory';
import { resolveSectionChord } from '../../theory';
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
  onClearSections: () => void;
  onAutoSegment: () => void;
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
  onClearSections,
  onAutoSegment,
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
        <button
          id="btn-auto-chords"
          className="btn btn-sm"
          style={{ height: '19px', width: '50px', padding: '0 4px', fontSize: '9.5px', textTransform: 'none', letterSpacing: 'normal' }}
          onClick={onAutoSegment}
          title="Auto-detect chord section boundaries from your notes (Ctrl+Z to undo)"
        >
          Auto
        </button>
        <button
          id="btn-clear-chords"
          className="btn btn-sm"
          style={{ height: '19px', width: '50px', padding: '0 4px', fontSize: '9.5px', textTransform: 'none', letterSpacing: 'normal' }}
          disabled={sorted.length <= 1 && !sorted[0]?.selectedChordId && !sorted[0]?.chordConstraint}
          onClick={onClearSections}
          title="Clear all chord splits and pinned chords (Ctrl+Z to undo)"
        >
          Clear
        </button>
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
          const chosenChord = resolveSectionChord(section, secAnalysis);

          const fn = chosenChord?.harmonicFunction ?? 'tonic';
          const isActive = section.id === activeSectionId;
          const isFocused = isActive && isSectionFocused;
          const prevSection = idx > 0 ? sorted[idx - 1] : undefined;

          // Last chord extends to the end of time (right edge of the timeline)
          const blockStyle: React.CSSProperties = isLast
            ? {
                left: `${leftPx}px`,
                right: '0px',
                minWidth: '16px',
                borderRadius: '0',
                borderRight: 'none',
              }
            : {
                left: `${leftPx}px`,
                width: `${Math.max(6, finiteWidthPx - 2)}px`,
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

              <div className="section-block-content">
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
                  {secAnalysis?.noteCount ? (
                    chosenChord && chosenChord.outsideNoteCount > 0 ? (
                      <span style={{ color: getFitTextColor(chosenChord.noteFit) }}>
                        {Math.round(chosenChord.noteFit * 100)}% ({chosenChord.outsideNoteCount} out)
                      </span>
                    ) : (
                      <span>{chosenChord?.score ?? 0}% fit</span>
                    )
                  ) : (
                    <span>empty</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
