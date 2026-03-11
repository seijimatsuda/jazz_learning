/**
 * ChordDetector.ts — Chord template matching with Meyda chroma extraction.
 *
 * This module is the core chord detection engine for Phase 3. It:
 *
 *   1. Pre-computes 96 chord templates at module load time (12 roots x 8 types)
 *      via RIGHT rotation from root-C base templates. This is free — done once.
 *
 *   2. On every 10fps tick (100ms), extracts a 12-element chroma vector from the
 *      raw time-domain audio using Meyda.extract('chroma', ...).
 *
 *   3. CRITICAL iOS fix: Forces Meyda to rebuild its internal chromaFilterBank by
 *      setting (Meyda as any).chromaFilterBank = undefined before setting sampleRate.
 *      Without this, iOS Safari (which runs at 48kHz) will use a stale 44.1kHz
 *      filter bank, producing incorrect chroma vectors.
 *
 *   4. Applies bass band weighting — boosts the chroma bin corresponding to the
 *      loudest pitch class in the 20–250 Hz range, improving root detection accuracy
 *      for upright bass and kick (CHORD-02).
 *
 *   5. Smooths over a 3-frame (300ms) rolling window using a ring buffer ring-averaged
 *      into smoothedChroma. Reduces tick-to-tick chroma noise (CHORD-05).
 *
 *   6. Runs cosine similarity against all 96 templates. Returns best match index
 *      and confidence gap (best score minus second-best score) (CHORD-03, CHORD-04).
 *
 *   7. Applies a flicker prevention hold gate: a new chord candidate must be stable
 *      for >= 2 consecutive ticks (200ms at 10fps) before displayedChordIdx updates
 *      (CHORD-06).
 *
 *   8. Maintains a timestamped chord log, capped at 1000 entries (CHORD-11).
 *
 * CRITICAL: extractAndMatchChord must NOT allocate any new typed arrays on every call.
 * All buffers (chromaBuffer, chromaHistory, smoothedChroma) are pre-allocated in
 * initChordState() and reused on every tick.
 */

import Meyda from 'meyda';
import type { ChordFunction, ChordState, AudioStateRef } from './types';
import { hzToBin } from './FrequencyBandSplitter';

// -------------------------------------------------------------------
// Note names for building template roots
// -------------------------------------------------------------------

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// -------------------------------------------------------------------
// Base templates in root-C form (index 0 = C)
// Each entry is a 12-element binary vector marking chord tones.
// -------------------------------------------------------------------

