/**
 * ChordLogPanel.tsx — Expandable chord log drawer with key detection.
 *
 * Renders below the timeline as an expandable drawer. Each entry shows:
 *   - timestamp (MM:SS.s)
 *   - chord name (bold)
 *   - function label in key context (e.g. "G7 is the V chord in C major")
 *   - confidence badge
 *
 * Color-coded by harmonic tension:
 *   tonic (0.1)       → green
 *   subdominant (0.35) → amber
 *   dominant (0.65)    → orange
 *   altered (0.85)     → red
 *
 * Key detection runs at 2fps (500ms interval) by calling detectKey on a
 * snapshot of the chord log. The detected key is pushed to Zustand and
 * also displayed in the collapsed header.
 *
 * Clicking an entry seeks playback to that timestamp.
 */

import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { CHORD_TEMPLATES } from '../audio/ChordDetector';
import { detectKey, chordFunctionInKey } from '../audio/KeyDetector';
import { useSeek } from '../hooks/useSeek';
import { useAppStore } from '../store/useAppStore';
import { getCurrentPosition } from '../audio/AudioEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

const TYPE_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  maj7: 'maj7',
  m7: 'm7',
  dom7: '7',
  dim7: 'dim7',
  m7b5: 'm7b5',
  alt: 'alt',
};

function chordDisplayName(root: string, type: string): string {
  return root + (TYPE_SUFFIX[type] ?? type);
}

// ---------------------------------------------------------------------------
// Tension level thresholds (midpoints matching TENSION_TARGETS from TensionScorer)
// ---------------------------------------------------------------------------

const TENSION_LEVELS = {
  tonic: 0.1,
  subdominant: 0.35,
  dominant: 0.65,
  altered: 0.85,
};

function tensionLevelForFunction(fn: string): number {
  if (fn === 'tonic') return TENSION_LEVELS.tonic;
  if (fn === 'subdominant') return TENSION_LEVELS.subdominant;
  if (fn === 'dominant') return TENSION_LEVELS.dominant;
  return TENSION_LEVELS.altered;
}

function tensionBgColor(tension: number): string {
  if (tension < 0.3) return 'rgba(74,222,128,0.15)';   // green
  if (tension < 0.6) return 'rgba(251,191,36,0.15)';   // amber
  if (tension < 0.85) return 'rgba(251,146,60,0.15)';  // orange
  return 'rgba(248,113,113,0.15)';                      // red
}

function tensionTextColor(tension: number): string {
  if (tension < 0.3) return '#4ade80';   // green-400
  if (tension < 0.6) return '#fbbf24';   // amber-400
  if (tension < 0.85) return '#fb923c';  // orange-400
  return '#f87171';                       // red-400
}

// ---------------------------------------------------------------------------
// Log entry type (processed/enriched)
// ---------------------------------------------------------------------------

interface LogEntry {
  audioTimeSec: number;
  chordName: string;
  chordRoot: string;
  chordType: string;
  chordFunction: string;
  functionLabel: string;
  confidenceGap: number;
  tensionLevel: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChordLogPanelProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

export function ChordLogPanel({ audioStateRef }: ChordLogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const { seekTo } = useSeek(audioStateRef);

  // Read detected key from Zustand for header display
  const detectedKey = useAppStore((s) => s.detectedKey);
  const detectedKeyMode = useAppStore((s) => s.detectedKeyMode);

  // 2fps polling interval (500ms)
  useEffect(() => {
    const intervalId = setInterval(() => {
      const state = audioStateRef.current;
      if (!state.chord) return;

      // Snapshot the chord log to avoid mutation during read
      const snapshot = [...(state.chord.chordLog ?? [])];

      // Get current playback position
      const currentTimeSec = state.audioCtx
        ? getCurrentPosition(state.audioCtx, state.transport)
        : 0;

      // Detect key from snapshot
      const keyResult = detectKey(snapshot, currentTimeSec);

      // Push detected key to Zustand
      useAppStore.getState().setDetectedKey(keyResult.key, keyResult.mode);

      // Map chord log entries to enriched display entries
      const entries: LogEntry[] = snapshot.map((raw) => {
        const tmpl = CHORD_TEMPLATES[raw.chordIdx];
        if (!tmpl) {
          return {
            audioTimeSec: raw.audioTimeSec,
            chordName: '?',
            chordRoot: '',
            chordType: '',
            chordFunction: 'tonic',
            functionLabel: '',
            confidenceGap: raw.confidenceGap,
            tensionLevel: TENSION_LEVELS.tonic,
          };
        }

        const chordName = chordDisplayName(tmpl.root, tmpl.type);
        const fn = tmpl.function as string;
        const tensionLevel = tensionLevelForFunction(fn);

        // Function label in key context if key is available
        let functionLabel = fn;
        if (keyResult.key && keyResult.mode) {
          functionLabel = chordFunctionInKey(tmpl.root, tmpl.type, keyResult.key, keyResult.mode);
        }

        return {
          audioTimeSec: raw.audioTimeSec,
          chordName,
          chordRoot: tmpl.root,
          chordType: tmpl.type,
          chordFunction: fn,
          functionLabel,
          confidenceGap: raw.confidenceGap,
          tensionLevel,
        };
      });

      // Reverse for most-recent-first display
      setLogEntries(entries.reverse());
    }, 500);

    return () => clearInterval(intervalId);
  }, [audioStateRef]);

  const entryCount = logEntries.length;
  const keyLabel = detectedKey && detectedKeyMode
    ? `Key: ${detectedKey} ${detectedKeyMode}`
    : 'Key: --';

  return (
    <div
      style={{
        backgroundColor: '#13131f',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Header row — always visible, click to toggle */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Chord Log ({entryCount} {entryCount === 1 ? 'entry' : 'entries'})
          </span>
          {/* Key detection display */}
          <span
            style={{
              fontSize: '0.75rem',
              color: detectedKey ? '#a78bfa' : '#6b7280',
              fontStyle: 'italic',
            }}
          >
            {keyLabel}
          </span>
        </div>

        {/* Chevron icon */}
        <span
          style={{
            color: '#6b7280',
            fontSize: '0.75rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          ▼
        </span>
      </button>

      {/* Expandable entries list */}
      {isExpanded && (
        <div
          style={{
            maxHeight: '300px',
            overflowY: 'auto',
            borderTop: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          {entryCount === 0 ? (
            <div
              style={{
                padding: '16px',
                color: '#6b7280',
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            >
              No chords detected yet. Play audio to populate the log.
            </div>
          ) : (
            logEntries.map((entry, idx) => (
              <button
                key={`${entry.audioTimeSec}-${idx}`}
                onClick={() => seekTo(entry.audioTimeSec)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  background: tensionBgColor(entry.tensionLevel),
                  border: 'none',
                  borderBottom: '1px solid rgba(99,102,241,0.1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'filter 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)';
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    minWidth: '48px',
                    flexShrink: 0,
                  }}
                >
                  {formatTimestamp(entry.audioTimeSec)}
                </span>

                {/* Chord name */}
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    color: tensionTextColor(entry.tensionLevel),
                    minWidth: '56px',
                    flexShrink: 0,
                  }}
                >
                  {entry.chordName}
                </span>

                {/* Function label */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#a78bfa',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.functionLabel}
                </span>

                {/* Confidence badge */}
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: '#6b7280',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                  }}
                >
                  {entry.confidenceGap.toFixed(3)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
