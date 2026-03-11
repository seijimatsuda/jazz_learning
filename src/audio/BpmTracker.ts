/**
 * BpmTracker.ts
 *
 * Derives BPM from the OSS ring buffer (populated by DrumTransientDetector)
 * via time-domain autocorrelation. Updated every 2 seconds (20 ticks at 10fps).
 *
 * At 10fps, BPM precision is ~±5 BPM — this is a known limitation documented
 * in 04-RESEARCH.md. The autocorrelation approach is chosen for its robustness
 * in irregular jazz time rather than IOI averaging.
 *
 * BEAT-04: BPM updated only every 20 ticks (2 seconds) to reduce noise.
 * BEAT-06: Swing double-tempo check — if AC[2*lag] > 0.6 * AC[lag], use 2*lag
 *          as the true beat period. Prevents reporting double-tempo on straight-8s.
 * BEAT-03: Bass onset detection via RMS delta over 20–250 Hz with 80ms debounce.
 *
 * CRITICAL: No new Float32Array or Uint8Array allocations in any per-tick
 * function. The 3-element `vals` array in updateBpm is created every 2 seconds
 * (not per-tick), which is negligible GC pressure.
 */

import type { BeatState, FrequencyBand } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSS_CAP = 60;                    // 6 seconds at 10fps (matches DrumTransientDetector)
const AC_CAP = 30;                     // half of OSS buffer
const MIN_LAG = 3;                     // ~200 BPM at 10fps (600/3 = 200)
const MAX_LAG = 12;                    // ~50 BPM at 10fps (600/12 = 50)
const SWING_RATIO = 0.6;               // AC[2*lag] > 0.6 * AC[lag] → swing detected (BEAT-06)
const MIN_OSS_SAMPLES = 20;            // need 2 seconds before autocorrelation is meaningful
const AC_UPDATE_INTERVAL = 20;         // ticks (2 seconds at 10fps) (BEAT-04)
const BASS_DEBOUNCE_SEC = 0.08;        // 80ms debounce to suppress kick drum bleed
const BASS_THRESHOLD_MULTIPLIER = 1.5; // same pattern as drum threshold (BEAT-02)
const BPM_HISTORY_CAP = 3;            // median of last 3 BPM estimates
const FLUX_WINDOW = 20;               // rolling window for adaptive threshold (2 seconds)

// ---------------------------------------------------------------------------
// bassAdaptiveThreshold — internal helper for bass flux buffer
// ---------------------------------------------------------------------------

/**
 * Adaptive threshold for bass flux buffer.
 * Uses the same mean + N*stddev formula as adaptiveThreshold in DrumTransientDetector,
 * but operates on the separate bassFluxBuffer instead of drumFluxBuffer.
 *
 * Returns Infinity when fewer than 3 samples are present (cold-start guard).
 * NO new typed array allocations.
 */
function bassAdaptiveThreshold(bassFluxBuffer: Float32Array, drumFluxSamples: number): number {
  const n = drumFluxSamples; // shared sample counter — same tick cadence as drum flux
  if (n < 3) return Infinity;

  const cap = bassFluxBuffer.length; // FLUX_WINDOW = 20
  const count = Math.min(n, cap);

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += bassFluxBuffer[i];
  }
  const mean = sum / count;

  let variance = 0;
  for (let i = 0; i < count; i++) {
    const d = bassFluxBuffer[i] - mean;
    variance += d * d;
  }
  const stddev = Math.sqrt(variance / count);

  return mean + BASS_THRESHOLD_MULTIPLIER * stddev;
}

// ---------------------------------------------------------------------------
// runAutocorrelation — BEAT-04
// ---------------------------------------------------------------------------

/**
 * Computes time-domain autocorrelation over the OSS ring buffer and writes
 * results into the pre-allocated beat.acBuffer (length 30).
 *
 * The OSS ring buffer is traversed in correct chronological order by
 * linearizing from the oldest sample forward.
 *
 * NO new Float32Array or Uint8Array allocations.
 *
 * @param beat  BeatState with ossBuffer, ossHead, ossSamples, acBuffer (mutated)
 */
