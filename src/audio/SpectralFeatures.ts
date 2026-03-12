/**
 * SpectralFeatures.ts — Hand-rolled spectral feature extractors for Phase 12 disambiguation.
 *
 * This file replaces two broken Meyda extractors and provides a new feature:
 *
 * 1. computeSpectralFlatness: Meyda's spectralFlatness silently returns 0 for any
 *    spectrum containing zero-valued bins, because it calls Math.log(0) = -Infinity,
 *    which propagates through the geometric mean and yields NaN → 0. The implementation
 *    here skips zero-valued bins entirely, producing correct values.
 *
 * 2. computeBandCentroid: Band-limited spectral centroid in Hz. Meyda's version
 *    operates over the full spectrum; this variant restricts to a caller-specified
 *    bin range, enabling per-register analysis (e.g. trombone vs sax vs trumpet).
 *
 * 3. chromaEntropy: Shannon entropy of a 12-element chroma vector. Not available
 *    in Meyda. Low entropy = energy in few pitch classes (monophonic / tonal).
 *    High entropy = energy spread (chords / noise).
 *
 * All functions are pure: no side effects, no persistent state, no heap allocations
 * beyond local scalar variables.
 */

/**
 * Computes spectral flatness over a band-limited range of FFT bins.
 * Hand-rolled to fix Meyda's Math.log(0) bug — skips zero-valued bins.
 *
 * Returns [0, 1]: 0 = tonal (single frequency), 1 = noise-like (flat spectrum).
 * Returns 0 when insufficient non-zero bins.
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData()
 * @param lowBin - First FFT bin index (inclusive)
 * @param highBin - Last FFT bin index (inclusive)
 */
export function computeSpectralFlatness(
  freqData: Uint8Array,
  lowBin: number,
  highBin: number
): number {
  let logSum = 0;
  let linSum = 0;
  let count = 0;

  for (let i = lowBin; i <= highBin; i++) {
    const v = freqData[i];
    if (v === 0) continue;
    logSum += Math.log(v);
    linSum += v;
    count++;
  }

  if (count === 0 || linSum === 0) return 0;

  const geometricMean = Math.exp(logSum / count);
  const arithmeticMean = linSum / count;
  return geometricMean / arithmeticMean;
}

/**
 * Computes spectral centroid over a band-limited range, returning frequency in Hz.
 * Used for horn section ordering: trombone < sax < trumpet.
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData()
 * @param lowBin - First FFT bin index (inclusive)
 * @param highBin - Last FFT bin index (inclusive)
 * @param sampleRate - Audio context sample rate (e.g. 44100)
 * @param fftSize - FFT size (e.g. 4096)
 */
export function computeBandCentroid(
  freqData: Uint8Array,
  lowBin: number,
  highBin: number,
  sampleRate: number,
  fftSize: number
): number {
  let weightedSum = 0;
  let totalMag = 0;

  for (let i = lowBin; i <= highBin; i++) {
    const mag = freqData[i];
    const hz = (i * sampleRate) / fftSize;
    weightedSum += hz * mag;
    totalMag += mag;
  }

  return totalMag === 0 ? 0 : weightedSum / totalMag;
}

/**
 * Computes Shannon entropy of a chroma vector (12 pitch classes).
 * Low entropy = energy concentrated in few pitch classes (monophonic).
 * High entropy = energy spread across many pitch classes (chords).
 *
 * Returns raw entropy in [0, log2(12)]. Normalize by dividing by Math.log2(12) for [0, 1].
 *
 * @param chroma - Array of 12 chroma bin values (from Meyda or band-limited extraction)
 */
export function chromaEntropy(chroma: number[]): number {
  let sum = 0;
  for (let i = 0; i < chroma.length; i++) {
    sum += chroma[i];
  }

  if (sum === 0) return 0;

  let entropy = 0;
  for (let i = 0; i < chroma.length; i++) {
    const p = chroma[i] / sum;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}
