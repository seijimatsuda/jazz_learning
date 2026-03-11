/**
 * DrumTransientDetector.ts
 *
 * Detects drum transients via band-limited spectral flux over the drums_high
 * (2000–8000 Hz) and ride (6000–10000 Hz) bands. These high-frequency bands
 * are chosen deliberately — see BEAT-01 design note below.
 *
 * BEAT-01 DESIGN NOTE — why drums_high + ride, not snare fundamental (200–800 Hz):
 * The snare fundamental range (200–800 Hz) overlaps heavily with bass guitar,
 * piano comping, and vocal fundamentals in jazz. Using that range for onset
 * detection would produce massive false-positive rates. The snare *crack*
 * (broadband transient energy) is far more prominent and separable in the
 * 2–8 kHz range. The drums_high band is already defined in FrequencyBandSplitter.ts
 * and validated in Phase 2. The ride band (6–10 kHz) captures cymbal ping
 * transients. Together, these high-frequency bands provide reliable drum onset
 * detection without bass/harmony bleed.
 *
 * BEAT-02: Adaptive threshold uses mean + 1.5× stddev over a rolling 2-second
 * window (20 samples at 10 fps). Returns Infinity when fewer than 3 samples
 * are available to prevent false onsets during cold-start.
 *
 * Rising-edge gate: onset fires only when flux > threshold AND flux > previous
 * flux. This prevents double-triggering on the decaying tail of a drum hit.
 *
 * Pattern adapted from computeSpectralFlux in KbGuitarDisambiguator.ts (D-02-03-1).
 *
 * CRITICAL: No new Float32Array or Uint8Array allocations in any per-tick
 * function (computeDrumFlux, adaptiveThreshold, detectDrumOnset). All buffers
 * are pre-allocated in initBeatState().
 */

import type { BeatState, FrequencyBand } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OSS_CAP = 60;                        // 6 seconds at 10fps
const FLUX_WINDOW = 20;                    // 2 seconds at 10fps
const ONSET_CAP = 20;                      // last 20 onset timestamps
const AC_CAP = 30;                         // half of OSS buffer
const POCKET_CAP = 8;                      // rolling 8-beat pocket average
const IOI_CAP = 19;                        // max IOIs from 20 onsets
const BPM_HISTORY_CAP = 3;                 // median of 3 BPM estimates
const DRUM_THRESHOLD_MULTIPLIER = 1.5;     // tunable: mean + N * stddev

// ---------------------------------------------------------------------------
// initBeatState
// ---------------------------------------------------------------------------

/**
 * Pre-allocates all BeatState typed arrays. Call once at analysis init.
 * After this call, all per-tick functions operate allocation-free.
 *
 * @returns Fully initialized BeatState with all fields at zero/null defaults.
 */
export function initBeatState(): BeatState {
  return {
    // OSS ring buffer — 6 seconds at 10fps
    ossBuffer:           new Float32Array(OSS_CAP),
    ossHead:             0,
    ossSamples:          0,

    // Drum flux window — 2 seconds at 10fps
    drumFluxBuffer:      new Float32Array(FLUX_WINDOW),
    drumFluxHead:        0,
    drumFluxSamples:     0,

    // Bass flux window — same capacity
    bassFluxBuffer:      new Float32Array(FLUX_WINDOW),

    // Drum onset ring buffer — last 20 timestamps
    drumOnsetTimes:      new Float32Array(ONSET_CAP),
    drumOnsetHead:       0,
    drumOnsetCount:      0,

    // Last onset scalars
    lastBassOnsetSec:    -1,
    lastDrumOnsetSec:    -1,

    // Autocorrelation output buffer
    acBuffer:            new Float32Array(AC_CAP),

    // Pocket score ring buffer
    pocketBuffer:        new Float32Array(POCKET_CAP),
    pocketHead:          0,
    pocketSamples:       0,

    // BPM update timing
    ticksSinceAcUpdate:  0,

    // Previous tick values for rising-edge detection
    prevDrumFlux:        0,
    prevBassRms:         0,

    // IOI buffer for CV computation
    ioiBuffer:           new Float32Array(IOI_CAP),

    // BPM median smoothing
    bpmHistory:          new Float32Array(BPM_HISTORY_CAP),
    bpmHistoryHead:      0,
    bpmHistorySamples:   0,

    // Output fields
    bpm:                 null,
    ioiCV:               0,
    pocketScore:         0,
    timingOffsetMs:      0,
    lastDownbeatSec:     -1,
    beatCounter:         0,
    lastSyncEventSec:    -1,
  };
}

// ---------------------------------------------------------------------------
// computeDrumFlux — BEAT-01
// ---------------------------------------------------------------------------

/**
 * Computes half-wave rectified spectral flux over the drums_high and ride
 * frequency bands only (BEAT-01). Only positive energy increases are summed,
 * matching onset detection literature (Bello et al., 2005).
 *
 * NO new typed array allocations. Reads directly from the pre-allocated
 * prevFreqData that the caller must maintain.
 *
 * @param freqData        Current frame: raw analyser byte frequency data (0–255)
 * @param prevFreqData    Previous frame: same (pre-allocated Uint8Array on AnalysisState)
 * @param drumsHighBand   FrequencyBand for drums_high (2000–8000 Hz)
 * @param rideBand        FrequencyBand for ride (6000–10000 Hz)
 * @returns Unbounded positive scalar. Higher = stronger drum transient.
 */
