/**
 * InstrumentActivityScorer.ts — Per-instrument activity scoring from per-band RMS energy.
 *
 * Converts raw FFT band energy into 0.0–1.0 activity scores per instrument:
 * - Normalized by calibration peak (so 1.0 = loudest seen during calibration)
 * - EMA smoothed at 10fps (alpha=0.7 → snappy response)
 * - Maintains circular ring buffer history (100 slots = 10 seconds at 10fps)
 *
 * CRITICAL: All Float32Array and Uint8Array allocations happen ONLY in initAnalysisState().
 * Zero allocations during the 10fps analysis tick — avoids GC pressure on iOS Safari.
 */

import type {
  FrequencyBand,
  CalibrationThresholds,
  InstrumentAnalysis,
  AnalysisState,
  RoleLabel,
} from './types';
import { getBandEnergy } from './FrequencyBandSplitter';

// InstrumentName: all eight instruments supported in v1.1
export type InstrumentName = 'bass' | 'drums' | 'keyboard' | 'guitar' | 'saxophone' | 'trumpet' | 'trombone' | 'vibes';

/**
 * Maps instrument name to the FrequencyBand names it owns by default.
 *
 * Band ranges (from buildDefaultBands):
 *   bass:       20–250 Hz   (upright bass body, kick fundamental)
 *   drums_low:  60–300 Hz   (kick attack, snare body)
 *   drums_high: 2000–8000 Hz (hi-hat, snare crack, cymbal body)
 *   ride:       6000–10000 Hz (ride cymbal ping)
 *   mid:        250–2000 Hz  (piano, guitar, sax body)
 *   mid_high:   300–3000 Hz  (brass presence, piano upper harmonics)
 */
export const INSTRUMENT_BAND_MAP: Record<InstrumentName, string[]> = {
  bass:     ['bass'],
  drums:    ['drums_low', 'drums_high', 'ride'],
  keyboard: ['mid'],
  guitar:   ['mid_high'],
  saxophone: ['mid'],
  trumpet:   ['mid_high'],
  trombone:  ['mid'],
  vibes:     ['mid', 'mid_high'],
};

/**
 * The set of instruments that occupy the mid-frequency range.
 * Bass and drums have fixed, non-overlapping bands; all others share mid/mid_high space.
 * Exported for use by calibration code (Plan 02).
 */
export const MID_RANGE_INSTRUMENTS = new Set<InstrumentName>([
  'keyboard', 'guitar', 'saxophone', 'trumpet', 'trombone', 'vibes',
]);

/**
 * Resolves the FrequencyBand names an instrument owns given the current lineup.
 *
 * Implements INST-05 (generalized for v1.1): if only one mid-range instrument
 * (any member of MID_RANGE_INSTRUMENTS) is present in the lineup, that instrument
 * claims both 'mid' and 'mid_high' bands so the full mid-frequency range is covered.
 *
 * @param name - The instrument to resolve bands for
 * @param lineup - All instruments currently in the lineup
 * @returns Array of FrequencyBand names this instrument owns
 */
export function resolveBandsForInstrument(
  name: InstrumentName,
  lineup: InstrumentName[]
): string[] {
  // Bass and drums always use their fixed bands — no fallback
  if (!MID_RANGE_INSTRUMENTS.has(name)) {
    return INSTRUMENT_BAND_MAP[name];
  }

  // Count how many mid-range instruments are in the lineup
  const midRangeCount = lineup.filter(i => MID_RANGE_INSTRUMENTS.has(i)).length;

  // Single mid-range instrument claims full mid spectrum (INST-05 fallback)
  if (midRangeCount === 1) {
    return ['mid', 'mid_high'];
  }

  // Multiple mid-range instruments: each claims only its default band
  return INSTRUMENT_BAND_MAP[name];
}

