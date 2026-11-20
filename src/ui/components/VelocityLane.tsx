import React, { useEffect, useRef, useState } from 'react';
import type { Composition, Note } from '../../domain/music';
import type { CompositionAnalysis, HarmonicFunction } from '../../domain/theory';
import { resolveSectionChord, toPitchClass } from '../../theory';

interface VelocityLaneProps {
  composition: Composition;
  analysis: CompositionAnalysis;
  selectedNoteIds: string[];
  pixelsPerBeat: number;
  scrollX: number;
  playheadBeat: number;
  onPatchNotes: (
    patches: Array<{ id: string; velocity?: number; muted?: boolean }>,
    commit: boolean,
  ) => void;
  onUpdateNotes: (notes: Note[], commit: boolean) => void;
}

const FN_FILL: Record<HarmonicFunction, string> = {
  tonic: '#34d399',
  predominant: '#f59e0b',
  dominant: '#fb7185',
  chromatic: '#38bdf8',
};

const PAD_TOP = 8;
const PAD_BOTTOM = 6;

export const VelocityLane: React.FC<VelocityLaneProps> = ({
  composition,
  analysis,
  selectedNoteIds,
  pixelsPerBeat,
  scrollX,
  playheadBeat,
  onPatchNotes,
  onUpdateNotes,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [dragVelPct, setDragVelPct] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 68 });
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  const selectedSet = new Set(selectedNoteIds);
  const selectedNotes = composition.notes.filter((n) => selectedSet.has(n.id));
  const allSelectedMuted =
    selectedNotes.length > 0 && selectedNotes.every((n) => Boolean(n.muted));

  // Track active velocity drag
  const dragRef = useRef<{
    active: boolean;
    mode: 'locked' | 'sweep' | 'multi';
    lockedIds: string[];
    initialVelocities: Map<string, number>;
    anchorVel: number;
    lastX: number;
    dirty: boolean;
  }>({
    active: false,
    mode: 'sweep',
    lockedIds: [],
    initialVelocities: new Map(),
    anchorVel: 0.8,
    lastX: 0,
    dirty: false,
  });

  const latestRef = useRef({
    composition,
    selectedSet,
    pixelsPerBeat,
    scrollX,
    size,
  });
  latestRef.current = { composition, selectedSet, pixelsPerBeat, scrollX, size };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isOpen) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  useEffect(() => {
    const updateDpr = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', updateDpr);
    return () => window.removeEventListener('resize', updateDpr);
  }, []);

  const beatToX = (beat: number) => beat * pixelsPerBeat - scrollX;
  const velToY = (vel: number, h: number) => {
    const usable = Math.max(10, h - PAD_TOP - PAD_BOTTOM);
    const clamped = Math.max(0.05, Math.min(1, vel));
    return PAD_TOP + usable * (1 - clamped);
  };
  const yToVel = (y: number, h: number) => {
    const usable = Math.max(10, h - PAD_TOP - PAD_BOTTOM);
    const norm = 1 - (y - PAD_TOP) / usable;
    return Math.max(0.05, Math.min(1, Math.round(norm * 100) / 100));
  };

  const handleToggleMuteSelected = () => {
    if (selectedNotes.length === 0) return;
    const nextMuted = !allSelectedMuted;
    onPatchNotes(
      selectedNotes.map((n) => ({ id: n.id, muted: nextMuted })),
      true,
    );
  };

  // Hit test closest note stem/head
  const findNotesNearX = (x: number, radius = 10): Note[] => {
    const { composition: comp, selectedSet: sel } = latestRef.current;
    const matches = comp.notes.filter((n) => Math.abs(beatToX(n.start) - x) <= radius);
    if (matches.length === 0) return [];
    const selMatches = matches.filter((n) => sel.has(n.id));
    return selMatches.length > 0 ? selMatches : matches;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = size.height;

    // Right-click or Alt+Click -> toggle mute on hit note(s)
    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      const hits = findNotesNearX(x, 12);
      if (hits.length === 0) return;
      // Pick closest handle vertically if multiple notes share the beat
      let target = hits[0];
      let bestDist = Infinity;
      for (const n of hits) {
        const d = Math.abs(velToY(n.velocity, h) - y);
        if (d < bestDist) {
          bestDist = d;
          target = n;
        }
      }
      const group =
        selectedSet.has(target.id) && selectedNotes.length > 1
          ? selectedNotes
          : [target];
      const nextMuted = !group.every((n) => Boolean(n.muted));
      onPatchNotes(
        group.map((n) => ({ id: n.id, muted: nextMuted })),
        true,
      );
      return;
    }

    if (e.button !== 0) return;

    const vel = yToVel(y, h);
    const hits = findNotesNearX(x, 11);

    if (selectedNotes.length > 1) {
      // Multi-select: drag velocity for all selected notes together (preserving relative dynamics)
      const initialVelocities = new Map<string, number>();
      let sum = 0;
      for (const n of selectedNotes) {
        initialVelocities.set(n.id, n.velocity);
        sum += n.velocity;
      }
      const hitSelected = hits.find((n) => selectedSet.has(n.id));
      const anchorVel = hitSelected ? hitSelected.velocity : sum / selectedNotes.length;
      const delta = vel - anchorVel;

      dragRef.current = {
        active: true,
        mode: 'multi',
        lockedIds: selectedNotes.map((n) => n.id),
        initialVelocities,
        anchorVel,
        lastX: x,
        dirty: true,
      };
      setDragVelPct(Math.round(vel * 100));
      onPatchNotes(
        selectedNotes.map((n) => ({
          id: n.id,
          velocity: Math.max(0.05, Math.min(1, n.velocity + delta)),
        })),
        false,
      );
    } else if (hits.length > 0) {
      // Check if cursor is directly targeting one of multiple stacked notes at this beat
      let chosen: Note[];
      if (hits.length > 1 && !hits.every((n) => selectedSet.has(n.id))) {
        let best = hits[0];
        let bestDist = Infinity;
        for (const n of hits) {
          const d = Math.abs(velToY(n.velocity, h) - y);
          if (d < bestDist) {
            bestDist = d;
            best = n;
          }
        }
        chosen = [best];
      } else {
        chosen = hits;
      }

      dragRef.current = {
        active: true,
        mode: 'locked',
        lockedIds: chosen.map((n) => n.id),
        initialVelocities: new Map(),
        anchorVel: vel,
        lastX: x,
        dirty: true,
      };
      setDragVelPct(Math.round(vel * 100));
      onPatchNotes(
        chosen.map((n) => ({ id: n.id, velocity: vel })),
        false,
      );
    } else {
      dragRef.current = {
        active: true,
        mode: 'sweep',
        lockedIds: [],
        initialVelocities: new Map(),
        anchorVel: vel,
        lastX: x,
        dirty: false,
      };
      setDragVelPct(Math.round(vel * 100));
    }

    const onWindowMove = (ev: MouseEvent) => {
      const cur = dragRef.current;
      if (!cur.active) return;
      const curRect = canvas.getBoundingClientRect();
      const mx = ev.clientX - curRect.left;
      const my = ev.clientY - curRect.top;
      const v = yToVel(my, latestRef.current.size.height);
      setDragVelPct(Math.round(v * 100));

      if (cur.mode === 'multi') {
        const delta = v - cur.anchorVel;
        onPatchNotes(
          cur.lockedIds.map((id) => {
            const initVel = cur.initialVelocities.get(id) ?? cur.anchorVel;
            return {
              id,
              velocity: Math.max(0.05, Math.min(1, initVel + delta)),
            };
          }),
          false,
        );
        cur.dirty = true;
        return;
      }

      // If user started locked on a note but dragged horizontally > 16px, switch to sweep mode
      if (cur.mode === 'locked' && Math.abs(mx - cur.lastX) > 16) {
        cur.mode = 'sweep';
      }

      if (cur.mode === 'locked') {
        onPatchNotes(
          cur.lockedIds.map((id) => ({ id, velocity: v })),
          false,
        );
        cur.dirty = true;
      } else {
        const minX = Math.min(cur.lastX, mx) - 6;
        const maxX = Math.max(cur.lastX, mx) + 6;
        const { composition: comp, selectedSet: sel, pixelsPerBeat: ppb, scrollX: sx } =
          latestRef.current;
        const pool = sel.size > 0 ? comp.notes.filter((n) => sel.has(n.id)) : comp.notes;
        const swept = pool.filter((n) => {
          const nx = n.start * ppb - sx;
          return nx >= minX && nx <= maxX;
        });
        if (swept.length > 0) {
          onPatchNotes(
            swept.map((n) => ({ id: n.id, velocity: v })),
            false,
          );
          cur.dirty = true;
        }
        cur.lastX = mx;
      }
    };

    const onWindowUp = () => {
      if (dragRef.current.dirty) {
        onUpdateNotes(latestRef.current.composition.notes, true);
      }
      dragRef.current = {
        active: false,
        mode: 'sweep',
        lockedIds: [],
        initialVelocities: new Map(),
        anchorVel: 0.8,
        lastX: 0,
        dirty: false,
      };
      setDragVelPct(null);
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', onWindowUp);
    };

    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp);
  };

  // Render velocity lane canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = size;
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(0, 0, width, height);

    // Horizontal reference lines (25%, 50%, 75%)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (const level of [0.25, 0.5, 0.75]) {
      const y = Math.floor(velToY(level, height)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical beat / bar lines aligned with PianoRoll
    const beatsPerBar =
      composition.timeSignature.numerator * (4 / composition.timeSignature.denominator);
    const startBeatVis = Math.max(0, Math.floor(scrollX / pixelsPerBeat));
    const endBeatVis = Math.ceil((width + scrollX) / pixelsPerBeat) + 1;
    const barPx = beatsPerBar * pixelsPerBeat;
    const barGridStep = Math.pow(
      2,
      Math.max(0, Math.ceil(Math.log2(14 / Math.max(0.5, barPx)))),
    );
    const beatStep = pixelsPerBeat >= 8 ? 1 : beatsPerBar * barGridStep;
    const alignedStart = Math.floor(startBeatVis / beatStep) * beatStep;

    for (let b = alignedStart; b <= endBeatVis; b += beatStep) {
      const x = Math.floor(beatToX(b)) + 0.5;
      if (x < 0 || x > width) continue;
      const isBar = b % beatsPerBar === 0;
      ctx.strokeStyle = isBar
        ? 'rgba(255, 255, 255, 0.16)'
        : 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw note velocity stems (draw unselected first, selected on top)
    const orderedNotes = [
      ...composition.notes.filter((n) => !selectedSet.has(n.id)),
      ...composition.notes.filter((n) => selectedSet.has(n.id)),
    ];

    const bottomY = height - PAD_BOTTOM;

    for (const note of orderedNotes) {
      const nx = beatToX(note.start);
      if (nx < -12 || nx > width + 12) continue;

      const mid = note.start + note.duration / 2;
      const ownerSec = composition.sections.find((s) => mid >= s.start && mid < s.end);
      const chord = ownerSec
        ? resolveSectionChord(ownerSec, analysis.sections[ownerSec.id])
        : undefined;
      const inChord = chord ? chord.pitchClasses.includes(toPitchClass(note.pitch)) : true;
      const baseColor = note.muted
        ? '#475569'
        : ownerSec
          ? inChord
            ? FN_FILL[chord?.harmonicFunction ?? 'tonic']
            : '#64748b'
          : '#94a3b8';

      const isSel = selectedSet.has(note.id);
      const topY = velToY(note.velocity, height);
      const stemX = Math.floor(nx) + 2.5;

      // Stem line
      ctx.save();
      ctx.strokeStyle = isSel ? '#ffffff' : baseColor;
      ctx.globalAlpha = note.muted ? 0.45 : isSel ? 0.95 : 0.72;
      ctx.lineWidth = isSel ? 2.2 : 1.8;
      if (note.muted) ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(stemX, bottomY);
      ctx.lineTo(stemX, topY);
      ctx.stroke();
      ctx.restore();

      // Circle handle
      ctx.save();
      ctx.beginPath();
      ctx.arc(stemX, topY, isSel ? 4.2 : 3.4, 0, Math.PI * 2);
      if (note.muted) {
        ctx.fillStyle = '#0d0f15';
        ctx.fill();
        ctx.strokeStyle = isSel ? '#cbd5e1' : '#64748b';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        ctx.fillStyle = baseColor;
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Playhead
    const phX = Math.floor(beatToX(playheadBeat)) + 0.5;
    if (phX >= 0 && phX <= width) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(phX, 0);
      ctx.lineTo(phX, height);
      ctx.stroke();
    }
  });

  return (
    <div className={`velocity-lane ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <div className="velocity-lane-gutter">
        <button
          type="button"
          className="velocity-toggle-btn"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? 'Collapse velocity lane' : 'Expand velocity lane'}
        >
          {isOpen ? '▾' : '▸'} VEL
        </button>
        {isOpen && (
          dragVelPct !== null ? (
            <span className="velocity-readout">{dragVelPct}%</span>
          ) : (
            <button
              type="button"
              className={`section-clear-btn ${allSelectedMuted ? 'is-muted-active' : ''}`}
              disabled={selectedNotes.length === 0}
              onClick={handleToggleMuteSelected}
              title={
                selectedNotes.length > 0
                  ? `${allSelectedMuted ? 'Unmute' : 'Mute'} ${selectedNotes.length} selected note(s) (M)`
                  : 'Select notes to mute/unmute (M)'
              }
            >
              {allSelectedMuted ? 'Unmute' : 'Mute'}
            </button>
          )
        )}
      </div>

      {isOpen ? (
        <div ref={containerRef} className="velocity-lane-track">
          <canvas
            ref={canvasRef}
            className="velocity-lane-canvas"
            onMouseDown={handleMouseDown}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      ) : (
        <div className="velocity-lane-collapsed-hint">
          Velocity &amp; Mute lane collapsed — click VEL to expand · Press M or Alt+Click notes to mute
        </div>
      )}
    </div>
  );
};