export function runAutocorrelation(beat: BeatState): void {
  const oss = beat.ossBuffer;
  const length = beat.ossSamples;
  const ac = beat.acBuffer;
  const maxLag = Math.min(AC_CAP, Math.floor(length / 2));

  // Zero out AC buffer
  for (let i = 0; i < AC_CAP; i++) ac[i] = 0;

  if (length < MIN_OSS_SAMPLES) return;

  // Linearize the ring buffer for correct autocorrelation.
  // Start index in the ring buffer = oldest sample position.
  const start = (beat.ossHead - length + OSS_CAP * 2) % OSS_CAP;

  for (let lag = 1; lag < maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let t = 0; t < length - lag; t++) {
      const idx1 = (start + t) % OSS_CAP;
      const idx2 = (start + t + lag) % OSS_CAP;
      sum += oss[idx1] * oss[idx2];
      count++;
    }
    ac[lag] = count > 0 ? sum / count : 0;
  }
}

// ---------------------------------------------------------------------------
// extractBpm — BEAT-04 + BEAT-06
// ---------------------------------------------------------------------------

/**
 * Finds the dominant period in the autocorrelation output and converts to BPM.
 *
 * Searches lags 3–12 (50–200 BPM range at 10fps).
 * Applies swing double-tempo check (BEAT-06): if AC[2*lag] > 0.6 * AC[lag],
 * the candidate lag is a sub-beat; 2*lag is the true beat period.
 *
 * @param beat  BeatState with pre-computed acBuffer
 * @returns BPM value, or null if no confident peak found
 */
export function extractBpm(beat: BeatState): number | null {
  const ac = beat.acBuffer;
  let bestLag = -1;
  let bestVal = 0;

  for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
    if (ac[lag] > bestVal) {
      bestVal = ac[lag];
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestVal < 0.01) return null;

  // Swing double-tempo check (BEAT-06):
  // If AC at double the lag is nearly as strong, the candidate is a sub-beat.
  // Use 2*lag as the true beat period.
  const doubleLag = bestLag * 2;
  if (doubleLag < AC_CAP && ac[doubleLag] > SWING_RATIO * bestVal) {
    bestLag = doubleLag;
  }

  // BPM = 60 / (lag / 10fps) = 600 / lag
  return 600 / bestLag;
}

// ---------------------------------------------------------------------------
// updateBpm — BEAT-04
// ---------------------------------------------------------------------------

/**
 * Called every tick. Only runs autocorrelation every AC_UPDATE_INTERVAL ticks
 * (every 2 seconds). Applies median smoothing over the last 3 BPM estimates.
 *
 * Holds beat.bpm = null until OSS buffer has >= 20 samples (first 2 seconds).
 *
 * The 3-element `vals` array is created every 2 seconds, not per-tick —
 * GC impact is negligible per the 04-RESEARCH.md "Don't Hand-Roll" note.
 *
 * @param beat  BeatState (mutated in place)
 */
export function updateBpm(beat: BeatState): void {
  beat.ticksSinceAcUpdate++;

  if (beat.ticksSinceAcUpdate < AC_UPDATE_INTERVAL) return;
  beat.ticksSinceAcUpdate = 0;

  if (beat.ossSamples < MIN_OSS_SAMPLES) {
    beat.bpm = null;
    return;
  }

  runAutocorrelation(beat);
  const rawBpm = extractBpm(beat);

  if (rawBpm === null) {
    beat.bpm = null;
    return;
  }

  // Push into 3-slot BPM history for median smoothing
  beat.bpmHistory[beat.bpmHistoryHead] = rawBpm;
  beat.bpmHistoryHead = (beat.bpmHistoryHead + 1) % BPM_HISTORY_CAP;
  if (beat.bpmHistorySamples < BPM_HISTORY_CAP) beat.bpmHistorySamples++;

  // Compute median of available BPM estimates
  if (beat.bpmHistorySamples < 2) {
    beat.bpm = Math.round(rawBpm);
    return;
  }

  // Sort the available values to find median (max 3 values, created every 2s)
  const n = beat.bpmHistorySamples;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push(beat.bpmHistory[i]);
  vals.sort((a, b) => a - b);
  const median = n === 3 ? vals[1] : (vals[0] + vals[1]) / 2;
  beat.bpm = Math.round(median);
}

// ---------------------------------------------------------------------------
// computeBassRmsDelta — BEAT-03
// ---------------------------------------------------------------------------

