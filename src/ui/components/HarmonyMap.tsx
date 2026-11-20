import React, { useState } from 'react';
import { audioEngine } from '../../audio';
import type { Composition } from '../../domain/music';
import type {
  ChordCandidate,
  CompositionAnalysis,
  HarmonicFunction,
  PitchClass,
} from '../../domain/theory';
import {
  analyzeVoiceLeading,
  buildChordVoicing,
  resolveSectionChord,
} from '../../theory';

interface HarmonyMapProps {
  composition: Composition;
  analysis: CompositionAnalysis;
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  onInspectChord: (chord: ChordCandidate) => void;
  onPinChordInActiveSection: (chordId: string) => void;
  onHoverChord: (chord?: ChordCandidate) => void;
}

const CIRCLE_MAJOR: Array<{ pc: PitchClass; label: string }> = [
  { pc: 0, label: 'C' },
  { pc: 7, label: 'G' },
  { pc: 2, label: 'D' },
  { pc: 9, label: 'A' },
  { pc: 4, label: 'E' },
  { pc: 11, label: 'B' },
  { pc: 6, label: 'F#' },
  { pc: 1, label: 'Db' },
  { pc: 8, label: 'Ab' },
  { pc: 3, label: 'Eb' },
  { pc: 10, label: 'Bb' },
  { pc: 5, label: 'F' },
];

const CIRCLE_MINOR: Array<{ pc: PitchClass; label: string }> = [
  { pc: 9, label: 'Am' },
  { pc: 4, label: 'Em' },
  { pc: 11, label: 'Bm' },
  { pc: 6, label: 'F#m' },
  { pc: 1, label: 'C#m' },
  { pc: 8, label: 'G#m' },
  { pc: 3, label: 'Ebm' },
  { pc: 10, label: 'Bbm' },
  { pc: 5, label: 'Fm' },
  { pc: 0, label: 'Cm' },
  { pc: 7, label: 'Gm' },
  { pc: 2, label: 'Dm' },
];

const FN_FILL: Record<HarmonicFunction, string> = {
  tonic: 'rgba(52, 211, 153, 0.28)',
  predominant: 'rgba(245, 158, 11, 0.28)',
  dominant: 'rgba(251, 113, 133, 0.28)',
  chromatic: 'rgba(56, 189, 248, 0.22)',
};

const FN_STROKE: Record<HarmonicFunction, string> = {
  tonic: '#34d399',
  predominant: '#f59e0b',
  dominant: '#fb7185',
  chromatic: '#38bdf8',
};

const FN_LABEL: Record<HarmonicFunction, string> = {
  tonic: 'Tonic (home / stable)',
  predominant: 'Predominant (movement / color)',
  dominant: 'Dominant (tension / pull home)',
  chromatic: 'Borrowed / out-of-key color',
};

function wedgePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(rad(startDeg));
  const y1 = cy + rOuter * Math.sin(rad(startDeg));
  const x2 = cx + rOuter * Math.cos(rad(endDeg));
  const y2 = cy + rOuter * Math.sin(rad(endDeg));
  const x3 = cx + rInner * Math.cos(rad(endDeg));
  const y3 = cy + rInner * Math.sin(rad(endDeg));
  const x4 = cx + rInner * Math.cos(rad(startDeg));
  const y4 = cy + rInner * Math.sin(rad(startDeg));
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function polarPos(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Signed distance in fifths from `fromIdx` to `toIdx` on the 12-position circle (-6..+6).
 * Positive = clockwise (dominant / brighter direction), negative = counter-clockwise (subdominant / warmer).
 */
function circleStepDistance(fromIdx: number, toIdx: number): number {
  let diff = (toIdx - fromIdx + 12) % 12;
  if (diff > 6) diff -= 12;
  return diff;
}

function describeCircleRelation(
  keyIdx: number,
  wedgeIdx: number,
  isMinorRing: boolean,
  isDiatonic: boolean,
): string {
  const steps = circleStepDistance(keyIdx, wedgeIdx);
  if (steps === 0) {
    return isMinorRing
      ? 'Relative minor of the home key — shares the exact same notes.'
      : 'Home key center — strongest sense of rest and resolution.';
  }
  const absSteps = Math.abs(steps);
  const dir =
    steps > 0
      ? 'clockwise (brighter / dominant side)'
      : 'counter-clockwise (warmer / subdominant side)';
  if (absSteps === 1) {
    return isDiatonic
      ? `1 step ${dir} — immediate neighbor that shares 6 of 7 scale notes.`
      : `1 step ${dir} — closely related borrowed color.`;
  }
  if (absSteps <= 2) {
    return `${absSteps} steps ${dir} — smooth secondary or modal-mixture color.`;
  }
  return `${absSteps} steps ${dir} — distant key for dramatic contrast or modulation.`;
}

export const HarmonyMap: React.FC<HarmonyMapProps> = ({
  composition,
  analysis,
  activeSectionId,
  onSelectSection,
  onInspectChord,
  onPinChordInActiveSection,
  onHoverChord,
}) => {
  const [previewedWedge, setPreviewedWedge] = useState<{
    pc: PitchClass;
    quality: 'maj' | 'min';
    label: string;
    idx: number;
  } | null>(null);

  const activeScale = analysis.activeScale;
  const activeSection =
    composition.sections.find((s) => s.id === activeSectionId) ??
    composition.sections[0];
  const activeSecAnalysis = activeSection
    ? analysis.sections[activeSection.id]
    : undefined;
  const activeChord = resolveSectionChord(activeSection, activeSecAnalysis);

  // Locate the active scale's home position on the Circle of Fifths
  const keyCircleIdx = (() => {
    if (!activeScale) return 0;
    const isMinorScale = activeScale.definition.intervals.includes(3);
    const ring = isMinorScale ? CIRCLE_MINOR : CIRCLE_MAJOR;
    const found = ring.findIndex((item) => item.pc === activeScale.rootPc);
    return found >= 0 ? found : 0;
  })();

  const findCandidate = (pc: PitchClass, quality: 'maj' | 'min') =>
    activeSecAnalysis?.candidates.find((c) => c.id === `${pc}:${quality}`);

  const handleWedgePreview = (
    pc: PitchClass,
    quality: 'maj' | 'min',
    label: string,
    idx: number,
  ) => {
    const intervals = quality === 'maj' ? [0, 4, 7] : [0, 3, 7];
    audioEngine.playChord(buildChordVoicing(pc, intervals, 0, 3), 0.85, 0.74);
    setPreviewedWedge({ pc, quality, label, idx });
    const cand = findCandidate(pc, quality);
    if (cand) {
      onInspectChord(cand);
    }
  };

  const handleWedgeAssign = (pc: PitchClass, quality: 'maj' | 'min') => {
    const intervals = quality === 'maj' ? [0, 4, 7] : [0, 3, 7];
    audioEngine.playChord(buildChordVoicing(pc, intervals, 0, 3), 0.9, 0.78);
    onPinChordInActiveSection(`${pc}:${quality}`);
    setPreviewedWedge(null);
  };

  // Build progression + voice-leading chain across all sections
  const sortedSections = [...composition.sections].sort((a, b) => a.start - b.start);
  const progressionItems = sortedSections.map((sec, idx) => {
    const chord = resolveSectionChord(sec, analysis.sections[sec.id]);
    const prevChord =
      idx > 0
        ? resolveSectionChord(
            sortedSections[idx - 1],
            analysis.sections[sortedSections[idx - 1].id],
          )
        : undefined;
    const vl =
      prevChord && chord ? analyzeVoiceLeading(prevChord, chord) : undefined;
    return { section: sec, chord, vl };
  });

  const cx = 135;
  const cy = 135;

  const previewCand = previewedWedge
    ? findCandidate(previewedWedge.pc, previewedWedge.quality)
    : undefined;

  return (
    <div className="explorer-list" onMouseLeave={() => onHoverChord(undefined)}>
      {/* Contextual Guide */}
      <div className="cof-guide-card">
        <div className="cof-guide-title">Circle of Fifths</div>
        <p className="cof-guide-copy">
          Adjacent chords share the most notes and flow smoothly together.
          <strong> Outer ring</strong> = Major, <strong>inner ring</strong> = relative Minor.
          Highlighted wedges belong to your current key.
        </p>
        <div className="cof-guide-hint">
          <span>
            <span className="kbd">Click</span> Preview &amp; inspect
          </span>
          <span>
            <span className="kbd">Double-click</span> Assign to section
          </span>
        </div>
      </div>

      {/* Interactive SVG Circle of Fifths */}
      <div className="cof-container">
        <svg viewBox="0 0 270 270" className="cof-svg" role="img" aria-label="Interactive Circle of Fifths">
          {CIRCLE_MAJOR.map((item, idx) => {
            const startDeg = idx * 30 - 15;
            const endDeg = idx * 30 + 15;
            const cand = findCandidate(item.pc, 'maj');
            const isActiveChord =
              activeChord?.rootPc === item.pc &&
              activeChord.quality !== 'min' &&
              activeChord.quality !== 'min7';
            const isPreviewed =
              previewedWedge?.pc === item.pc && previewedWedge.quality === 'maj';
            const isDiatonic = cand?.isDiatonic ?? false;
            const fn = cand?.harmonicFunction ?? 'chromatic';

            const fill = isActiveChord
              ? FN_STROKE[fn]
              : isDiatonic
                ? FN_FILL[fn]
                : '#1c202b';
            const stroke = isActiveChord
              ? '#ffffff'
              : isPreviewed
                ? '#e2e8f0'
                : isDiatonic
                  ? FN_STROKE[fn]
                  : 'rgba(255,255,255,0.08)';
            const labelPos = polarPos(cx, cy, 108, idx * 30);

            return (
              <g
                key={item.label}
                style={{ cursor: 'pointer' }}
                onClick={() => handleWedgePreview(item.pc, 'maj', item.label, idx)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleWedgeAssign(item.pc, 'maj');
                }}
                onMouseEnter={() => cand && onHoverChord(cand)}
              >
                <path
                  d={wedgePath(cx, cy, 86, 128, startDeg, endDeg)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActiveChord ? 2 : isPreviewed ? 1.8 : 1}
                  strokeDasharray={isPreviewed && !isActiveChord ? '4 2.5' : undefined}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isActiveChord ? '#091114' : isDiatonic ? '#eef1f6' : '#8b93a5'}
                  fontSize="11.5"
                  fontWeight={isActiveChord || isDiatonic ? '700' : '500'}
                  fontFamily="var(--font-mono)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {item.label}
                </text>
              </g>
            );
          })}

          {CIRCLE_MINOR.map((item, idx) => {
            const startDeg = idx * 30 - 15;
            const endDeg = idx * 30 + 15;
            const cand = findCandidate(item.pc, 'min');
            const isActiveChord =
              activeChord?.rootPc === item.pc &&
              (activeChord.quality === 'min' || activeChord.quality === 'min7');
            const isPreviewed =
              previewedWedge?.pc === item.pc && previewedWedge.quality === 'min';
            const isDiatonic = cand?.isDiatonic ?? false;
            const fn = cand?.harmonicFunction ?? 'chromatic';

            const fill = isActiveChord
              ? FN_STROKE[fn]
              : isDiatonic
                ? FN_FILL[fn]
                : '#161923';
            const stroke = isActiveChord
              ? '#ffffff'
              : isPreviewed
                ? '#e2e8f0'
                : isDiatonic
                  ? FN_STROKE[fn]
                  : 'rgba(255,255,255,0.07)';
            const labelPos = polarPos(cx, cy, 67, idx * 30);

            return (
              <g
                key={item.label}
                style={{ cursor: 'pointer' }}
                onClick={() => handleWedgePreview(item.pc, 'min', item.label, idx)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleWedgeAssign(item.pc, 'min');
                }}
                onMouseEnter={() => cand && onHoverChord(cand)}
              >
                <path
                  d={wedgePath(cx, cy, 48, 84, startDeg, endDeg)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isActiveChord ? 2 : isPreviewed ? 1.8 : 1}
                  strokeDasharray={isPreviewed && !isActiveChord ? '4 2.5' : undefined}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isActiveChord ? '#091114' : isDiatonic ? '#eef1f6' : '#6c7486'}
                  fontSize="9.5"
                  fontWeight={isActiveChord || isDiatonic ? '700' : '500'}
                  fontFamily="var(--font-mono)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {item.label}
                </text>
              </g>
            );
          })}

          {/* Center active key badge */}
          <circle cx={cx} cy={cy} r={44} fill="#12151d" stroke="rgba(255,255,255,0.1)" />
          <text
            x={cx}
            y={cy - 7}
            textAnchor="middle"
            fill="#8b93a5"
            fontSize="8.5"
            fontWeight="600"
            letterSpacing="0.06em"
          >
            ACTIVE KEY
          </text>
          <text
            x={cx}
            y={cy + 9}
            textAnchor="middle"
            fill="#eef1f6"
            fontSize="12"
            fontWeight="700"
          >
            {activeScale?.displayName ?? '—'}
          </text>
        </svg>

        {/* Color Legend */}
        <div className="cof-legend" aria-label="Harmonic function color legend">
          <span className="cof-legend-item">
            <span className="cof-swatch" style={{ background: FN_STROKE.tonic }} />
            Tonic
          </span>
          <span className="cof-legend-item">
            <span className="cof-swatch" style={{ background: FN_STROKE.predominant }} />
            Predom
          </span>
          <span className="cof-legend-item">
            <span className="cof-swatch" style={{ background: FN_STROKE.dominant }} />
            Dominant
          </span>
          <span className="cof-legend-item">
            <span className="cof-swatch" style={{ background: '#475569' }} />
            Out of key
          </span>
        </div>

        {/* Live Preview Context Banner */}
        {previewedWedge && (
          <div className="cof-preview-callout">
            <div className="cof-preview-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  className={`candidate-roman soft-fn-${previewCand?.harmonicFunction ?? 'chromatic'}`}
                >
                  {previewCand?.romanNumeral ?? '—'}
                </span>
                <strong>{previewedWedge.label}</strong>
                <span className="cof-preview-role">
                  {FN_LABEL[previewCand?.harmonicFunction ?? 'chromatic']}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                title="Assign this chord to the active section"
                onClick={() =>
                  handleWedgeAssign(previewedWedge.pc, previewedWedge.quality)
                }
              >
                Assign
              </button>
            </div>
            <div className="cof-preview-desc">
              {describeCircleRelation(
                keyCircleIdx,
                previewedWedge.idx,
                previewedWedge.quality === 'min',
                previewCand?.isDiatonic ?? false,
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progression & Voice-Leading Flow */}
      <div className="cof-section-header">
        <div className="cof-section-title">Progression &amp; Voice Leading</div>
        <div className="cof-section-subtitle">
          How smoothly each section flows into the next — higher % means more shared tones and smaller note steps.
        </div>
      </div>

      <div className="progression-chain">
        {progressionItems.map(({ section, chord, vl }) => {
          const isAct = section.id === activeSection?.id;
          const fn = chord?.harmonicFunction ?? 'tonic';
          return (
            <div
              key={section.id}
              className={`progression-step ${isAct ? 'is-active' : ''}`}
              onClick={() => {
                onSelectSection(section.id);
                if (chord) {
                  audioEngine.playChord(
                    buildChordVoicing(chord.rootPc, chord.definition.intervals, 0, 3),
                    0.8,
                    0.72,
                  );
                }
              }}
              onMouseEnter={() => chord && onHoverChord(chord)}
            >
              <div className="progression-step-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`candidate-roman soft-fn-${fn}`}>
                    {chord?.romanNumeral ?? '—'}
                  </span>
                  <strong style={{ fontSize: '13px' }}>{chord?.symbol ?? '—'}</strong>
                </div>
                {vl && (
                  <span className="pill pill-muted" title={vl.summary}>
                    {vl.smoothness}% smooth · {vl.commonTones} shared
                  </span>
                )}
              </div>
              {vl && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  {vl.summary}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
