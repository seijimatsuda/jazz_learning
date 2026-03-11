/**
 * PocketScorer.ts
 *
 * Measures bass-drums synchronization — the "pocket" — by computing a sync
 * score for each co-occurring onset pair within a +-80ms window.
 *
 * Sync score formula (BEAT-08):
 *   score = 1 - (|offsetMs| / 80)   when |offsetMs| <= 80
 *   score = 0                        when |offsetMs| > 80
 *
 * Timing offset convention (BEAT-09):
 *   timingOffsetMs = (drumOnsetSec - bassOnsetSec) * 1000
 *   Positive = drums ahead of bass
 *   Negative = bass ahead of drums
 *
 * A rolling 8-beat average of sync scores (using pre-allocated pocketBuffer)
 * gives a stable pocket reading that smooths over occasional missed onsets
 * while still tracking dynamic changes in tightness over ~8 beats.
 *
 * Pocket score is suppressed to 0 when BPM is null (rubato detected) per
 * BEAT-10, because pocket scoring is undefined when no rhythmic reference
 * exists.
 *
 * Staleness gate: both onsets must be within 500ms of the current audio time,
 * and within 200ms of each other, to be considered a valid pair. This prevents
 * stale onset times from producing spurious pocket scores during rests.
 *
 * CRITICAL: No new Float32Array or Uint8Array allocations in any per-tick
 * function. All buffers (pocketBuffer) are pre-allocated in initBeatState.
 *
 * Exports: computeSyncScore, updatePocketScore
 */

import type { BeatState } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POCKET_WINDOW_MS = 80;    // +-80ms cross-correlation window (BEAT-08)
const POCKET_CAP = 8;           // rolling 8-beat average (BEAT-08)
const STALENESS_SEC = 0.5;      // onset older than 500ms is stale
const PAIR_GAP_SEC = 0.2;       // onsets more than 200ms apart are not a musical pair

// ---------------------------------------------------------------------------
// computeSyncScore — BEAT-08, BEAT-09
// ---------------------------------------------------------------------------

/**
 * Computes the sync score between a drum onset and a bass onset.
 *
 * Sync score = 1 - (|offsetMs| / 80)  when |offset| <= 80ms
 * Sync score = 0                       when |offset| > 80ms
 *
 * timingOffsetMs is positive when drums are ahead of bass (BEAT-09).
 *
 * @param drumOnsetSec  Drum onset time in seconds (audioCtx.currentTime)
 * @param bassOnsetSec  Bass onset time in seconds (audioCtx.currentTime)
 * @returns { score, offsetMs } — score 0.0–1.0; offsetMs positive = drums ahead
 */
export function computeSyncScore(
  drumOnsetSec: number,
  bassOnsetSec: number,
): { score: number; offsetMs: number } {
  const offsetMs = (drumOnsetSec - bassOnsetSec) * 1000;  // positive = drums ahead
  const absOffset = Math.abs(offsetMs);
  const score = absOffset <= POCKET_WINDOW_MS
    ? 1 - (absOffset / POCKET_WINDOW_MS)
    : 0;
  return { score, offsetMs };
}

// ---------------------------------------------------------------------------
// updatePocketScore — BEAT-08, BEAT-09, BEAT-10
// ---------------------------------------------------------------------------

/**
 * Called every tick. Checks for a fresh onset pair and updates the rolling
 * 8-beat pocket score average.
 *
 * Rubato suppression (BEAT-10): immediately returns with pocketScore = 0 when
 * beat.bpm is null.
 *
 * Staleness gate: skips if either onset is older than 500ms or the pair gap
 * exceeds 200ms — prevents stale timestamps from contaminating the average.
 *
 * Uses beat.pocketBuffer (pre-allocated Float32Array length 8). No new typed
 * array allocations.
 *
 * @param beat          BeatState (mutated: pocketScore, timingOffsetMs, pocketBuffer)
 * @param audioTimeSec  audioCtx.currentTime in seconds
 */
export function updatePocketScore(
  beat: BeatState,
  audioTimeSec: number,
): void {
  // Rubato suppression (BEAT-10): suppress pocket score when BPM is null
  if (beat.bpm === null) {
    beat.pocketScore = 0;
    return;
  }

  // Check staleness: both onsets must be recent (within 500ms)
  const drumAge = beat.lastDrumOnsetSec > 0
    ? audioTimeSec - beat.lastDrumOnsetSec
    : Infinity;
  const bassAge = beat.lastBassOnsetSec > 0
    ? audioTimeSec - beat.lastBassOnsetSec
    : Infinity;

  // Only compute sync when both onsets are fresh
  if (drumAge > STALENESS_SEC || bassAge > STALENESS_SEC) {
    // No fresh pair — keep existing rolling average unchanged
    return;
  }

  // Check if this is a NEW onset pair (avoid recomputing same pair)
  // Both must be within 200ms of each other to be considered a musical pair
  const pairGap = Math.abs(beat.lastDrumOnsetSec - beat.lastBassOnsetSec);
  if (pairGap > PAIR_GAP_SEC) return;  // onsets too far apart to be a musical pair

  // Compute sync score
  const { score, offsetMs } = computeSyncScore(
    beat.lastDrumOnsetSec,
    beat.lastBassOnsetSec,
  );

  // Update timing offset (BEAT-09)
  beat.timingOffsetMs = offsetMs;

  // Push sync score into rolling 8-beat pocket buffer (BEAT-08)
  beat.pocketBuffer[beat.pocketHead] = score;
  beat.pocketHead = (beat.pocketHead + 1) % POCKET_CAP;
  if (beat.pocketSamples < POCKET_CAP) beat.pocketSamples++;

  // Compute rolling average from valid samples
  const n = beat.pocketSamples;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += beat.pocketBuffer[i];
  beat.pocketScore = sum / n;
}
