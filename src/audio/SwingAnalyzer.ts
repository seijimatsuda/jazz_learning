/**
 * SwingAnalyzer.ts
 *
 * Computes IOI (inter-onset interval) coefficient of variation from drum onset
 * timestamps to detect rubato / free passages. A high CV indicates irregular
 * beat spacing — i.e. the drummer is playing freely rather than in strict time.
 *
 * When CV > RUBATO_CV_THRESHOLD (0.3), the beat module declares rubato:
 *   - BPM is set to null (display shows "---")
 *   - Pocket score is suppressed to 0 (see PocketScorer.ts)
 *
 * The 0.3 threshold is taken from the project spec (BEAT-05) and is NOT
 * sourced from MIR literature. It is empirical and expected to require tuning
 * once tested against a real jazz recording corpus. See 04-RESEARCH.md open
 * question #2 for the open calibration question.
 *
 * CRITICAL: computeIoiCV uses beat.ioiBuffer (pre-allocated Float32Array of
 * length 19) — NO new typed array allocations per tick.
 *
 * Exports: RUBATO_CV_THRESHOLD, computeIoiCV, applyRubatoGate
 */

import type { BeatState } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tunable: IOI CV above this threshold → rubato detected, BPM = null.
 *  From spec (BEAT-05); not sourced from MIR literature. Treat as empirical. */
export const RUBATO_CV_THRESHOLD = 0.3;

const ONSET_CAP = 20;   // matches drumOnsetTimes length in BeatState

// ---------------------------------------------------------------------------
// computeIoiCV — BEAT-05
// ---------------------------------------------------------------------------

/**
 * Computes the coefficient of variation (stddev / mean) of the inter-onset
 * intervals from the drum onset ring buffer.
 *
 * Uses the pre-allocated beat.ioiBuffer — no new typed array allocations.
 *
 * Returns 1.0 (assume rubato) when:
 *   - drumOnsetCount < 4 (too few onsets to measure groove)
 *   - fewer than 3 valid IOIs are computable (ring buffer edge case)
 *
 * @param beat  BeatState with drumOnsetTimes ring buffer and ioiBuffer (mutated)
 * @returns     IOI coefficient of variation (0.0+); higher = more rubato
 */
export function computeIoiCV(beat: BeatState): number {
  const count = beat.drumOnsetCount;
  if (count < 4) return 1.0;  // too few onsets → assume rubato

  // Read onsets in chronological order from the ring buffer.
  // When buffer has not yet wrapped (count <= ONSET_CAP), start at index 0.
  // When buffer has wrapped (count > ONSET_CAP), drumOnsetHead points at the
  // oldest entry that was most recently overwritten — the next write will be
  // at drumOnsetHead, so drumOnsetHead is the oldest valid index.
  const n = Math.min(count, ONSET_CAP);
  const startIdx = count <= ONSET_CAP
    ? 0
    : beat.drumOnsetHead;  // oldest entry when buffer has wrapped

  let ioiCount = 0;
  let sum = 0;

  for (let i = 0; i < n - 1; i++) {
    const idx1 = (startIdx + i) % ONSET_CAP;
    const idx2 = (startIdx + i + 1) % ONSET_CAP;
    const ioi = beat.drumOnsetTimes[idx2] - beat.drumOnsetTimes[idx1];

    // Skip negative IOIs (can happen at ring buffer wrap with unsorted times)
    if (ioi <= 0) continue;

    beat.ioiBuffer[ioiCount] = ioi;
    sum += ioi;
    ioiCount++;
  }

  if (ioiCount < 3) return 1.0;  // too few valid IOIs

  const mean = sum / ioiCount;
  let variance = 0;
  for (let i = 0; i < ioiCount; i++) {
    const d = beat.ioiBuffer[i] - mean;
    variance += d * d;
  }
  const cv = Math.sqrt(variance / ioiCount) / mean;
  return cv;
}

// ---------------------------------------------------------------------------
// applyRubatoGate — BEAT-05, BEAT-10
// ---------------------------------------------------------------------------

/**
 * Applies rubato gate after BPM update. Sets BPM to null when IOI CV exceeds
 * the rubato threshold. Stores computed CV on beat.ioiCV for UI display.
 *
 * Called in AnalysisTick after updateBpm (BpmTracker) so it can override the
 * autocorrelation-derived BPM when groove is irregular.
 *
 * @param beat  BeatState (mutated in place: ioiCV updated; bpm may become null)
 */
export function applyRubatoGate(beat: BeatState): void {
  beat.ioiCV = computeIoiCV(beat);

  if (beat.ioiCV > RUBATO_CV_THRESHOLD) {
    // Rubato detected — immediately suppress BPM regardless of autocorrelation result
    beat.bpm = null;
  }
}
