import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../../audio';
import type { ClipboardNote } from '../../domain/editor';
import type { Composition, Note, SnapGrid } from '../../domain/music';
import type {
  ChordCandidate,
  CompositionAnalysis,
  HarmonicFunction,
} from '../../domain/theory';
import { isBlackKey, midiToNoteName, toPitchClass } from '../../theory';

interface PianoRollProps {
  composition: Composition;
  analysis: CompositionAnalysis;
  activeSectionId: string;
  snap: SnapGrid;
  showGuides: boolean;
  isPlaying: boolean;
  isSectionFocused: boolean;
  playheadBeat: number;
  pixelsPerBeat: number;
  scrollX: number;
  onScrollXChange: (x: number) => void;
  onPixelsPerBeatChange: (ppb: number) => void;
  onSeek: (beat: number) => void;
  onSelectSection: (sectionId: string) => void;
  onFocusNotes: () => void;
  onAddNote: (note: Note) => void;
  onAddNotes: (notes: Note[]) => void;
  onPatchNotes: (
    patches: Array<{ id: string; start?: number; duration?: number; pitch?: number }>,
    commit: boolean,
  ) => void;
  onUpdateNotes: (notes: Note[], commit: boolean) => void;
  onDeleteNotes: (ids: string[]) => void;
}

const KEY_WIDTH = 62;
const RULER_HEIGHT = 24;
const DEFAULT_ROW_HEIGHT = 20;
const MIN_PITCH = 12; // C0
const MAX_PITCH = 108; // C8

const FN_COLORS: Record<HarmonicFunction, { fill: string; ghost: string; stroke: string }> = {
  tonic: {
    fill: '#34d399',
    ghost: 'rgba(52, 211, 153, 0.12)',
    stroke: '#6ee7b7',
  },
  predominant: {
    fill: '#f59e0b',
    ghost: 'rgba(245, 158, 11, 0.12)',
    stroke: '#fcd34d',
  },
  dominant: {
    fill: '#fb7185',
    ghost: 'rgba(251, 113, 133, 0.12)',
    stroke: '#fda4af',
  },
  chromatic: {
    fill: '#38bdf8',
    ghost: 'rgba(56, 189, 248, 0.12)',
    stroke: '#7dd3fc',
  },
};

type DragMode =
  | { type: 'none' }
  | {
      type: 'draw';
      noteId: string;
      anchorBeat: number;
      pitch: number;
    }
  | {
      type: 'move';
      originBeat: number;
      originPitch: number;
      initialNotes: Map<string, { start: number; pitch: number }>;
      lastPreviewPitch: number;
    }
  | {
      type: 'resize';
      initialDurations: Map<string, number>;
      originBeat: number;
    }
  | {
      type: 'box';
      startX: number;
      startY: number;
      currX: number;
      currY: number;
    };

