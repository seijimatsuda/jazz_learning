/**
 * TromboneBassDisambiguator.ts
 *
 * Disambiguates trombone vs bass activity using spectral flatness in the mid
 * band (250–2000 Hz) as the primary signal, with sub-bass onset rate as a
 * secondary signal.
 *
 * WHY DISAMBIGUATION IS NEEDED (DISC-01):
 * Trombone and upright bass share low-frequency energy. Both produce energy in
 * the bass/low-mid bands, making raw band energy an unreliable separator.
 * Trombone produces richer, more harmonically dense tones → higher spectral
 * flatness. Upright bass produces percussive, tonal plucks with sharp sub-bass
 * onsets → lower flatness and more frequent sub-bass energy spikes.
 *
 * ALGORITHM:
 * 1. Mid-band spectral flatness (250–2000 Hz): trombone is noise-like relative
 *    to bass (sustained breath + reed harmonics → higher flatness).
 * 2. Sub-bass onset rate (20–80 Hz delta energy): bass produces more frequent
 *    sub-bass transients from string plucks.
 *
 * Weights are clamped to [0.15, 0.85] matching KbGuitarDisambiguator convention
 * so neither instrument is ever fully zeroed out.
 *
 * CALIBRATION: Two thresholds marked CALIBRATION_NEEDED require tuning against
 * real jazz recordings. ONSET_THRESHOLD = 30 and ONSET_RATE_NUDGE_THRESHOLD = 0.3
 * are estimates based on typical sub-bass energy ranges.
 */

import { computeSpectralFlatness } from './SpectralFeatures';
import type { FrequencyBand, DisambiguationState } from './types';

/** Sub-bass onset delta energy threshold — increase counts as bass onset. @CALIBRATION_NEEDED */
const ONSET_THRESHOLD = 30; // CALIBRATION_NEEDED

/** Onset rate above this value nudges weight toward bass. @CALIBRATION_NEEDED */
const ONSET_RATE_NUDGE_THRESHOLD = 0.3; // CALIBRATION_NEEDED

/**
 * Disambiguates trombone vs bass using mid-band spectral flatness + sub-bass
 * onset detection.
 *
 * Trombone characteristics:
 * - Higher spectral flatness in 250–2000 Hz (richer sustained harmonics)
 * - Fewer sub-bass onsets (sustained pitch, not plucked)
 *
 * Bass characteristics:
 * - Lower spectral flatness in 250–2000 Hz (tonal, fewer harmonics in mid)
 * - More frequent sub-bass onsets (each plucked note → energy spike at 20–80 Hz)
 *
 * @param freqData      Current frame frequency magnitude data (Uint8Array, 0–255)
 * @param prevFreqData  Previous frame frequency magnitude data (Uint8Array, 0–255)
 * @param bands         FrequencyBand array from buildDefaultBands()
 * @param state         DisambiguationState — mutated in place (flatness/onset buffers)
 * @returns { tromboneWeight, bassWeight, confidence } — each weight in [0.15, 0.85]
 */
