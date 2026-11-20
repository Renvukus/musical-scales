import React from 'react';
import { audioEngine } from '../../audio';
import type { ChordCandidate, ScaleCandidate } from '../../domain/theory';
import { FLAT_NAMES, SHARP_NAMES, intervalName } from '../../theory';

interface TheoryInspectorProps {
  chord?: ChordCandidate;
  scale?: ScaleCandidate;
  mode: 'chord' | 'scale';
}

function symbolToPreviewPitches(symbol: string): number[] {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol);
  if (!match) return [60, 64, 67];
  const [, rootStr, suffix] = match;
  let pc = SHARP_NAMES.indexOf(rootStr as (typeof SHARP_NAMES)[number]);
  if (pc === -1) pc = FLAT_NAMES.indexOf(rootStr as (typeof FLAT_NAMES)[number]);
  if (pc === -1) pc = 0;

  const isMin = suffix.startsWith('m') && !suffix.startsWith('maj');
  const intervals = isMin ? [0, 3, 7] : [0, 4, 7];
  return intervals.map((i) => 48 + pc + i);
}

const FUNCTION_LABELS = {
  tonic: 'Tonic (Home / Stability)',
  predominant: 'Predominant (Journey / Color)',
  dominant: 'Dominant (Tension / Pull)',
  chromatic: 'Chromatic / Borrowed Color',
} as const;

export const TheoryInspector: React.FC<TheoryInspectorProps> = ({
  chord,
  scale,
  mode,
}) => {
  if (mode === 'scale' && scale) {
    return (
      <section className="theory-inspector" aria-label="Scale Theory Inspector">
        <div className="inspector-header">
          <h2 className="inspector-title">{scale.displayName}</h2>
          <span className="pill pill-muted">{scale.definition.name}</span>
        </div>

        <p className="inspector-summary">{scale.summary}</p>

        <div className="inspector-grid">
          <span className="inspector-label">Notes</span>
          <span className="inspector-val" style={{ fontFamily: 'var(--font-mono)' }}>
            {scale.noteNames.join(' – ')}
          </span>

          <span className="inspector-label">Mood</span>
          <span className="inspector-val">{scale.definition.mood}</span>

          <span className="inspector-label">Genres</span>
          <span className="inspector-val">{scale.definition.genres.join(', ')}</span>

          {scale.relativeScaleName && (
            <>
              <span className="inspector-label">Relative</span>
              <span className="inspector-val">
                Shares exact notes with <strong>{scale.relativeScaleName}</strong>
              </span>
            </>
          )}

          {scale.outsidePitchNames.length > 0 && (
            <>
              <span className="inspector-label">Outside</span>
              <span className="inspector-val" style={{ color: 'var(--outside-tone)' }}>
                {scale.outsidePitchNames.join(', ')}
              </span>
            </>
          )}
        </div>

        <div className="inspector-tip">
          <strong>Tip:</strong> {scale.definition.tip}
        </div>
      </section>
    );
  }

  if (!chord) {
    return (
      <section className="theory-inspector" aria-label="Theory Inspector">
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Click any chord or scale above to see how it works in your composition.
        </p>
      </section>
    );
  }

  const fn = chord.harmonicFunction;

  return (
    <section className="theory-inspector" aria-label="Chord Theory Inspector">
      <div className="inspector-header">
        <h2 className="inspector-title">
          {chord.symbol}{' '}
          <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: '12px' }}>
            {chord.definition.name}
          </span>
        </h2>
        <span className={`candidate-roman soft-fn-${fn}`}>
          {chord.romanNumeral}
        </span>
      </div>

      <p className="inspector-summary">{chord.summary}</p>

      <div className="inspector-grid">
        <span className="inspector-label">Function</span>
        <span className={`inspector-val fn-${fn}`}>{FUNCTION_LABELS[fn]}</span>

        <span className="inspector-label">Notes</span>
        <span className="inspector-val" style={{ fontFamily: 'var(--font-mono)' }}>
          {chord.noteNames.join(' – ')}
        </span>

        <span className="inspector-label">Intervals</span>
        <span className="inspector-val">
          {chord.definition.intervals.map(intervalName).join(' · ')}
        </span>

        {chord.inversionLabel && (
          <>
            <span className="inspector-label">Bass</span>
            <span className="inspector-val">
              {chord.bassNoteName} ({chord.inversionLabel})
            </span>
          </>
        )}

        <span className="inspector-label">Mood</span>
        <span className="inspector-val">{chord.definition.mood}</span>

        <span className="inspector-label">Used in</span>
        <span className="inspector-val">{chord.definition.genres.join(', ')}</span>
      </div>

      <div className="inspector-tip">
        <strong>Tip:</strong> {chord.definition.tip}
      </div>

      {chord.nextChordSuggestions.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              marginBottom: '5px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Where to go next (click to hear)
          </div>
          <div className="next-chords-row">
            {chord.nextChordSuggestions.map((next) => (
              <button
                key={`${next.symbol}-${next.romanNumeral}`}
                className="next-chord-chip"
                onClick={() => audioEngine.playChord(symbolToPreviewPitches(next.symbol), 0.9, 0.72)}
                title={next.reason}
              >
                <strong className={`fn-${next.harmonicFunction}`}>{next.symbol}</strong>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {next.romanNumeral}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