const BASE_TEMPLATES: Record<string, number[]> = {
  major: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  minor: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  maj7:  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  m7:    [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  dom7:  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  dim7:  [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  m7b5:  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
  alt:   [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0],
};

// -------------------------------------------------------------------
// rotateRight: RIGHT rotation for root transposition.
// rotateRight([1,0,0,0,1,0,0,1,0,0,0,0], 7) => G major
// -------------------------------------------------------------------

function rotateRight(arr: number[], n: number): number[] {
  const len = arr.length;
  const k = ((n % len) + len) % len;
  return [...arr.slice(len - k), ...arr.slice(0, len - k)];
}

// -------------------------------------------------------------------
// assignChordFunction: Maps chord type name to harmonic function
// -------------------------------------------------------------------

function assignChordFunction(typeName: string): ChordFunction {
  switch (typeName) {
    case 'major':
    case 'maj7':
      return 'tonic';
    case 'minor':
    case 'm7':
      return 'subdominant';
    case 'dom7':
      return 'dominant';
    case 'dim7':
    case 'm7b5':
    case 'alt':
    default:
      return 'altered';
  }
}

// -------------------------------------------------------------------
// ChordTemplate: exported interface representing one of the 96 templates
// -------------------------------------------------------------------

export interface ChordTemplate {
  root: string;
  type: string;
  template: number[];
  function: ChordFunction;
}

// -------------------------------------------------------------------
// CHORD_TEMPLATES: all 96 templates pre-computed at module load time.
// Order: iterate 12 roots (C, C#, ..., B) then 8 types per root.
// -------------------------------------------------------------------

export const CHORD_TEMPLATES: ChordTemplate[] = [];

for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
  for (const [typeName, baseVec] of Object.entries(BASE_TEMPLATES)) {
    CHORD_TEMPLATES.push({
      root: NOTE_NAMES[rootIdx],
      type: typeName,
      template: rotateRight(baseVec, rootIdx),
      function: assignChordFunction(typeName),
    });
  }
}

// Sanity check at module load: must be exactly 96
if (CHORD_TEMPLATES.length !== 96) {
  console.error(`[ChordDetector] CHORD_TEMPLATES length is ${CHORD_TEMPLATES.length}, expected 96`);
}

// -------------------------------------------------------------------
// Hold gate constant for flicker prevention (CHORD-06)
// 2 ticks = 200ms at 10fps
// -------------------------------------------------------------------

const HOLD_TICKS = 2;

// -------------------------------------------------------------------
// initChordDetector: Forces Meyda chroma filter bank rebuild and sets
// bufferSize/sampleRate. MUST be called before extractAndMatchChord.
// -------------------------------------------------------------------

export function initChordDetector(sampleRate: number, bufferSize: number): void {
  // CRITICAL: Force Meyda to rebuild its internal chroma filter bank.
  // Without this, iOS Safari (48kHz) uses a stale 44.1kHz filter bank,
  // producing completely wrong chroma vectors.
  (Meyda as any).chromaFilterBank = undefined;

  Meyda.bufferSize = bufferSize;  // Must be 4096 to match fftSize
  Meyda.sampleRate = sampleRate;  // Actual audioCtx.sampleRate (iOS may be 48000)

  console.log(
    `[ChordDetector] Initialized: sampleRate=${sampleRate}, bufferSize=${bufferSize}`
  );
}

// -------------------------------------------------------------------
// initChordState: Pre-allocates all Float32Array buffers for chord detection.
// Call once after calibration. Zero allocations in extractAndMatchChord after this.
// -------------------------------------------------------------------

export function initChordState(): ChordState {
  return {
    chromaBuffer: new Float32Array(12),
    chromaHistory: new Float32Array(36),   // 3 frames x 12
    chromaHistoryHead: 0,
    smoothedChroma: new Float32Array(12),
    pendingChordIdx: -1,
    pendingHoldCount: 0,
    displayedChordIdx: -1,
    confidenceGap: 0,
    chordLog: [],
    chordLogMaxLen: 1000,
  };
}

// -------------------------------------------------------------------
// Private: cosineSim — cosine similarity between a Float32Array chroma
// vector and a number[] template. Returns 0 if denominator is 0.
// -------------------------------------------------------------------

function cosineSim(chroma: Float32Array, template: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < 12; i++) {
    dot   += chroma[i] * template[i];
    normA += chroma[i] * chroma[i];
    normB += template[i] * template[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// -------------------------------------------------------------------
// Private: applyBassWeighting — boosts the chroma bin corresponding to
// the loudest pitch class in the bass band (20–250 Hz).
// Uses C0 = 16.352 Hz as the reference for pitch-class semitone math.
// -------------------------------------------------------------------

function applyBassWeighting(
  chroma: Float32Array,
  rawFreqData: Uint8Array,
  sampleRate: number,
  fftSize: number
): void {
  const lowBin  = hzToBin(20,  sampleRate, fftSize);
  const highBin = hzToBin(250, sampleRate, fftSize);

  let maxEnergy = 0;
  let maxBin    = lowBin;

  for (let i = lowBin; i <= highBin; i++) {
    if (rawFreqData[i] > maxEnergy) {
      maxEnergy = rawFreqData[i];
      maxBin    = i;
    }
  }

  // Skip if no meaningful bass signal
  if (maxEnergy < 20) return;

  // Convert bin index to Hz
  const hz = (maxBin * sampleRate) / fftSize;

  // Convert Hz to MIDI semitone relative to C0 (16.352 Hz)
  const C0_HZ = 16.352;
  const semitone = Math.round(12 * Math.log2(hz / C0_HZ));

  // Pitch class = semitone mod 12 (normalise to 0–11)
  const pitchClass = ((semitone % 12) + 12) % 12;

  // Boost root candidate
  chroma[pitchClass] = Math.min(1.0, chroma[pitchClass] * 1.5);
}

// -------------------------------------------------------------------
// Private: matchChord — runs cosine similarity against all 96 templates,
// returns best match index, best score, and confidence gap.
// -------------------------------------------------------------------

function matchChord(
  chroma: Float32Array
): { bestIdx: number; bestScore: number; confidenceGap: number } {
  let bestIdx    = 0;
  let bestScore  = -Infinity;
  let secondBest = -Infinity;

  for (let i = 0; i < CHORD_TEMPLATES.length; i++) {
    const score = cosineSim(chroma, CHORD_TEMPLATES[i].template);
    if (score > bestScore) {
      secondBest = bestScore;
      bestScore  = score;
      bestIdx    = i;
    } else if (score > secondBest) {
      secondBest = score;
    }
  }

  const confidenceGap = bestScore - (secondBest === -Infinity ? 0 : secondBest);
  return { bestIdx, bestScore, confidenceGap };
}

// -------------------------------------------------------------------
// extractAndMatchChord: Main per-tick function.
//
// Called by the analysis tick orchestrator (10fps / 100ms).
// Extracts chroma, applies bass weighting, smooths over 3 frames,
// matches against 96 templates, and updates ChordState with the result.
//
// CRITICAL: Zero new Float32Array allocations inside this function.
// All buffers come from initChordState().
// -------------------------------------------------------------------

export function extractAndMatchChord(state: AudioStateRef, audioTimeSec: number): void {
  // Guard: require chord state, analysis state, and raw freq data
  if (!state.chord || !state.analysis || !state.rawFreqData) return;

  const chord    = state.chord;
  const analysis = state.analysis;

  // Ensure rawTimeDataFloat is populated.
  // AnalysisTick populates it when kb/guitar disambiguation runs.
  // If it's all zeros (no disambiguation occurred this tick), convert from rawTimeData.
  if (state.rawTimeData) {
    // Check if rawTimeDataFloat appears to be all zeros
    let isZero = true;
    for (let i = 0; i < Math.min(64, state.fftSize); i++) {
      if (analysis.rawTimeDataFloat[i] !== 0) {
        isZero = false;
        break;
      }
    }
    if (isZero) {
      for (let i = 0; i < state.fftSize; i++) {
        analysis.rawTimeDataFloat[i] = (state.rawTimeData[i] - 128) / 128;
      }
    }
  }

  // Extract 12-element chroma vector via Meyda
  const chromaRaw = Meyda.extract('chroma', analysis.rawTimeDataFloat) as number[];
  if (!chromaRaw || chromaRaw.length !== 12) return;

  // Copy into pre-allocated chromaBuffer (no new allocation)
  for (let i = 0; i < 12; i++) {
    chord.chromaBuffer[i] = chromaRaw[i];
  }

  // Apply bass band weighting to improve root detection (CHORD-02)
  applyBassWeighting(chord.chromaBuffer, state.rawFreqData, state.sampleRate, state.fftSize);

  // Update chroma history ring buffer (3 frames x 12 = 36 elements)
  const offset = chord.chromaHistoryHead * 12;
  for (let i = 0; i < 12; i++) {
    chord.chromaHistory[offset + i] = chord.chromaBuffer[i];
  }
  chord.chromaHistoryHead = (chord.chromaHistoryHead + 1) % 3;

  // Compute smoothed chroma: average of all 3 frames in history (CHORD-05)
  for (let i = 0; i < 12; i++) {
    chord.smoothedChroma[i] =
      (chord.chromaHistory[i] + chord.chromaHistory[12 + i] + chord.chromaHistory[24 + i]) / 3;
  }

  // Match chord via cosine similarity against all 96 templates (CHORD-03, CHORD-04)
  const match = matchChord(chord.smoothedChroma);

  // Update confidence gap
  chord.confidenceGap = match.confidenceGap;

  // Flicker prevention hold gate (CHORD-06):
  // A candidate must be stable for >= HOLD_TICKS (2 ticks = 200ms) before display updates.
  if (match.bestIdx === chord.pendingChordIdx) {
    chord.pendingHoldCount++;

    if (chord.pendingHoldCount >= HOLD_TICKS) {
      const prevDisplayed = chord.displayedChordIdx;
      chord.displayedChordIdx = match.bestIdx;

      // Push to chord log when displayed chord changes (CHORD-11)
      if (match.bestIdx !== prevDisplayed) {
        chord.chordLog.push({
          audioTimeSec,
          chordIdx: match.bestIdx,
          confidenceGap: match.confidenceGap,
        });

        // Cap log at chordLogMaxLen entries
        if (chord.chordLog.length > chord.chordLogMaxLen) {
          chord.chordLog.splice(0, 1);
        }
      }
    }
  } else {
    // New candidate: reset pending state
    chord.pendingChordIdx   = match.bestIdx;
    chord.pendingHoldCount  = 1;
  }
}