export const PianoRoll: React.FC<PianoRollProps> = ({
  composition,
  analysis,
  activeSectionId,
  snap,
  showGuides,
  isPlaying,
  isSectionFocused,
  playheadBeat,
  pixelsPerBeat,
  scrollX,
  onScrollXChange,
  onPixelsPerBeatChange,
  onSeek,
  onSelectSection,
  onFocusNotes,
  onAddNote,
  onAddNotes,
  onPatchNotes,
  onUpdateNotes,
  onDeleteNotes,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const [scrollY, setScrollY] = useState(() => (MAX_PITCH - 72) * DEFAULT_ROW_HEIGHT);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipboardNote[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  const [activePitches, setActivePitches] = useState<ReadonlySet<number>>(() => new Set());
  const dragRef = useRef<DragMode>({ type: 'none' });
  const isPanningRef = useRef(false);
  const [, forceRender] = useState(0);

  // Subscribe to currently sounding pitches (both manual audition & playback)
  useEffect(() => {
    return audioEngine.subscribeActivePitches((pitches) => {
      setActivePitches(pitches);
    });
  }, []);

  // Keep latest props accessible inside window keyboard/drag/wheel handlers
  const latestRef = useRef({
    composition,
    selectedIds,
    clipboard,
    playheadBeat,
    snap,
    scrollX,
    scrollY,
    pixelsPerBeat,
    rowHeight,
    canvasSize,
    isSectionFocused,
  });
  latestRef.current = {
    composition,
    selectedIds,
    clipboard,
    playheadBeat,
    snap,
    scrollX,
    scrollY,
    pixelsPerBeat,
    rowHeight,
    canvasSize,
    isSectionFocused,
  };

  // Track devicePixelRatio changes (browser zoom in/out) so canvas stays razor sharp
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    const syncDpr = () => {
      const next = window.devicePixelRatio || 1;
      setDpr(next);
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', syncDpr);
      }
      mediaQuery = window.matchMedia(`(resolution: ${next}dppx)`);
      mediaQuery.addEventListener('change', syncDpr);
    };
    syncDpr();
    window.addEventListener('resize', syncDpr);
    return () => {
      window.removeEventListener('resize', syncDpr);
      if (mediaQuery) mediaQuery.removeEventListener('change', syncDpr);
    };
  }, []);

  // ResizeObserver for container size changes
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setCanvasSize({
          width: Math.max(200, Math.floor(rect.width)),
          height: Math.max(200, Math.floor(rect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Non-passive wheel listener: scroll = horizontal zoom, Shift+scroll = vertical zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cur = latestRef.current;

      if (e.shiftKey) {
        // Vertical zoom anchored under cursor
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        const factor = delta < 0 ? 1.12 : 0.89;
        const nextRowH = Math.max(7, Math.min(80, Math.round(cur.rowHeight * factor)));
        if (nextRowH !== cur.rowHeight) {
          const anchorY = Math.max(0, y - RULER_HEIGHT);
          const pitchRowOffset = (anchorY + cur.scrollY) / cur.rowHeight;
          const totalH = (MAX_PITCH - MIN_PITCH + 1) * nextRowH;
          const maxSY = Math.max(0, totalH - (cur.canvasSize.height - RULER_HEIGHT));
          const nextSY = Math.max(0, Math.min(maxSY, pitchRowOffset * nextRowH - anchorY));
          setRowHeight(nextRowH);
          setScrollY(nextSY);
        }
        return;
      }

      // Horizontal trackpad swipe -> pan horizontally
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0) {
        onScrollXChange(Math.max(0, cur.scrollX + e.deltaX));
        return;
      }

      // Default scroll wheel -> horizontal zoom anchored under cursor
      const factor = e.deltaY < 0 ? 1.18 : 0.84;
      const rawNext = cur.pixelsPerBeat * factor;
      const rounded =
        rawNext < 16
          ? Math.round(rawNext * 100) / 100
          : factor > 1
            ? Math.ceil(rawNext)
            : Math.floor(rawNext);
      const nextPpb = Math.max(0.5, Math.min(960, rounded));
      if (nextPpb !== cur.pixelsPerBeat) {
        const anchorX = Math.max(0, x - KEY_WIDTH);
        const anchorBeat = (anchorX + cur.scrollX) / cur.pixelsPerBeat;
        const nextSX = Math.max(0, anchorBeat * nextPpb - anchorX);
        onPixelsPerBeatChange(nextPpb);
        onScrollXChange(nextSX);
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onPixelsPerBeatChange, onScrollXChange]);

  // Coordinate converters
  const beatToX = (beat: number) => KEY_WIDTH + beat * pixelsPerBeat - scrollX;
  const xToBeat = (x: number) => (x - KEY_WIDTH + scrollX) / pixelsPerBeat;
  const pitchToY = (pitch: number) => RULER_HEIGHT + (MAX_PITCH - pitch) * rowHeight - scrollY;
  const yToPitch = (y: number) =>
    MAX_PITCH - Math.floor((y - RULER_HEIGHT + scrollY) / rowHeight);

  const roundClean = (v: number) => Math.round(v * 1e6) / 1e6;
  const snapBeat = (beat: number) => Math.max(0, roundClean(Math.round(beat / snap) * snap));
  const snapFloor = (beat: number) => Math.max(0, roundClean(Math.floor(beat / snap + 1e-6) * snap));

  // Resolve active chord per section for rendering guides & note colors
  const getSectionChord = (sectionId: string): ChordCandidate | undefined => {
    const section = composition.sections.find((s) => s.id === sectionId);
    const secAnalysis = analysis.sections[sectionId];
    if (!secAnalysis) return undefined;
    return (
      (section?.selectedChordId
        ? secAnalysis.candidates.find((c) => c.id === section.selectedChordId)
        : undefined) ?? secAnalysis.topChord
    );
  };

  // Keyboard shortcuts (LMMS-friendly: Delete / Backspace / X, Ctrl+C/V/D/A)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const { composition: comp, selectedIds: sel, clipboard: clip, playheadBeat: ph } =
        latestRef.current;
      const mod = e.ctrlKey || e.metaKey;

      if (
        !latestRef.current.isSectionFocused &&
        (e.key === 'Delete' ||
          e.key === 'Backspace' ||
          (!mod && !e.altKey && e.key.toLowerCase() === 'x'))
      ) {
        if (sel.size > 0) {
          e.preventDefault();
          onDeleteNotes(Array.from(sel));
          setSelectedIds(new Set());
        }
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(comp.notes.map((n) => n.id)));
      } else if (mod && e.key.toLowerCase() === 'c') {
        if (sel.size > 0) {
          e.preventDefault();
          const chosen = comp.notes.filter((n) => sel.has(n.id));
          const minStart = Math.min(...chosen.map((n) => n.start));
          const payloadNotes: ClipboardNote[] = chosen.map((n) => ({
            pitch: n.pitch,
            startOffset: n.start - minStart,
            duration: n.duration,
            velocity: n.velocity,
          }));
          setClipboard(payloadNotes);
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard
              .writeText(JSON.stringify({ harmoniaClipboard: 1, notes: payloadNotes }))
              .catch(() => {
                // Ignore permission errors; in-memory clipboard still works
              });
          }
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const pasteNotes = (source: ClipboardNote[]) => {
          if (source.length === 0) return;
          const pasteAt =
            Math.round(ph / latestRef.current.snap) * latestRef.current.snap;
          const newNotes: Note[] = source.map((c, idx) => ({
            id: `paste-${Date.now().toString(36)}-${idx}`,
            pitch: Math.max(0, Math.min(127, Math.round(c.pitch))),
            start: Math.max(0, roundClean(pasteAt + c.startOffset)),
            duration: Math.max(0.0625, c.duration),
            velocity: Math.max(0.05, Math.min(1, c.velocity ?? 0.78)),
          }));
          onAddNotes(newNotes);
          setSelectedIds(new Set(newNotes.map((n) => n.id)));
        };

        if (navigator.clipboard?.readText) {
          void navigator.clipboard
            .readText()
            .then((text) => {
              try {
                const parsed = JSON.parse(text) as {
                  harmoniaClipboard?: number;
                  notes?: ClipboardNote[];
                };
                if (
                  parsed?.harmoniaClipboard === 1 &&
                  Array.isArray(parsed.notes) &&
                  parsed.notes.length > 0
                ) {
                  setClipboard(parsed.notes);
                  pasteNotes(parsed.notes);
                  return;
                }
              } catch {
                // Clipboard does not contain Harmonia JSON; fall back
              }
              pasteNotes(clip);
            })
            .catch(() => {
              pasteNotes(clip);
            });
        } else {
          pasteNotes(clip);
        }
      } else if (mod && e.key.toLowerCase() === 'd') {
        if (sel.size > 0) {
          e.preventDefault();
          const chosen = comp.notes.filter((n) => sel.has(n.id));
          const minStart = Math.min(...chosen.map((n) => n.start));
          const maxEnd = Math.max(...chosen.map((n) => n.start + n.duration));
          const span = Math.max(latestRef.current.snap, maxEnd - minStart);
          const dupes: Note[] = chosen.map((n, idx) => ({
            id: `dup-${Date.now().toString(36)}-${idx}`,
            pitch: n.pitch,
            start: n.start + span,
            duration: n.duration,
            velocity: n.velocity,
          }));
          onAddNotes(dupes);
          setSelectedIds(new Set(dupes.map((n) => n.id)));
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onAddNotes, onDeleteNotes]);

  // Hit-testing notes
  const hitTestNote = (x: number, y: number): { note: Note; isRightEdge: boolean } | null => {
    for (let i = composition.notes.length - 1; i >= 0; i--) {
      const n = composition.notes[i];
      const nx = beatToX(n.start);
      const nw = Math.max(8, n.duration * pixelsPerBeat);
      const ny = pitchToY(n.pitch);
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + rowHeight) {
        return { note: n, isRightEdge: x >= nx + nw - 8 };
      }
    }
    return null;
  };

  // Mouse interactions (LMMS-inspired)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onFocusNotes();
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 0. Middle-click + drag -> pan horizontally & vertically across the composition
    if (e.button === 1) {
      e.preventDefault();
      isPanningRef.current = true;
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startScrollX = latestRef.current.scrollX;
      const startScrollY = latestRef.current.scrollY;
      canvas.style.cursor = 'grabbing';
      document.body.style.cursor = 'grabbing';

      const onPanMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        const cur = latestRef.current;
        const totalH = (MAX_PITCH - MIN_PITCH + 1) * cur.rowHeight;
        const maxSY = Math.max(0, totalH - (cur.canvasSize.height - RULER_HEIGHT));
        onScrollXChange(Math.max(0, startScrollX - dx));
        setScrollY(Math.max(0, Math.min(maxSY, startScrollY - dy)));
      };

      const onPanUp = () => {
        isPanningRef.current = false;
        canvas.style.cursor = 'crosshair';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onPanMove);
        window.removeEventListener('mouseup', onPanUp);
      };

      window.addEventListener('mousemove', onPanMove);
      window.addEventListener('mouseup', onPanUp);
      return;
    }

    // 1. Clicking or dragging on piano keyboard gutter -> preview pitches (glissando)
    if (x < KEY_WIDTH && y >= RULER_HEIGHT && e.button === 0) {
      let lastPitch = yToPitch(y);
      if (lastPitch >= MIN_PITCH && lastPitch <= MAX_PITCH) {
        audioEngine.playNote(lastPitch, 0.45, 0.8);
      }

      const onKeyMove = (ev: MouseEvent) => {
        const curRect = canvas.getBoundingClientRect();
        const localY = ev.clientY - curRect.top;
        const cur = latestRef.current;
        const nextPitch =
          MAX_PITCH - Math.floor((localY - RULER_HEIGHT + cur.scrollY) / cur.rowHeight);
        if (
          nextPitch !== lastPitch &&
          nextPitch >= MIN_PITCH &&
          nextPitch <= MAX_PITCH
        ) {
          lastPitch = nextPitch;
          audioEngine.playNote(nextPitch, 0.42, 0.8);
        }
      };

      const onKeyUp = () => {
        window.removeEventListener('mousemove', onKeyMove);
        window.removeEventListener('mouseup', onKeyUp);
      };

      window.addEventListener('mousemove', onKeyMove);
      window.addEventListener('mouseup', onKeyUp);
      return;
    }

    // 2. Clicking or dragging top beat ruler -> scrub playhead + auto-scroll at viewport edges
    if (y < RULER_HEIGHT && x >= KEY_WIDTH && e.button === 0) {
      let lastClientX = e.clientX;
      let autoScrollRaf: number | null = null;

      const seekFromClientX = (clientX: number, scrollXVal: number) => {
        const curRect = canvas.getBoundingClientRect();
        const localX = clientX - curRect.left;
        const rawBeat = Math.max(
          0,
          (localX - KEY_WIDTH + scrollXVal) / latestRef.current.pixelsPerBeat,
        );
        const step = Math.min(latestRef.current.snap, 0.25);
        onSeek(roundClean(Math.round(rawBeat / step) * step));
      };

      seekFromClientX(e.clientX, latestRef.current.scrollX);

      const stepAutoScroll = () => {
        const curRect = canvas.getBoundingClientRect();
        const rightOverflow = lastClientX - (curRect.right - 20);
        const leftOverflow = curRect.left + KEY_WIDTH + 20 - lastClientX;
        let nextSX = latestRef.current.scrollX;

        if (rightOverflow > 0) {
          const speed = Math.min(28, 6 + rightOverflow * 0.22);
          nextSX = nextSX + speed;
        } else if (leftOverflow > 0 && nextSX > 0) {
          const speed = Math.min(28, 6 + leftOverflow * 0.22);
          nextSX = Math.max(0, nextSX - speed);
        }

        if (nextSX !== latestRef.current.scrollX) {
          latestRef.current.scrollX = nextSX;
          onScrollXChange(nextSX);
          seekFromClientX(lastClientX, nextSX);
        }

        if (rightOverflow > 0 || (leftOverflow > 0 && nextSX > 0)) {
          autoScrollRaf = requestAnimationFrame(stepAutoScroll);
        } else {
          autoScrollRaf = null;
        }
      };

      const onWindowMove = (ev: MouseEvent) => {
        lastClientX = ev.clientX;
        seekFromClientX(ev.clientX, latestRef.current.scrollX);
        const curRect = canvas.getBoundingClientRect();
        const outsideEdge =
          ev.clientX > curRect.right - 20 ||
          (ev.clientX < curRect.left + KEY_WIDTH + 20 && latestRef.current.scrollX > 0);
        if (outsideEdge && autoScrollRaf === null) {
          autoScrollRaf = requestAnimationFrame(stepAutoScroll);
        }
      };

      const onWindowUp = () => {
        if (autoScrollRaf !== null) {
          cancelAnimationFrame(autoScrollRaf);
          autoScrollRaf = null;
        }
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
      };

      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
      return;
    }

    // Focus the clicked section automatically (if inside one)
    const clickedBeat = Math.max(0, xToBeat(x));
    const clickedSection = composition.sections.find(
      (s) => clickedBeat >= s.start && clickedBeat < s.end,
    );
    if (clickedSection && clickedSection.id !== activeSectionId) {
      onSelectSection(clickedSection.id);
    }

    const hit = hitTestNote(x, y);

    // 3. Right-click -> delete note if clicked on one, or start box selection on empty grid
    if (e.button === 2) {
      if (hit) {
        if (selectedIds.has(hit.note.id)) {
          onDeleteNotes(Array.from(selectedIds));
          setSelectedIds(new Set());
        } else {
          onDeleteNotes([hit.note.id]);
        }
      } else {
        dragRef.current = { type: 'box', startX: x, startY: y, currX: x, currY: y };
        forceRender((v) => v + 1);
      }
      return;
    }

    if (e.button !== 0) return;

    // 4. Ctrl+Drag on empty space -> marquee box selection (LMMS style)
    if (!hit && (e.ctrlKey || e.metaKey)) {
      dragRef.current = { type: 'box', startX: x, startY: y, currX: x, currY: y };
      forceRender((v) => v + 1);
      return;
    }

    // 5. Clicking existing note -> resize or move
    if (hit) {
      audioEngine.playNote(hit.note.pitch, 0.3, hit.note.velocity);
      if (hit.isRightEdge) {
        const resizeSelection = selectedIds.has(hit.note.id)
          ? selectedIds
          : new Set([hit.note.id]);
        if (!selectedIds.has(hit.note.id)) {
          setSelectedIds(resizeSelection);
        }
        const initialDurations = new Map<string, number>();
        for (const n of composition.notes) {
          if (resizeSelection.has(n.id)) {
            initialDurations.set(n.id, n.duration);
          }
        }
        dragRef.current = {
          type: 'resize',
          initialDurations,
          originBeat: clickedBeat,
        };
        return;
      }

      let nextSelection = new Set(selectedIds);
      if (e.shiftKey) {
        if (nextSelection.has(hit.note.id)) nextSelection.delete(hit.note.id);
        else nextSelection.add(hit.note.id);
      } else if (!nextSelection.has(hit.note.id)) {
        nextSelection = new Set([hit.note.id]);
      }
      setSelectedIds(nextSelection);

      const initialNotes = new Map<string, { start: number; pitch: number }>();
      for (const n of composition.notes) {
        if (nextSelection.has(n.id)) {
          initialNotes.set(n.id, { start: n.start, pitch: n.pitch });
        }
      }
      dragRef.current = {
        type: 'move',
        originBeat: clickedBeat,
        originPitch: yToPitch(y),
        initialNotes,
        lastPreviewPitch: hit.note.pitch,
      };
      return;
    }

    // 6. Left-click on empty grid -> place new note anywhere (even beyond current sections)
    const pitch = yToPitch(y);
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) return;
    const start = snapFloor(clickedBeat);
    const newNote: Note = {
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      pitch,
      start,
      duration: snap,
      velocity: 0.78,
    };
    onAddNote(newNote);
    setSelectedIds(new Set([newNote.id]));
    audioEngine.playNote(pitch, 0.35, 0.8);
    dragRef.current = {
      type: 'draw',
      noteId: newNote.id,
      anchorBeat: start,
      pitch,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const drag = dragRef.current;

    // Dynamic cursor feedback when hovering (zero React re-renders)
    if (drag.type === 'none') {
      if (y < RULER_HEIGHT && x >= KEY_WIDTH) {
        canvas.style.cursor = 'ew-resize';
      } else if (x < KEY_WIDTH && y >= RULER_HEIGHT) {
        canvas.style.cursor = 'pointer';
      } else {
        const hit = hitTestNote(x, y);
        if (hit) {
          canvas.style.cursor = hit.isRightEdge ? 'ew-resize' : 'grab';
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }
      return;
    }

    const currBeat = Math.max(0, xToBeat(x));
    const currPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, yToPitch(y)));

    if (drag.type === 'box') {
      canvas.style.cursor = 'crosshair';
      drag.currX = x;
      drag.currY = y;
      forceRender((v) => v + 1);
      return;
    }

    if (drag.type === 'draw') {
      canvas.style.cursor = 'ew-resize';
      const nextDuration = Math.max(snap, snapBeat(currBeat - drag.anchorBeat));
      if (currPitch !== drag.pitch) {
        drag.pitch = currPitch;
        audioEngine.playNote(currPitch, 0.25, 0.75);
      }
      onPatchNotes(
        [{ id: drag.noteId, duration: nextDuration, pitch: currPitch }],
        false,
      );
      return;
    }

    if (drag.type === 'resize') {
      canvas.style.cursor = 'ew-resize';
      const delta = currBeat - drag.originBeat;
      const patches: Array<{ id: string; duration: number }> = [];
      for (const [id, initDur] of drag.initialDurations.entries()) {
        patches.push({
          id,
          duration: Math.max(snap, snapBeat(initDur + delta)),
        });
      }
      onPatchNotes(patches, false);
      return;
    }

    if (drag.type === 'move') {
      canvas.style.cursor = 'grabbing';
      const deltaBeat = roundClean(Math.round((currBeat - drag.originBeat) / snap) * snap);
      const deltaPitch = currPitch - drag.originPitch;
      if (currPitch !== drag.lastPreviewPitch) {
        drag.lastPreviewPitch = currPitch;
        audioEngine.playNote(currPitch, 0.2, 0.65);
      }
      const patches: Array<{ id: string; start: number; pitch: number }> = [];
      for (const [id, init] of drag.initialNotes.entries()) {
        patches.push({
          id,
          start: Math.max(0, roundClean(init.start + deltaBeat)),
          pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, init.pitch + deltaPitch)),
        });
      }
      onPatchNotes(patches, false);
    }
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    if (drag.type === 'none') return;

    if (drag.type === 'box') {
      const minX = Math.min(drag.startX, drag.currX);
      const maxX = Math.max(drag.startX, drag.currX);
      const minY = Math.min(drag.startY, drag.currY);
      const maxY = Math.max(drag.startY, drag.currY);
      const nextSel = new Set<string>();
      for (const n of composition.notes) {
        const nx = beatToX(n.start);
        const nw = n.duration * pixelsPerBeat;
        const ny = pitchToY(n.pitch);
        if (nx + nw >= minX && nx <= maxX && ny + rowHeight >= minY && ny <= maxY) {
          nextSel.add(n.id);
        }
      }
      setSelectedIds(nextSel);
      dragRef.current = { type: 'none' };
      forceRender((v) => v + 1);
      return;
    }

    if (drag.type === 'move' || drag.type === 'resize') {
      onUpdateNotes(composition.notes, true);
    }
    dragRef.current = { type: 'none' };
  };

  // Render Canvas at crisp native devicePixelRatio (even when browser is zoomed!)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const activeScaleSet = new Set<number>(analysis.activeScale?.pitchClasses ?? []);
    const beatsPerBar =
      composition.timeSignature.numerator * (4 / composition.timeSignature.denominator);
    const visibleEndBeat = Math.ceil((width - KEY_WIDTH + scrollX) / pixelsPerBeat) + 2;
    const renderMaxBeat = Math.max(composition.totalBeats, visibleEndBeat);

    // Background
    ctx.fillStyle = '#0f1116';
    ctx.fillRect(0, 0, width, height);

    // 1. Pitch Rows + Scale Ghost Guides
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = pitchToY(pitch);
      if (y + rowHeight < RULER_HEIGHT || y > height) continue;

      const pc = toPitchClass(pitch);
      const black = isBlackKey(pitch);
      ctx.fillStyle = black ? '#12151d' : '#161a24';
      ctx.fillRect(KEY_WIDTH, y, width - KEY_WIDTH, rowHeight);

      if (showGuides && activeScaleSet.has(pc)) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.055)';
        ctx.fillRect(KEY_WIDTH, y, width - KEY_WIDTH, rowHeight);
      }

      // Crisp 1px horizontal divider
      const lineY = Math.floor(y + rowHeight) + 0.5;
      ctx.strokeStyle = pc === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.035)';
      ctx.beginPath();
      ctx.moveTo(KEY_WIDTH, lineY);
      ctx.lineTo(width, lineY);
      ctx.stroke();
    }

    // 2. Per-Section Chord Ghost Guides & Section Dividers
    for (const section of composition.sections) {
      const sx = Math.max(KEY_WIDTH, beatToX(section.start));
      const ex = Number.isFinite(section.end)
        ? Math.min(width, beatToX(section.end))
        : width;
      if (ex <= KEY_WIDTH || sx >= width) continue;

      const chord = getSectionChord(section.id);
      const isActiveSec = section.id === activeSectionId;

      if (isActiveSec) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(sx, RULER_HEIGHT, ex - sx, height - RULER_HEIGHT);
      }

      if (showGuides && chord) {
        const chordSet = new Set<number>(chord.pitchClasses);
        const palette = FN_COLORS[chord.harmonicFunction];
        for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
          const y = pitchToY(pitch);
          if (y + rowHeight < RULER_HEIGHT || y > height) continue;
          const pc = toPitchClass(pitch);
          if (chordSet.has(pc)) {
            ctx.fillStyle = isActiveSec
              ? palette.ghost.replace('0.12', '0.18')
              : palette.ghost;
            ctx.fillRect(sx, y + 1, ex - sx, rowHeight - 2);
            if (pc === chord.rootPc && isActiveSec) {
              ctx.fillStyle = palette.fill;
              ctx.globalAlpha = 0.45;
              ctx.fillRect(sx, y + 1, 3, rowHeight - 2);
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // Section left-edge boundary vertical dashed line
      if (section.start > 0) {
        const bx = Math.floor(beatToX(section.start)) + 0.5;
        if (bx >= KEY_WIDTH && bx <= width) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(bx, RULER_HEIGHT);
          ctx.lineTo(bx, height);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 3. Vertical Snap, Beat & Bar Grid Lines across the full visible canvas
    const startBeatVis = Math.max(0, Math.floor(scrollX / pixelsPerBeat));

    // 3a. Active snap subdivision lines (triplet-safe integer indexing)
    const firstSnapIdx = Math.max(0, Math.floor(startBeatVis / snap));
    const lastSnapIdx = Math.ceil(renderMaxBeat / snap);
    const snapPx = snap * pixelsPerBeat;
    if (snapPx >= 5) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
      ctx.beginPath();
      for (let idx = firstSnapIdx; idx <= lastSnapIdx; idx++) {
        const b = idx * snap;
        const x = Math.floor(beatToX(b)) + 0.5;
        if (x < KEY_WIDTH || x > width) continue;
        ctx.moveTo(x, RULER_HEIGHT);
        ctx.lineTo(x, height);
      }
      ctx.stroke();
    }

    // 3b. Beat and Bar structural lines (adaptive spacing when zoomed way out)
    const barPx = beatsPerBar * pixelsPerBeat;
    const barGridStep = Math.pow(2, Math.max(0, Math.ceil(Math.log2(14 / Math.max(0.5, barPx)))));
    const beatStep = pixelsPerBeat >= 8 ? 1 : beatsPerBar * barGridStep;
    const alignedStart = Math.floor(startBeatVis / beatStep) * beatStep;
    for (let b = alignedStart; b <= renderMaxBeat; b += beatStep) {
      const x = Math.floor(beatToX(b)) + 0.5;
      if (x < KEY_WIDTH || x > width) continue;
      const isBar = b % beatsPerBar === 0;
      ctx.strokeStyle = isBar
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(255, 255, 255, 0.095)';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 4. Placed MIDI Notes
    for (const note of composition.notes) {
      const nx = beatToX(note.start);
      const nw = Math.max(8, note.duration * pixelsPerBeat);
      const ny = pitchToY(note.pitch);
      if (nx + nw < KEY_WIDTH || nx > width || ny + rowHeight < RULER_HEIGHT || ny > height) {
        continue;
      }

      const mid = note.start + note.duration / 2;
      const ownerSec = composition.sections.find((s) => mid >= s.start && mid < s.end);
      const chord = ownerSec ? getSectionChord(ownerSec.id) : undefined;
      const pc = toPitchClass(note.pitch);
      const inChord = chord ? chord.pitchClasses.includes(pc) : true;
      const palette = FN_COLORS[chord?.harmonicFunction ?? 'tonic'];
      const isSelected = selectedIds.has(note.id);
      const isNoteSounding =
        isPlaying && playheadBeat >= note.start && playheadBeat < note.start + note.duration;

      const drawX = Math.max(KEY_WIDTH, nx);
      const drawW = Math.max(4, nx + nw - drawX - 1);

      ctx.fillStyle = isNoteSounding
        ? '#fde047'
        : ownerSec
          ? inChord
            ? palette.fill
            : '#64748b'
          : '#94a3b8';
      ctx.globalAlpha = isNoteSounding || isSelected ? 1 : 0.88;
      ctx.beginPath();
      ctx.roundRect(drawX, ny + 2, drawW, rowHeight - 4, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (ownerSec && !inChord && showGuides && !isNoteSounding) {
        ctx.fillStyle = '#e29578';
        ctx.fillRect(drawX, ny + 2, 4, rowHeight - 4);
      }

      if (isSelected || isNoteSounding) {
        ctx.strokeStyle = isNoteSounding ? '#fef9c3' : '#ffffff';
        ctx.lineWidth = isNoteSounding ? 1.8 : 1.5;
        ctx.beginPath();
        ctx.roundRect(drawX + 0.5, ny + 2.5, drawW - 1, rowHeight - 5, 4);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      const noteFontSize = Math.max(8, Math.min(14, Math.round(rowHeight * 0.54)));
      if (rowHeight >= 11 && drawW >= noteFontSize * 2.6) {
        ctx.fillStyle = isNoteSounding || !ownerSec || inChord ? '#091114' : '#f1f5f9';
        ctx.font = `600 ${noteFontSize}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(midiToNoteName(note.pitch), drawX + 6, ny + rowHeight / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // 5. Box Selection Marquee
    const drag = dragRef.current;
    if (drag.type === 'box') {
      const bx = Math.min(drag.startX, drag.currX);
      const by = Math.min(drag.startY, drag.currY);
      const bw = Math.abs(drag.currX - drag.startX);
      const bh = Math.abs(drag.currY - drag.startY);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.strokeStyle = '#38bdf8';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
    }

    // 6. Playhead Line
    const phX = Math.floor(beatToX(playheadBeat)) + 0.5;
    if (phX >= KEY_WIDTH && phX <= width) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // 7. Top Beat Ruler (clickable & draggable to scrub playhead)
    ctx.fillStyle = '#151821';
    ctx.fillRect(KEY_WIDTH, 0, width - KEY_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT + 0.5);
    ctx.lineTo(width, RULER_HEIGHT + 0.5);
    ctx.stroke();

    // Snap index ticks along the bottom edge of the timeline ruler
    if (snapPx >= 5) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.42)';
      ctx.beginPath();
      for (let idx = firstSnapIdx; idx <= lastSnapIdx; idx++) {
        const b = idx * snap;
        const x = Math.floor(beatToX(b)) + 0.5;
        if (x < KEY_WIDTH || x > width) continue;
        const isBeat = Math.abs(b - Math.round(b)) < 1e-4;
        const tickH = isBeat ? 7 : 4;
        ctx.moveTo(x, RULER_HEIGHT - tickH);
        ctx.lineTo(x, RULER_HEIGHT);
      }
      ctx.stroke();
    }

    ctx.font = '500 10px "JetBrains Mono", monospace';
    const barLabelStep = Math.pow(
      2,
      Math.max(0, Math.ceil(Math.log2(42 / Math.max(0.5, barPx)))),
    );
    const showBeatLabels = pixelsPerBeat >= 26;
    const rulerStep = showBeatLabels ? 1 : beatsPerBar * barLabelStep;
    const rulerStart = Math.floor(startBeatVis / rulerStep) * rulerStep;
    for (let b = rulerStart; b <= renderMaxBeat; b += rulerStep) {
      const x = beatToX(b);
      if (x < KEY_WIDTH - 10 || x > width) continue;
      if (b % beatsPerBar === 0) {
        const barNum = Math.floor(b / beatsPerBar) + 1;
        if ((barNum - 1) % barLabelStep === 0) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(barPx < 52 ? `${barNum}` : `Bar ${barNum}`, x + 5, 14);
        }
      } else if (showBeatLabels) {
        ctx.fillStyle = '#5c6476';
        ctx.fillText(`.${(b % beatsPerBar) + 1}`, x + 4, 14);
      }
    }

    // Playhead cap on ruler
    if (phX >= KEY_WIDTH && phX <= width) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(phX - 5, 0);
      ctx.lineTo(phX + 5, 0);
      ctx.lineTo(phX, 9);
      ctx.closePath();
      ctx.fill();
    }

    // 8. Left Piano Keyboard Gutter
    ctx.fillStyle = '#151821';
    ctx.fillRect(0, 0, KEY_WIDTH, height);
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = pitchToY(pitch);
      if (y + rowHeight < RULER_HEIGHT || y > height) continue;
      const black = isBlackKey(pitch);
      const pc = toPitchClass(pitch);
      const inScale = showGuides && activeScaleSet.has(pc);
      const isKeyPlaying = activePitches.has(pitch);

      ctx.fillStyle = isKeyPlaying
        ? '#fbbf24'
        : black
          ? '#191d28'
          : '#262b38';
      ctx.fillRect(0, y, KEY_WIDTH - 1, rowHeight - 1);

      if (inScale && !isKeyPlaying) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.35)';
        ctx.fillRect(KEY_WIDTH - 5, y + 2, 4, Math.max(2, rowHeight - 4));
      }

      const showKeyLabel =
        isKeyPlaying || (rowHeight >= 12 ? pc === 0 || !black : pc === 0 && rowHeight >= 8);
      if (showKeyLabel) {
        const keyFontSize =
          isKeyPlaying || pc === 0
            ? Math.max(7.5, Math.min(13, Math.round(rowHeight * 0.52 * 2) / 2))
            : Math.max(7, Math.min(11.5, Math.round(rowHeight * 0.45 * 2) / 2));
        ctx.fillStyle = isKeyPlaying ? '#091114' : pc === 0 ? '#eef1f6' : '#7b8396';
        ctx.font =
          isKeyPlaying || pc === 0
            ? `600 ${keyFontSize}px "JetBrains Mono", monospace`
            : `400 ${keyFontSize}px "JetBrains Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(midiToNoteName(pitch), 8, y + rowHeight / 2 + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // Corner cap
    ctx.fillStyle = '#151821';
    ctx.fillRect(0, 0, KEY_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(KEY_WIDTH + 0.5, 0);
    ctx.lineTo(KEY_WIDTH + 0.5, height);
    ctx.stroke();
  });

  return (
    <div ref={wrapperRef} className="piano-roll-wrapper">
      <canvas
        ref={canvasRef}
        className="piano-roll-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishDrag}
        onMouseLeave={finishDrag}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
      />
    </div>
  );
};