/**
 * Computes the half-wave rectified RMS delta in the bass frequency band
 * (20–250 Hz). "Half-wave rectified" means only positive energy increases
 * contribute — matching onset detection literature (Bello et al., 2005).
 *
 * NO new typed array allocations.
 *
 * @param rawFreqData   Current frame byte frequency data (0–255, pre-allocated)
 * @param prevBassRms   RMS value from previous tick (beat.prevBassRms)
 * @param bassBand      FrequencyBand covering 20–250 Hz (bass band)
 * @returns { currentRms, delta } — delta is half-wave rectified (>= 0)
 */
export function computeBassRmsDelta(
  rawFreqData: Uint8Array,
  prevBassRms: number,
  bassBand: FrequencyBand,
): { currentRms: number; delta: number } {
  let sumSq = 0;
  const count = bassBand.highBin - bassBand.lowBin + 1;
  for (let i = bassBand.lowBin; i <= bassBand.highBin; i++) {
    const v = rawFreqData[i] / 255;
    sumSq += v * v;
  }
  const currentRms = Math.sqrt(sumSq / count);
  const delta = Math.max(0, currentRms - prevBassRms); // half-wave rectified
  return { currentRms, delta };
}

// ---------------------------------------------------------------------------
// detectBassOnset — BEAT-03
// ---------------------------------------------------------------------------

/**
 * Detects bass onsets via RMS delta over the bass frequency band (20–250 Hz).
 *
 * Algorithm:
 * 1. Compute bass RMS delta (half-wave rectified) via computeBassRmsDelta
 * 2. Push delta into bassFluxBuffer for adaptive threshold tracking
 * 3. Compute adaptive threshold over bassFluxBuffer
 * 4. Apply 80ms debounce gate to suppress kick drum bleed
 * 5. Additional kick suppression: suppress if drum flux is also elevated
 * 6. Onset fires when delta > threshold AND debounce passed AND kick not active
 *
 * NO new Float32Array or Uint8Array allocations.
 *
 * @param beat          BeatState (mutated in place)
 * @param rawFreqData   Current frame byte frequency data (0–255, pre-allocated)
 * @param bassBand      FrequencyBand covering 20–250 Hz
 * @param audioTimeSec  audioCtx.currentTime in seconds
 * @param drumFlux      Current drum flux value (from DrumTransientDetector)
 * @returns true if a bass onset was detected this tick, false otherwise
 */
export function detectBassOnset(
  beat: BeatState,
  rawFreqData: Uint8Array,
  bassBand: FrequencyBand,
  audioTimeSec: number,
  drumFlux: number,
): boolean {
  // 1. Compute bass RMS delta
  const { currentRms, delta } = computeBassRmsDelta(rawFreqData, beat.prevBassRms, bassBand);
  beat.prevBassRms = currentRms;

  // 2. Push delta into bass flux buffer for adaptive threshold tracking.
  // Use drumFluxHead - 1 as the write index since drumFluxHead was already
  // advanced in detectDrumOnset this same tick. bassFluxBuffer is separate
  // from drumFluxBuffer and shares the same sample count (same tick cadence).
  const bassHead = beat.drumFluxHead === 0 ? FLUX_WINDOW - 1 : beat.drumFluxHead - 1;
  beat.bassFluxBuffer[bassHead] = delta;

  // 3. Adaptive threshold for bass flux (uses bassFluxBuffer, not drumFluxBuffer)
  const threshold = bassAdaptiveThreshold(beat.bassFluxBuffer, beat.drumFluxSamples);

  // 4. Debounce gate: suppress if last bass onset was < 80ms ago
  const timeSinceLast = beat.lastBassOnsetSec > 0
    ? audioTimeSec - beat.lastBassOnsetSec
    : Infinity;

  if (timeSinceLast < BASS_DEBOUNCE_SEC) return false;

  // 5. Kick bleed suppression: compute drum adaptive threshold and check
  // if drum flux is elevated above it (indicating active kick hit)
  const drumMean = (() => {
    const n = beat.drumFluxSamples;
    if (n < 1) return 0;
    const cap = beat.drumFluxBuffer.length;
    const count = Math.min(n, cap);
    let sum = 0;
    for (let i = 0; i < count; i++) sum += beat.drumFluxBuffer[i];
    return sum / count;
  })();
  const kickActive = drumFlux > drumMean * 0.8 * BASS_THRESHOLD_MULTIPLIER;

  // 6. Fire onset when delta exceeds threshold and kick is not dominating
  if (delta > threshold && !kickActive) {
    beat.lastBassOnsetSec = audioTimeSec;
    return true;
  }

  return false;
}
