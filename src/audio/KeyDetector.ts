/**
 * KeyDetector.ts — Key detection and chord-function-in-key labeling.
 *
 * This module implements two core musicological features:
 *
 *   KEY-01: detectKey — Infers the musical key from a rolling 30-second window of
 *     the chord log. Each chord entry is weighted by its confidenceGap (how much
 *     more likely it was than the second-best match), so high-confidence chords
 *     contribute more to key detection than ambiguous ones.
 *
 *   KEY-02: chordFunctionInKey — Given a chord root, type, key root, and mode,
 *     returns a human-readable string like "G7 is the V chord in C major". This
 *     transforms a raw chord label into musical context that jazz students can
 *     immediately relate to (ii-V-I, etc.).
 *
 * Design constraints:
 *   - detectKey is a pure function (no side effects, no mutation of inputs).
 *   - Uses Float32Array for rootWeight accumulation (zero allocations after first call
 *     if callers pre-allocate; Float32Array(12) is tiny and acceptable per-call here
 *     since detectKey runs at UI rate, not 60fps rAF rate).
 */

import { NOTE_NAMES, CHORD_TEMPLATES } from './ChordDetector';

// -------------------------------------------------------------------
// KeyDetectionResult: returned by detectKey
// -------------------------------------------------------------------

export interface KeyDetectionResult {
  key: string | null;
  mode: 'major' | 'minor' | null;
  confidence: number;
}

// -------------------------------------------------------------------
// INTERVAL_TO_DEGREE: maps semitone interval above key root to
// scale degree label (Roman numeral). Used by chordFunctionInKey.
// -------------------------------------------------------------------

const INTERVAL_TO_DEGREE: Record<number, string> = {
  0:  'I',
  1:  'bII',
  2:  'II',
  3:  'bIII',
  4:  'III',
  5:  'IV',
  6:  '#IV/bV',
  7:  'V',
  8:  'bVI',
  9:  'VI',
  10: 'bVII',
  11: 'VII',
};

// -------------------------------------------------------------------
// TYPE_SUFFIX: maps chord type name to display suffix for the label.
// -------------------------------------------------------------------

const TYPE_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  maj7:  'maj7',
  m7:    'm7',
  dom7:  '7',
  dim7:  'dim7',
  m7b5:  'm7b5',
  alt:   'alt',
};

// -------------------------------------------------------------------
// detectKey (KEY-01)
//
// Infers the current key from a rolling window of the chord log.
//
// Parameters:
//   chordLog       — the chord log array from ChordState (readonly)
//   currentTimeSec — current playback position in seconds
//   windowSec      — how far back to look (default 30 seconds)
//
// Returns KeyDetectionResult with:
//   key        — detected root note name (e.g. "C", "F#"), or null if no data
//   mode       — 'major' or 'minor', or null if no data
//   confidence — fraction of total weight held by the winning root (0–1)
// -------------------------------------------------------------------

export function detectKey(
  chordLog: ReadonlyArray<{ audioTimeSec: number; chordIdx: number; confidenceGap: number }>,
  currentTimeSec: number,
  windowSec: number = 30,
): KeyDetectionResult {
  // Pre-allocate weight accumulators (12 pitch classes)
  const rootWeight = new Float32Array(12);

  // Also track major vs. minor weight split for mode detection
  let majorW = 0;
  let minorW = 0;

  // Rolling window cutoff
  const windowStart = currentTimeSec - windowSec;

  // Accumulate weighted votes for each pitch class
  for (const entry of chordLog) {
    // Filter to window
    if (entry.audioTimeSec < windowStart) continue;

    // Guard against out-of-range chordIdx
    const template = CHORD_TEMPLATES[entry.chordIdx];
    if (!template) continue;

    // Map root name to pitch class index
    const rootIdx = NOTE_NAMES.indexOf(template.root);
    if (rootIdx === -1) continue;

    const weight = entry.confidenceGap;
    rootWeight[rootIdx] += weight;

    // Classify as major-leaning or minor-leaning
    const t = template.type;
    if (t === 'major' || t === 'maj7' || t === 'dom7') {
      majorW += weight;
    } else {
      minorW += weight;
    }
  }

  // Find pitch class with highest accumulated weight
  let bestRootIdx = 0;
  let bestWeight = 0;
  let totalWeight = 0;

  for (let i = 0; i < 12; i++) {
    totalWeight += rootWeight[i];
    if (rootWeight[i] > bestWeight) {
      bestWeight = rootWeight[i];
      bestRootIdx = i;
    }
  }

  // No data in window
  if (totalWeight === 0) {
    return { key: null, mode: null, confidence: 0 };
  }

  const key = NOTE_NAMES[bestRootIdx];
  const mode: 'major' | 'minor' = majorW >= minorW ? 'major' : 'minor';
  const confidence = bestWeight / totalWeight;

  return { key, mode, confidence };
}

// -------------------------------------------------------------------
// chordFunctionInKey (KEY-02)
//
// Returns a human-readable string describing what function a chord plays
// in a given key. For example: "G7 is the V chord in C major".
//
// Parameters:
//   chordRoot — root note of the chord (e.g. "G")
//   chordType — type string (e.g. "dom7")
//   keyRoot   — root note of the key (e.g. "C")
//   keyMode   — 'major' or 'minor'
//
// Returns a string like "G7 is the V chord in C major".
// Falls back gracefully for unknown roots or types.
// -------------------------------------------------------------------

export function chordFunctionInKey(
  chordRoot: string,
  chordType: string,
  keyRoot: string,
  keyMode: 'major' | 'minor',
): string {
  const chordRootIdx = NOTE_NAMES.indexOf(chordRoot);
  const keyRootIdx   = NOTE_NAMES.indexOf(keyRoot);

  // Fallback for unknown roots
  if (chordRootIdx === -1 || keyRootIdx === -1) {
    const suffix = TYPE_SUFFIX[chordType] ?? chordType;
    return `${chordRoot}${suffix} (key unknown)`;
  }

  // Semitone interval from key root up to chord root (always 0–11)
  const interval = ((chordRootIdx - keyRootIdx) % 12 + 12) % 12;

  const degree = INTERVAL_TO_DEGREE[interval] ?? `?${interval}`;
  const suffix = TYPE_SUFFIX[chordType] ?? chordType;

  const chordLabel = `${chordRoot}${suffix}`;
  const keyLabel   = `${keyRoot} ${keyMode}`;

  return `${chordLabel} is the ${degree} chord in ${keyLabel}`;
}