export function computeDrumFlux(
  freqData: Uint8Array,
  prevFreqData: Uint8Array,
  drumsHighBand: FrequencyBand,
  rideBand: FrequencyBand,
): number {
  let flux = 0;

  // drums_high band: 2000–8000 Hz
  const dhLow  = drumsHighBand.lowBin;
  const dhHigh = drumsHighBand.highBin;
  for (let i = dhLow; i <= dhHigh; i++) {
    const diff = freqData[i] - prevFreqData[i];
    if (diff > 0) flux += diff;
  }

  // ride band: 6000–10000 Hz
  const rideLow  = rideBand.lowBin;
  const rideHigh = rideBand.highBin;
  for (let i = rideLow; i <= rideHigh; i++) {
    const diff = freqData[i] - prevFreqData[i];
    if (diff > 0) flux += diff;
  }

  return flux;
}

// ---------------------------------------------------------------------------
// adaptiveThreshold — BEAT-02
// ---------------------------------------------------------------------------

/**
 * Computes the adaptive onset threshold as mean + DRUM_THRESHOLD_MULTIPLIER * stddev
 * over the rolling drumFluxBuffer window (2 seconds at 10fps = 20 samples).
 *
 * Returns Infinity when fewer than 3 samples are present to prevent cold-start
 * false onsets.
 *
 * NO new typed array allocations. Reads directly from beat.drumFluxBuffer.
 *
 * @param beat  BeatState with current drumFluxBuffer, drumFluxSamples
 * @returns Adaptive threshold scalar, or Infinity if insufficient data.
 */
export function adaptiveThreshold(beat: BeatState): number {
  const n = beat.drumFluxSamples;
  if (n < 3) return Infinity;

  const buf = beat.drumFluxBuffer;
  const cap = buf.length; // FLUX_WINDOW = 20

  // Compute mean over the last n samples (may be fewer than cap during warmup)
  let sum = 0;
  const count = Math.min(n, cap);
  for (let i = 0; i < count; i++) {
    sum += buf[i];
  }
  const mean = sum / count;

  // Compute population stddev
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const d = buf[i] - mean;
    variance += d * d;
  }
  const stddev = Math.sqrt(variance / count);

  return mean + DRUM_THRESHOLD_MULTIPLIER * stddev;
}

// ---------------------------------------------------------------------------
// detectDrumOnset — BEAT-01 + BEAT-02 + BEAT-07
// ---------------------------------------------------------------------------

/**
 * Main per-tick drum onset detection function. Called at 10fps.
 *
 * Algorithm:
 * 1. Compute drum flux over drums_high + ride bands (BEAT-01)
 * 2. Push flux into rolling drumFluxBuffer for adaptive threshold (BEAT-02)
 * 3. Compute adaptive threshold (mean + 1.5 * stddev)
 * 4. Onset fires when: flux > threshold AND flux > prevDrumFlux (rising edge)
 * 5. On onset: store timestamp in drumOnsetTimes ring buffer; push flux into ossBuffer
 * 6. Beat counter increments mod 4; downbeat event fires at counter == 0 (BEAT-07)
 *
 * NO new Float32Array or Uint8Array allocations.
 *
 * @param beat          BeatState (mutated in place)
 * @param freqData      Current frame byte frequency data (0–255, pre-allocated)
 * @param prevFreqData  Previous frame byte frequency data (pre-allocated)
 * @param drumsHighBand FrequencyBand for drums_high
 * @param rideBand      FrequencyBand for ride
 * @param currentTimeSec audioCtx.currentTime in seconds
 * @returns true if a drum onset was detected this tick, false otherwise
 */
export function detectDrumOnset(
  beat: BeatState,
  freqData: Uint8Array,
  prevFreqData: Uint8Array,
  drumsHighBand: FrequencyBand,
  rideBand: FrequencyBand,
  currentTimeSec: number,
): boolean {
  // Step 1: Compute band-limited spectral flux (BEAT-01)
  const flux = computeDrumFlux(freqData, prevFreqData, drumsHighBand, rideBand);

  // Step 2: Push flux into rolling drumFluxBuffer (ring buffer, pre-allocated)
  const fluxIdx = beat.drumFluxHead % FLUX_WINDOW;
  beat.drumFluxBuffer[fluxIdx] = flux;
  beat.drumFluxHead = (beat.drumFluxHead + 1) % FLUX_WINDOW;
  if (beat.drumFluxSamples < FLUX_WINDOW) beat.drumFluxSamples++;

  // Step 3: Compute adaptive threshold (BEAT-02)
  const threshold = adaptiveThreshold(beat);

  // Step 4: Rising-edge gate — onset fires only when flux > threshold AND flux > prevDrumFlux
  const onsetDetected = flux > threshold && flux > beat.prevDrumFlux;

  // Step 5: Push flux into OSS buffer regardless of onset (used for autocorrelation downstream)
  const ossIdx = beat.ossHead % OSS_CAP;
  beat.ossBuffer[ossIdx] = flux;
  beat.ossHead = (beat.ossHead + 1) % OSS_CAP;
  if (beat.ossSamples < OSS_CAP) beat.ossSamples++;

  if (onsetDetected) {
    // Store onset timestamp in pre-allocated ring buffer
    const onsetIdx = beat.drumOnsetHead % ONSET_CAP;
    beat.drumOnsetTimes[onsetIdx] = currentTimeSec;
    beat.drumOnsetHead = (beat.drumOnsetHead + 1) % ONSET_CAP;
    if (beat.drumOnsetCount < ONSET_CAP) beat.drumOnsetCount++;

    beat.lastDrumOnsetSec = currentTimeSec;

    // Beat counter mod 4; downbeat fires at 0 (BEAT-07)
    beat.beatCounter = (beat.beatCounter + 1) % 4;
    if (beat.beatCounter === 0) {
      beat.lastDownbeatSec = currentTimeSec;
    }
  }

  // Update previous flux for next tick's rising-edge check
  beat.prevDrumFlux = flux;

  return onsetDetected;
}
