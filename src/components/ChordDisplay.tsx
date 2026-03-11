/**
 * ChordDisplay.tsx — Chord name, confidence badge, and function label.
 *
 * Reads currentChord, chordConfidence, chordFunction, and currentTension
 * from the Zustand store and renders them in a dark card consistent with
 * the rest of the app (dark #13131f background, indigo border, violet accents).
 *
 * Confidence levels:
 *   low    → gray badge, shows chord family name (e.g. 'dominant chord')
 *   medium → amber badge, shows full chord name (e.g. 'G7')
 *   high   → green badge, shows full chord name (e.g. 'Cmaj7')
 *
 * When no chord is detected (currentChord === '--') the badge is hidden.
 */

import { useAppStore } from '../store/useAppStore';
import { CHORD_TEMPLATES } from '../audio/ChordDetector';
import { chordFunctionInKey } from '../audio/KeyDetector';

type ConfidenceLevel = 'low' | 'medium' | 'high';

interface ConfidenceStyle {
  bg: string;
  color: string;
  label: string;
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, ConfidenceStyle> = {
  low: {
    bg: '#4b5563',       // gray-600
    color: '#d1d5db',    // gray-300
    label: 'low',
  },
  medium: {
    bg: '#d97706',       // amber-600
    color: '#fef3c7',    // amber-100
    label: 'medium',
  },
  high: {
    bg: '#16a34a',       // green-700
    color: '#dcfce7',    // green-100
    label: 'high',
  },
};

/**
 * Returns a color for the tension readout number.
 *   0.0–0.3  → green (tonic, relaxed)
 *   0.3–0.6  → amber (subdominant, moderate)
 *   0.6–0.85 → orange (dominant, expectant)
 *   0.85–1.0 → red (altered, high tension)
 */
function tensionColor(tension: number): string {
  if (tension < 0.3) return '#4ade80';    // green-400
  if (tension < 0.6) return '#fbbf24';   // amber-400
  if (tension < 0.85) return '#fb923c';  // orange-400
  return '#f87171';                       // red-400
}

export function ChordDisplay() {
  const currentChord     = useAppStore((s) => s.currentChord);
  const chordConfidence  = useAppStore((s) => s.chordConfidence);
  const chordFunction    = useAppStore((s) => s.chordFunction);
  const currentChordIdx  = useAppStore((s) => s.currentChordIdx);
  const currentTension   = useAppStore((s) => s.currentTension);
  const currentBpm       = useAppStore((s) => s.currentBpm);
  const pocketScore      = useAppStore((s) => s.pocketScore);
  const detectedKey      = useAppStore((s) => s.detectedKey);
  const detectedKeyMode  = useAppStore((s) => s.detectedKeyMode);

  const noChord = currentChord === '--';
  const style   = CONFIDENCE_STYLES[chordConfidence];

  // Build key context label (KEY-02 display)
  let keyContextLabel: string | null = null;
  if (!noChord && currentChordIdx >= 0 && detectedKey && detectedKeyMode) {
    const tmpl = CHORD_TEMPLATES[currentChordIdx];
    if (tmpl) {
      keyContextLabel = chordFunctionInKey(tmpl.root, tmpl.type, detectedKey, detectedKeyMode);
    }
  }

  return (
    <div
      className="w-full rounded-xl flex flex-col items-center gap-2 py-5 px-6"
      style={{
        backgroundColor: '#13131f',
        border: '1px solid rgba(99,102,241,0.4)',
      }}
    >
      {/* Chord name row */}
      <div className="flex items-center gap-3">
        {/* Chord name — large, white */}
        <span
          className="font-bold tracking-wide"
          style={{ fontSize: '2.25rem', lineHeight: 1.1, color: '#f3f4f6' }}
        >
          {currentChord}
        </span>

        {/* Confidence badge — hidden when no chord detected */}
        {!noChord && (
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: style.bg,
              color: style.color,
              letterSpacing: '0.04em',
            }}
          >
            {style.label}
          </span>
        )}
      </div>

      {/* Plain English function label */}
      {!noChord && chordFunction && (
        <p
          className="text-sm text-center font-medium"
          style={{ color: '#a78bfa' }}   // violet-400
        >
          {chordFunction}
        </p>
      )}

      {/* Key context label — chord function relative to detected key (KEY-02) */}
      {!noChord && keyContextLabel && (
        <p
          className="text-xs text-center italic"
          style={{ color: 'rgba(167,139,250,0.6)' }}   // violet-400 at 60% opacity
        >
          {keyContextLabel}
        </p>
      )}

      {/* Tension readout */}
      {!noChord && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs" style={{ color: '#6b7280' }}>tension</span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: tensionColor(currentTension) }}
          >
            {currentTension.toFixed(2)}
          </span>
        </div>
      )}

      {/* BPM readout (BEAT-05: shows "♩ = —" when null/rubato) */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs" style={{ color: '#6b7280' }}>♩ =</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: currentBpm !== null ? '#f3f4f6' : '#6b7280' }}
        >
          {currentBpm !== null ? currentBpm : '—'}
        </span>
      </div>

      {/* Pocket score readout */}
      {currentBpm !== null && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs" style={{ color: '#6b7280' }}>pocket</span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: pocketScore >= 0.7 ? '#4ade80' : pocketScore >= 0.4 ? '#fbbf24' : '#f87171' }}
          >
            {pocketScore.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