export function disambiguateTromboneBass(
  freqData: Uint8Array,
  prevFreqData: Uint8Array,
  bands: FrequencyBand[],
  state: DisambiguationState,
): { tromboneWeight: number; bassWeight: number; confidence: number } {
  // --- 1. Band lookup ---
  const midBand = bands.find((b) => b.name === 'mid');
  if (!midBand) {
    return { tromboneWeight: 0.5, bassWeight: 0.5, confidence: 0 };
  }

  // Sub-bass: look for 'sub' band first; fall back to low portion of 'bass' band.
  // The default bands don't include 'sub' (20–80 Hz), so we derive a bin range
  // from the 'bass' band's low end if available.
  let subLowBin = 0;
  let subHighBin = 0;
  const subBand = bands.find((b) => b.name === 'sub');
  if (subBand) {
    subLowBin = subBand.lowBin;
    subHighBin = subBand.highBin;
  } else {
    const bassBand = bands.find((b) => b.name === 'bass');
    if (bassBand) {
      // Use only the lower portion of the bass band (approx 20–80 Hz bins).
      // We approximate: take bins from bassBand.lowBin to midpoint of bass band.
      subLowBin = bassBand.lowBin;
      subHighBin = Math.floor((bassBand.lowBin + bassBand.highBin) / 4);
      // Guard: ensure at least one bin
      if (subHighBin <= subLowBin) subHighBin = subLowBin + 1;
    }
    // If no bass band either, subLowBin === subHighBin === 0 → onset detection disabled
  }

  // --- 2. Spectral flatness of mid band ---
  const flatness = computeSpectralFlatness(freqData, midBand.lowBin, midBand.highBin);

  // --- 3. Sub-bass onset detection (delta energy) ---
  let currentSubEnergy = 0;
  let prevSubEnergy = 0;
  const onsetEnabled = subHighBin > subLowBin;

  if (onsetEnabled) {
    for (let i = subLowBin; i <= subHighBin; i++) {
      currentSubEnergy += freqData[i];
      prevSubEnergy += prevFreqData[i];
    }
  }

  const deltaEnergy = currentSubEnergy - prevSubEnergy;
  const isOnset = onsetEnabled && deltaEnergy > ONSET_THRESHOLD ? 1 : 0;

  // Push onset into ring buffer
  const onsetBufLen = state.onsetBuffer.length;
  state.onsetBuffer[state.onsetBufferHead] = isOnset;
  state.onsetBufferHead = (state.onsetBufferHead + 1) % onsetBufLen;
  if (state.onsetBufferSamples < onsetBufLen) state.onsetBufferSamples++;

  // Compute onset rate
  let onsetSum = 0;
  const onsetSamples = state.onsetBufferSamples;
  for (let i = 0; i < onsetSamples; i++) {
    onsetSum += state.onsetBuffer[i];
  }
  const onsetRate = onsetSamples > 0 ? onsetSum / onsetSamples : 0;

  // --- 4. Push flatness into ring buffer ---
  const flatBufLen = state.flatnessBuffer.length;
  state.flatnessBuffer[state.flatnessHead] = flatness;
  state.flatnessHead = (state.flatnessHead + 1) % flatBufLen;
  if (state.flatnessSamples < flatBufLen) state.flatnessSamples++;

  // --- 5. Require minimum samples before producing a meaningful result ---
  if (state.flatnessSamples < 3) {
    state.confidence['trombone_bass'] = 0;
    return { tromboneWeight: 0.5, bassWeight: 0.5, confidence: 0 };
  }

  // --- 6. Compute average flatness from ring buffer ---
  let flatSum = 0;
  const flatSamples = state.flatnessSamples;
  for (let i = 0; i < flatSamples; i++) {
    flatSum += state.flatnessBuffer[i];
  }
  const avgFlatness = flatSum / flatSamples;

  // --- 7. Map average flatness to trombone score ---
  // Flatness of 0.6+ = fully trombone-like; 0 = fully bass-like.
  let tromboneScore = Math.min(1, avgFlatness / 0.6); // CALIBRATION_NEEDED

  // --- 8. Blend onset rate: frequent sub-bass onsets nudge toward bass ---
  if (onsetRate > ONSET_RATE_NUDGE_THRESHOLD) {
    tromboneScore = tromboneScore - onsetRate * 0.2;
  }

  // Clamp to [0.15, 0.85]
  const tromboneWeight = Math.min(0.85, Math.max(0.15, tromboneScore));
  const bassWeight = Math.min(0.85, Math.max(0.15, 1 - tromboneScore));

  // --- 9. Confidence ---
  // Scales with sample count and distance from 0.5 (ambiguous midpoint)
  const confidence = Math.min(1, flatSamples / 10) * Math.abs(tromboneWeight - 0.5) * 2;

  // --- 10. Update DisambiguationState confidence record ---
  state.confidence['trombone_bass'] = confidence;

  return { tromboneWeight, bassWeight, confidence };
}
