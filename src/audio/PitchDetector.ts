/**
 * PitchDetector.ts — ACF2+ autocorrelation pitch detection for keyboard and guitar.
 *
 * Implements the ACF2+ algorithm (cwilso/PitchDetect, MIT License) adapted for:
 *   - Pre-allocated correlation buffer (no per-tick Float32Array allocation)
 *   - RMS gate to reject silence and noise floor
 *   - Parabolic interpolation for sub-sample pitch accuracy
 *   - 3-frame pitch stability window for melodic vs. energetic distinction
 *
 * CRITICAL: detectPitch uses the passed-in correlationBuffer (pre-allocated on
 * InstrumentPitchState). It does NOT allocate a new Float32Array per tick.
 * All callers must pass a buffer of the same length as buf (i.e., fftSize).
 *
 * Phase 8 — MEL-01, MEL-02.
 */

import type { InstrumentPitchState } from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the dominant pitch in a Float32Array of time-domain PCM samples.
 *
 * Uses the ACF2+ algorithm:
 *   1. RMS gate — reject frames where RMS < 0.01 (silence/noise)
 *   2. Autocorrelation written into pre-allocated correlationBuffer
 *   3. Find first dip in correlation sequence
 *   4. Find first peak after dip (highest amplitude lag = fundamental period)
 *   5. Parabolic interpolation for sub-sample accuracy
 *   6. Return sampleRate / T0 as detected frequency in Hz
 *
 * @param buf                - Float32Array of time-domain samples (length = fftSize)
 * @param sampleRate         - Audio sample rate (Hz), read from audioCtx.sampleRate
 * @param correlationBuffer  - Pre-allocated Float32Array (same length as buf); REUSED — not allocated here
 * @returns Detected pitch in Hz, or -1 if RMS too low or no valid peak found
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  correlationBuffer: Float32Array
): number {
  const SIZE = buf.length;

  // 1. RMS gate — reject silence and noise floor
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // 2. Autocorrelation — write into pre-allocated correlationBuffer (zero first)
  // Use explicit loop instead of .fill(0) to guarantee no hidden allocation.
  for (let i = 0; i < SIZE; i++) {
    correlationBuffer[i] = 0;
  }
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      correlationBuffer[i] += buf[j] * buf[j + i];
    }
  }

  // 3. Find first dip: walk forward while correlation is decreasing
  let d = 0;
  while (d < SIZE - 1 && correlationBuffer[d] > correlationBuffer[d + 1]) {
    d++;
  }

  // 4. Find first peak after dip: scan from d to SIZE, track max value and position
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < SIZE; i++) {
    if (correlationBuffer[i] > maxVal) {
      maxVal = correlationBuffer[i];
      maxPos = i;
    }
  }

  // No valid peak found
  if (maxPos <= 0) return -1;

  // 5. Parabolic interpolation for sub-sample accuracy
  // Guards: maxPos must have valid neighbors
  const x1 = maxPos > 0 ? correlationBuffer[maxPos - 1] : correlationBuffer[maxPos];
  const x2 = correlationBuffer[maxPos];
  const x3 = maxPos < SIZE - 1 ? correlationBuffer[maxPos + 1] : correlationBuffer[maxPos];

  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const T0 = a !== 0 ? maxPos - b / (2 * a) : maxPos;

  // Guard: T0 must be a positive finite number
  if (!isFinite(T0) || T0 <= 0) return -1;

  return sampleRate / T0;
}

/**
 * Returns true if two pitches are within 50 cents of each other.
 *
 * 50 cents = half a semitone = 2^(50/1200) ≈ 1.0293 ratio.
 * This threshold is the standard musicology constant for pitch "same note" detection.
 *
 * @param a - First pitch in Hz
 * @param b - Second pitch in Hz
 * @returns true if pitches match within 50 cents; false if either is <= 0
 */
export function pitchesMatch(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = a > b ? a / b : b / a;
  return ratio < 1.029;
}

/**
 * Factory function: creates a fresh InstrumentPitchState with pre-allocated buffers.
 *
 * Pre-allocates correlationBuffer as Float32Array(fftSize) — same length as the
 * time-domain input buffer used by detectPitch. This guarantees zero allocations
 * in the AnalysisTick hot path.
 *
 * @param fftSize - FFT size (4096 per D-01-01-3); correlation buffer must match this
 * @returns Fresh InstrumentPitchState with all fields at initial/safe values
 */
export function initInstrumentPitchState(fftSize: number): InstrumentPitchState {
  return {
    pitchHz: -1,
    prevPitchHz: -1,
    stablePitchHz: -1,
    pitchFrameCount: 0,
    isMelodic: false,
    correlationBuffer: new Float32Array(fftSize),
  };
}

/**
 * Updates InstrumentPitchState for one 10fps tick.
 *
 * Algorithm:
 *   1. Detect pitch using ACF2+ with pre-allocated correlationBuffer
 *   2. Compare detected pitch to previous tick via pitchesMatch (50-cent window)
 *   3. If match: increment pitchFrameCount; at >= 3 consecutive frames, set isMelodic = true
 *   4. If no match or -1: reset pitchFrameCount and isMelodic = false
 *   5. Always update prevPitchHz = pitchHz for next tick
 *
 * @param pitchState - Per-instrument pitch state (mutated in place)
 * @param buf        - Float32Array time-domain samples (rawTimeDataFloat from AnalysisState)
 * @param sampleRate - Audio sample rate from audioCtx.sampleRate
 */
export function updatePitchState(
  pitchState: InstrumentPitchState,
  buf: Float32Array,
  sampleRate: number
): void {
  const detectedHz = detectPitch(buf, sampleRate, pitchState.correlationBuffer);
  pitchState.pitchHz = detectedHz;

  if (detectedHz > 0 && pitchesMatch(detectedHz, pitchState.prevPitchHz)) {
    // Pitch is stable — increment frame count
    pitchState.pitchFrameCount += 1;

    if (pitchState.pitchFrameCount >= 3) {
      // 3+ consecutive frames with matching pitch = melodic activity
      pitchState.isMelodic = true;
      pitchState.stablePitchHz = detectedHz;
    }
  } else {
    // Pitch changed, dropped, or noise — reset stability window
    pitchState.pitchFrameCount = 0;
    pitchState.isMelodic = false;
    pitchState.stablePitchHz = -1;
  }

  // Always update prevPitchHz for next tick comparison
  pitchState.prevPitchHz = detectedHz;
}