/**
 * Computes a 0.0–1.0 activity score for an instrument from its band energies.
 *
 * For each band owned by this instrument:
 *   1. Get band energy via getBandEnergy() (normalized to [0,1] by 255 per bin)
 *   2. Normalize by calibration peak (so 1.0 = "as loud as calibration heard it")
 *   3. Average across all valid bands, clamp to [0, 1]
 *   4. Apply EMA smoothing: result = prevScore * (1 - alpha) + raw * alpha
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData()
 * @param bandNames - Which band names this instrument owns
 * @param bands - All FrequencyBand definitions (from buildDefaultBands)
 * @param calibration - CalibrationThresholds per band (from runCalibrationPass)
 * @param prevScore - Previous activity score for EMA smoothing
 * @param smoothingAlpha - EMA alpha (0.7 = snappy; lower = more lag)
 * @returns Smoothed activity score in [0.0, 1.0]
 */
export function computeActivityScore(
  freqData: Uint8Array,
  bandNames: string[],
  bands: FrequencyBand[],
  calibration: CalibrationThresholds[],
  prevScore: number,
  smoothingAlpha = 0.7
): number {
  let total = 0;
  let count = 0;

  for (const name of bandNames) {
    const band = bands.find(b => b.name === name);
    const cal = calibration.find(c => c.band === name);
    if (!band || !cal || cal.peak === 0) continue;

    const energy = getBandEnergy(freqData, band);
    total += energy / cal.peak; // normalize to calibration peak
    count++;
  }

  const raw = count > 0 ? Math.min(1, total / count) : 0;
  // EMA smoothing
  return prevScore * (1 - smoothingAlpha) + raw * smoothingAlpha;
}

// Ring buffer capacity: 10 seconds * 10fps = 100 slots per instrument
export const HISTORY_LENGTH = 100;

/**
 * Writes an activity score into an instrument's circular ring buffer history.
 *
 * Uses the pre-allocated historyBuffer (Float32Array) — zero allocations here.
 * Advances historyHead and increments historySamples (capped at HISTORY_LENGTH).
 *
 * @param instr - InstrumentAnalysis to update
 * @param score - Activity score to push (0.0–1.0)
 */
export function pushHistory(instr: InstrumentAnalysis, score: number): void {
  instr.historyBuffer[instr.historyHead] = score;
  instr.historyHead = (instr.historyHead + 1) % HISTORY_LENGTH;
  if (instr.historySamples < HISTORY_LENGTH) instr.historySamples++;
}

/**
 * Creates a fully initialized AnalysisState with all typed arrays pre-allocated.
 *
 * All Float32Array and Uint8Array buffers are allocated HERE and never again.
 * The 10fps analysis tick reads/writes into these pre-allocated buffers to
 * avoid GC pressure (especially critical on iOS Safari).
 *
 * @param lineup - Instruments in the current session
 * @param fftSize - FFT size (must be 4096 per D-01-01-3); analyser has fftSize/2 bins
 * @returns Fully initialized AnalysisState ready for the analysis tick
 */
export function initAnalysisState(
  lineup: InstrumentName[],
  fftSize: number
): AnalysisState {
  // Build per-instrument analysis entries
  const instruments: InstrumentAnalysis[] = lineup.map(name => ({
    instrument: name,
    bandNames: resolveBandsForInstrument(name, lineup),
    activityScore: 0,
    rawActivityScore: 0,
    displayActivityScore: 0,
    role: 'silent' as RoleLabel,
    roleSinceSec: 0,
    historyBuffer: new Float32Array(HISTORY_LENGTH), // pre-allocated, never re-allocated
    historyHead: 0,
    historySamples: 0,
    timeInRole: { soloing: 0, comping: 0, holding: 0, silent: 0 },
  }));

  // Build edge weight map for all instrument pairs (alphabetically sorted keys)
  const edgeWeights: Record<string, number> = {};
  for (let a = 0; a < instruments.length; a++) {
    for (let b = a + 1; b < instruments.length; b++) {
      const key = [instruments[a].instrument, instruments[b].instrument].sort().join('_');
      edgeWeights[key] = 0;
    }
  }

  return {
    instruments,
    edgeWeights,
    isAnalysisActive: false,
    lastAnalysisMs: 0,
    prevRawFreqData: new Uint8Array(fftSize / 2),  // pre-allocated for spectral flux diff
    rawTimeDataFloat: new Float32Array(fftSize),    // pre-allocated for Meyda ZCR conversion
  };
}
