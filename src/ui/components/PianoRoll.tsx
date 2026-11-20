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
  playheadBeat: number;
  pixelsPerBeat: number;
  scrollX: number;
  onScrollXChange: (x: number) => void;
  onPixelsPerBeatChange: (ppb: number) => void;
  onSeek: (beat: number) => void;
  onSelectSection: (sectionId: string) => void;
  onAddNote: (note: Note) => void;
  onAddNotes: (notes: Note[]) => void;
  onUpdateNotes: (notes: Note[], commit: boolean) => void;
  onDeleteNotes: (ids: string[]) => void;
}

const KEY_WIDTH = 62;
const RULER_HEIGHT = 24;
const ROW_HEIGHT = 20;
const MIN_PITCH = 36; // C2
const MAX_PITCH = 84; // C6

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
      noteId: string;
      initialDuration: number;
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
  playheadBeat,
  pixelsPerBeat,
  scrollX,
  onScrollXChange,
  onPixelsPerBeatChange,
  onSeek,
  onSelectSection,
  onAddNote,
  onAddNotes,
  onUpdateNotes,
  onDeleteNotes,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollY, setScrollY] = useState(() => (MAX_PITCH - 72) * ROW_HEIGHT);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipboardNote[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
  const dragRef = useRef<DragMode>({ type: 'none' });
  const [, forceRender] = useState(0);

  // Keep latest props accessible inside window keyboard/drag handlers
  const latestRef = useRef({
    composition,
    selectedIds,
    clipboard,
    playheadBeat,
    snap,
    scrollX,
    scrollY,
    pixelsPerBeat,
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
  };

  // ResizeObserver for crisp HiDPI canvas sizing
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

  // Coordinate converters
  const beatToX = (beat: number) => KEY_WIDTH + beat * pixelsPerBeat - scrollX;
  const xToBeat = (x: number) => (x - KEY_WIDTH + scrollX) / pixelsPerBeat;
  const pitchToY = (pitch: number) => RULER_HEIGHT + (MAX_PITCH - pitch) * ROW_HEIGHT - scrollY;
  const yToPitch = (y: number) =>
    MAX_PITCH - Math.floor((y - RULER_HEIGHT + scrollY) / ROW_HEIGHT);

  const snapBeat = (beat: number) => Math.max(0, Math.round(beat / snap) * snap);
  const snapFloor = (beat: number) => Math.max(0, Math.floor(beat / snap) * snap);

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

  // Keyboard shortcuts (LMMS-friendly: Delete, Ctrl+C/V/D/A)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const { composition: comp, selectedIds: sel, clipboard: clip, playheadBeat: ph } =
        latestRef.current;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Delete' || e.key === 'Backspace') {
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
          setClipboard(
            chosen.map((n) => ({
              pitch: n.pitch,
              startOffset: n.start - minStart,
              duration: n.duration,
              velocity: n.velocity,
            })),
          );
        }
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (clip.length > 0) {
          e.preventDefault();
          const pasteAt = Math.round(ph / latestRef.current.snap) * latestRef.current.snap;
          const newNotes: Note[] = clip.map((c, idx) => ({
            id: `paste-${Date.now().toString(36)}-${idx}`,
            pitch: c.pitch,
            start: Math.min(comp.totalBeats - 0.25, pasteAt + c.startOffset),
            duration: c.duration,
            velocity: c.velocity,
          }));
          onAddNotes(newNotes);
          setSelectedIds(new Set(newNotes.map((n) => n.id)));
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
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + ROW_HEIGHT) {
        return { note: n, isRightEdge: x >= nx + nw - 8 };
      }
    }
    return null;
  };

  // Mouse interactions (LMMS-inspired)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1. Clicking piano keyboard gutter -> preview pitch
    if (x < KEY_WIDTH && y >= RULER_HEIGHT) {
      const pitch = yToPitch(y);
      if (pitch >= MIN_PITCH && pitch <= MAX_PITCH) {
        audioEngine.playNote(pitch, 0.45, 0.8);
      }
      return;
    }

    // 2. Clicking top beat ruler -> seek playhead
    if (y < RULER_HEIGHT && x >= KEY_WIDTH) {
      const beat = Math.max(0, Math.min(composition.totalBeats, xToBeat(x)));
      onSeek(snapBeat(beat));
      return;
    }

    // Focus the clicked section automatically
    const clickedBeat = xToBeat(x);
    const clickedSection = composition.sections.find(
      (s) => clickedBeat >= s.start && clickedBeat < s.end,
    );
    if (clickedSection && clickedSection.id !== activeSectionId) {
      onSelectSection(clickedSection.id);
    }

    const hit = hitTestNote(x, y);

    // 3. Right-click -> LMMS instant delete
    if (e.button === 2) {
      if (hit) {
        if (selectedIds.has(hit.note.id)) {
          onDeleteNotes(Array.from(selectedIds));
          setSelectedIds(new Set());
        } else {
          onDeleteNotes([hit.note.id]);
        }
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
        setSelectedIds(new Set([hit.note.id]));
        dragRef.current = {
          type: 'resize',
          noteId: hit.note.id,
          initialDuration: hit.note.duration,
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

    // 6. Left-click on empty grid -> place new note & drag to size
    const pitch = yToPitch(y);
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) return;
    const start = Math.min(composition.totalBeats - snap, snapFloor(clickedBeat));
    const newNote: Note = {
      id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      pitch,
      start,
      duration: Math.max(snap, 0.5),
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
    const drag = dragRef.current;
    if (drag.type === 'none') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const currBeat = xToBeat(x);
    const currPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, yToPitch(y)));

    if (drag.type === 'box') {
      drag.currX = x;
      drag.currY = y;
      forceRender((v) => v + 1);
      return;
    }

    if (drag.type === 'draw') {
      const nextDuration = Math.max(snap, snapBeat(currBeat - drag.anchorBeat));
      const updated = composition.notes.map((n) =>
        n.id === drag.noteId ? { ...n, duration: nextDuration } : n,
      );
      onUpdateNotes(updated, false);
      return;
    }

    if (drag.type === 'resize') {
      const delta = currBeat - drag.originBeat;
      const nextDuration = Math.max(snap, snapBeat(drag.initialDuration + delta));
      const updated = composition.notes.map((n) =>
        n.id === drag.noteId ? { ...n, duration: nextDuration } : n,
      );
      onUpdateNotes(updated, false);
      return;
    }

    if (drag.type === 'move') {
      const deltaBeat = Math.round((currBeat - drag.originBeat) / snap) * snap;
      const deltaPitch = currPitch - drag.originPitch;
      if (currPitch !== drag.lastPreviewPitch) {
        drag.lastPreviewPitch = currPitch;
        audioEngine.playNote(currPitch, 0.2, 0.65);
      }
      const updated = composition.notes.map((n) => {
        const init = drag.initialNotes.get(n.id);
        if (!init) return n;
        return {
          ...n,
          start: Math.max(0, Math.min(composition.totalBeats - n.duration, init.start + deltaBeat)),
          pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, init.pitch + deltaPitch)),
        };
      });
      onUpdateNotes(updated, false);
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
        if (nx + nw >= minX && nx <= maxX && ny + ROW_HEIGHT >= minY && ny <= maxY) {
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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      onPixelsPerBeatChange(Math.max(40, Math.min(180, Math.round(pixelsPerBeat * factor))));
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      const maxScrollX = Math.max(
        0,
        composition.totalBeats * pixelsPerBeat - (canvasSize.width - KEY_WIDTH) + 40,
      );
      onScrollXChange(Math.max(0, Math.min(maxScrollX, scrollX + delta)));
    } else {
      const totalGridHeight = (MAX_PITCH - MIN_PITCH + 1) * ROW_HEIGHT;
      const maxScrollY = Math.max(0, totalGridHeight - (canvasSize.height - RULER_HEIGHT));
      setScrollY((prev) => Math.max(0, Math.min(maxScrollY, prev + e.deltaY)));
    }
  };

  // Render Canvas at 60fps when state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { width, height } = canvasSize;
    const activeScaleSet = new Set<number>(analysis.activeScale?.pitchClasses ?? []);
    const beatsPerBar = composition.timeSignature.numerator;

    // Background
    ctx.fillStyle = '#0f1116';
    ctx.fillRect(0, 0, width, height);

    // 1. Pitch Rows + Scale Ghost Guides
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = pitchToY(pitch);
      if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;

      const pc = toPitchClass(pitch);
      const black = isBlackKey(pitch);
      ctx.fillStyle = black ? '#12151d' : '#161a24';
      ctx.fillRect(KEY_WIDTH, y, width - KEY_WIDTH, ROW_HEIGHT);

      if (showGuides && activeScaleSet.has(pc)) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.055)';
        ctx.fillRect(KEY_WIDTH, y, width - KEY_WIDTH, ROW_HEIGHT);
      }

      // Subtle horizontal row divider (stronger on C notes)
      ctx.strokeStyle = pc === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.035)';
      ctx.beginPath();
      ctx.moveTo(KEY_WIDTH, y + ROW_HEIGHT);
      ctx.lineTo(width, y + ROW_HEIGHT);
      ctx.stroke();
    }

    // 2. Per-Section Chord Ghost Guides & Section Dividers
    for (const section of composition.sections) {
      const sx = Math.max(KEY_WIDTH, beatToX(section.start));
      const ex = Math.min(width, beatToX(section.end));
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
          if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;
          const pc = toPitchClass(pitch);
          if (chordSet.has(pc)) {
            ctx.fillStyle = isActiveSec
              ? palette.ghost.replace('0.12', '0.18')
              : palette.ghost;
            ctx.fillRect(sx, y + 1, ex - sx, ROW_HEIGHT - 2);
            // Subtle root dot hint
            if (pc === chord.rootPc && isActiveSec) {
              ctx.fillStyle = palette.fill;
              ctx.globalAlpha = 0.45;
              ctx.fillRect(sx, y + 1, 3, ROW_HEIGHT - 2);
              ctx.globalAlpha = 1;
            }
          }
        }
      }

      // Section boundary vertical dashed line
      if (section.start > 0) {
        const bx = beatToX(section.start);
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

    // 3. Vertical Beat & Bar Grid Lines
    const step = Math.min(snap, 1);
    for (let b = 0; b <= composition.totalBeats; b += step) {
      const x = beatToX(b);
      if (x < KEY_WIDTH || x > width) continue;
      const isBar = Math.abs(b % beatsPerBar) < 0.001;
      const isBeat = Math.abs(b - Math.round(b)) < 0.001;
      ctx.strokeStyle = isBar
        ? 'rgba(255, 255, 255, 0.16)'
        : isBeat
          ? 'rgba(255, 255, 255, 0.07)'
          : 'rgba(255, 255, 255, 0.025)';
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
      if (nx + nw < KEY_WIDTH || nx > width || ny + ROW_HEIGHT < RULER_HEIGHT || ny > height) {
        continue;
      }

      // Find which section owns the note's midpoint
      const mid = note.start + note.duration / 2;
      const ownerSec =
        composition.sections.find((s) => mid >= s.start && mid < s.end) ??
        composition.sections[0];
      const chord = ownerSec ? getSectionChord(ownerSec.id) : undefined;
      const pc = toPitchClass(note.pitch);
      const inChord = chord ? chord.pitchClasses.includes(pc) : true;
      const palette = FN_COLORS[chord?.harmonicFunction ?? 'tonic'];
      const isSelected = selectedIds.has(note.id);

      const drawX = Math.max(KEY_WIDTH, nx);
      const drawW = Math.max(4, nx + nw - drawX - 1);

      ctx.fillStyle = inChord ? palette.fill : '#64748b';
      ctx.globalAlpha = isSelected ? 1 : 0.88;
      ctx.beginPath();
      ctx.roundRect(drawX, ny + 2, drawW, ROW_HEIGHT - 4, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Subtle terracotta marker on outside/non-chord notes (informational, not harsh red)
      if (!inChord && showGuides) {
        ctx.fillStyle = '#e29578';
        ctx.fillRect(drawX, ny + 2, 4, ROW_HEIGHT - 4);
      }

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(drawX + 0.5, ny + 2.5, drawW - 1, ROW_HEIGHT - 5, 4);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Note name label when note is wide enough
      if (drawW >= 28) {
        ctx.fillStyle = inChord ? '#091114' : '#f1f5f9';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText(midiToNoteName(note.pitch), drawX + 6, ny + ROW_HEIGHT - 6);
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
    const phX = beatToX(playheadBeat);
    if (phX >= KEY_WIDTH && phX <= width) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // 7. Top Beat Ruler
    ctx.fillStyle = '#151821';
    ctx.fillRect(KEY_WIDTH, 0, width - KEY_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    ctx.fillStyle = '#8b93a5';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    for (let b = 0; b < composition.totalBeats; b += 1) {
      const x = beatToX(b);
      if (x < KEY_WIDTH - 10 || x > width) continue;
      if (b % beatsPerBar === 0) {
        const barNum = Math.floor(b / beatsPerBar) + 1;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`Bar ${barNum}`, x + 5, 15);
      } else {
        ctx.fillStyle = '#5c6476';
        ctx.fillText(`.${(b % beatsPerBar) + 1}`, x + 4, 15);
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
      if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;
      const black = isBlackKey(pitch);
      const pc = toPitchClass(pitch);
      const inScale = showGuides && activeScaleSet.has(pc);

      ctx.fillStyle = black ? '#191d28' : '#262b38';
      ctx.fillRect(0, y, KEY_WIDTH - 1, ROW_HEIGHT - 1);

      if (inScale) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.35)';
        ctx.fillRect(KEY_WIDTH - 5, y + 2, 4, ROW_HEIGHT - 4);
      }

      if (pc === 0 || !black) {
        ctx.fillStyle = pc === 0 ? '#eef1f6' : '#7b8396';
        ctx.font = pc === 0 ? '600 10px "JetBrains Mono", monospace' : '400 9px "JetBrains Mono", monospace';
        ctx.fillText(midiToNoteName(pitch), 8, y + ROW_HEIGHT - 6);
      }
    }

    // Corner cap
    ctx.fillStyle = '#151821';
    ctx.fillRect(0, 0, KEY_WIDTH, RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(KEY_WIDTH, 0);
    ctx.lineTo(KEY_WIDTH, height);
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
        onWheel={handleWheel}
      />
    </div>
  );
};
