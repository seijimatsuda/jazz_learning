/**
 * KbGuitarDisambiguator.ts
 *
 * Disambiguates keyboard vs guitar activity using Zero-Crossing Rate (ZCR)
 * and spectral flux when both instruments are in the lineup.
 *
 * WHY DISAMBIGUATION IS NEEDED:
 * The mid (250–2000Hz) and mid_high (300–3000Hz) bands overlap significantly.
 * When both keyboard and guitar are present, raw band energy cannot distinguish
 * them. Guitar produces higher ZCR (plucked/strummed transients) and higher
 * spectral flux (sharper attacks) than keyboard (sustained, more tonal).
 * This module produces a weight pair (keyboardWeight, guitarWeight) summing to
 * ~1.0 that scales each instrument's activity score.
 *
 * CRITICAL NOTES:
 * - WARNING: Meyda 5.6.3 spectralFlux extractor is BROKEN (negative index bug,
 *   returns 0 or NaN). computeSpectralFlux is hand-rolled — do NOT replace it
 *   with Meyda.extract('spectralFlux', ...).
 * - The Uint8Array→Float32Array conversion for Meyda ZCR happens OUTSIDE this
 *   module. The caller must convert rawTimeData (Uint8Array) into the pre-allocated
 *   AnalysisState.rawTimeDataFloat (Float32Array) before calling computeZcr.
 * - The clamping to [0.15, 0.85] is a safety margin — both instruments always
 *   receive at least 15% weight, even with a strong disambiguation signal. This
 *   prevents total suppression of either instrument when the signal is ambiguous.
 */

import Meyda from 'meyda';

/**
 * Computes half-wave rectified spectral flux between two frequency spectra.
 *
 * HAND-ROLLED — does NOT use Meyda.extract('spectralFlux') which is broken
 * in Meyda 5.6.3 (negative index bug causes it to return 0 or NaN).
 *
 * Half-wave rectification means only positive differences (increases in energy)
 * are counted. This matches the onset detection literature and captures the
 * transient attack character of guitar plucks/strums more accurately than
 * a full-wave version would.
 *
 * @param ampSpectrum     Current frame frequency data (Uint8Array, 0–255 per bin)
 * @param prevAmpSpectrum Previous frame frequency data (Uint8Array, 0–255 per bin)
 * @returns Unbounded positive scalar. Higher = more spectral change = more guitar-like.
 */
export function computeSpectralFlux(
  ampSpectrum: Uint8Array,
  prevAmpSpectrum: Uint8Array,
): number {
  let flux = 0;
  const len = Math.min(ampSpectrum.length, prevAmpSpectrum.length);
  for (let i = 0; i < len; i++) {
    const diff = ampSpectrum[i] - prevAmpSpectrum[i];
    if (diff > 0) flux += diff;
  }
  return flux;
}

/**
 * Computes zero-crossing rate (ZCR) using Meyda's verified-correct extractor.
 *
 * Meyda.extract('zcr', ...) is confirmed correct in 5.6.3. Only the
 * spectralFlux extractor is broken.
 *
 * IMPORTANT: rawTimeDataFloat must be the pre-allocated AnalysisState.rawTimeDataFloat
 * buffer. No new allocations are made here. The caller is responsible for converting
 * rawTimeData (Uint8Array, 0–255) into float values in [-1, 1] range before this call.
 *
 * @param rawTimeDataFloat Pre-allocated Float32Array with time-domain samples in [-1, 1]
 * @param sampleRate       Audio context sample rate (e.g. 44100 or 48000)
 * @param bufferSize       FFT size (e.g. 4096)
 * @returns Raw ZCR count as integer in [0, bufferSize - 1]
 */
export function computeZcr(
  rawTimeDataFloat: Float32Array,
  sampleRate: number,
  bufferSize: number,
): number {
  Meyda.bufferSize = bufferSize;
  Meyda.sampleRate = sampleRate;
  const result = Meyda.extract('zcr', rawTimeDataFloat) as number;
  return result;
}

/**
 * Computes keyboard vs guitar disambiguation weights using ZCR and spectral flux.
 *
 * Guitar characteristics:
 * - Higher ZCR due to plucked/strummed transients
 * - Higher spectral flux due to sharp attack envelopes
 *
 * Keyboard characteristics:
 * - Lower ZCR due to sustained, tonal output
 * - Lower spectral flux due to smoother energy evolution
 *
 * The function normalizes both features to [0, 1], averages them into a
 * guitarScore, and returns complementary weights. Weights are clamped to
 * [0.15, 0.85] so neither instrument is ever fully zeroed out.
 *
 * NOTE: The flux normalization constant 5000 is a starting estimate from
 * research (open question #1). Empirical tuning with real jazz recordings
 * is needed in a later phase. When guitarScore is below the clamping floor,
 * keyboardWeight + guitarWeight will be slightly above 1.0 due to clamping.
 *
 * @param rawFreqData      Current frame frequency magnitude data (Uint8Array)
 * @param prevRawFreqData  Previous frame frequency magnitude data (Uint8Array)
 * @param rawTimeDataFloat Pre-allocated Float32Array with time-domain samples in [-1, 1]
 * @param sampleRate       Audio context sample rate
 * @param fftSize          FFT size (e.g. 4096 — gives 2048 frequency bins)
 * @returns { keyboardWeight, guitarWeight } — each in [0.15, 0.85]
 */
export function disambiguate(
  rawFreqData: Uint8Array,
  prevRawFreqData: Uint8Array,
  rawTimeDataFloat: Float32Array,
  sampleRate: number,
  fftSize: number,
): { keyboardWeight: number; guitarWeight: number } {
  // ZCR: normalize by (fftSize - 1) to get [0, 1]
  const zcr = computeZcr(rawTimeDataFloat, sampleRate, fftSize);
  const normalizedZcr = zcr / (fftSize - 1);

  // Spectral flux: normalize with 5000 empirical constant (tunable)
  const flux = computeSpectralFlux(rawFreqData, prevRawFreqData);
  const normalizedFlux = Math.min(1, flux / 5000);

  // Guitar score = average of normalized ZCR and normalized flux
  const guitarScore = (normalizedZcr + normalizedFlux) / 2;

  // Clamp to [0.15, 0.85] to prevent total suppression of either instrument
  const guitarWeight = Math.min(0.85, Math.max(0.15, guitarScore));
  const keyboardWeight = Math.min(0.85, Math.max(0.15, 1 - guitarScore));

  return { keyboardWeight, guitarWeight };
}
