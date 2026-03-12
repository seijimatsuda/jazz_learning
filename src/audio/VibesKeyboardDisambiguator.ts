/**
 * VibesKeyboardDisambiguator.ts
 *
 * Disambiguates vibraphone vs keyboard activity using RMS amplitude variance
 * in a 20-frame (2-second) ring buffer to detect tremolo modulation.
 *
 * WHY DISAMBIGUATION IS NEEDED (DISC-02):
 * Vibraphone and keyboard share the same mid-range frequency territory (250–2000 Hz).
 * The key acoustic difference is that vibraphone uses a motor-driven tremolo mechanism
 * that produces periodic amplitude modulation (~3–8 Hz). Keyboard sustain is
 * comparatively steady. By tracking RMS variance over a 2-second window, we can
 * detect this tremolo signature.
 *
 * HONEST CONFIDENCE CAP (MAX_CONFIDENCE = 0.5):
 * At 10fps, the Nyquist limit for tremolo detection is 5 Hz. Standard tremolo
 * runs at 3–8 Hz, so we are near the edge of reliable detection. Additionally,
 * players frequently switch the motor off, making vibes acoustically identical
 * to keyboard during those passages. For this reason, confidence is capped at 0.5.
 * This is a principled honesty bound — not a bug.
 *
 * WEIGHT CLAMPING:
 * Both vibesWeight and keyboardWeight are clamped to [0.15, 0.85], matching the
 * convention in KbGuitarDisambiguator. Neither instrument is ever fully suppressed.
 */

import type { DisambiguationState, FrequencyBand } from './types';

/** MAX_CONFIDENCE = 0.5 — Nyquist limits tremolo detection at 10fps */
const MAX_CONFIDENCE = 0.5;

/**
 * Computes the RMS (root mean square) amplitude of freqData over a band's bin range.
 * Values from getByteFrequencyData() are in [0, 255].
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData()
 * @param lowBin   - First FFT bin index (inclusive)
 * @param highBin  - Last FFT bin index (inclusive)
 * @returns RMS in [0, 255]
 */
function computeBandRms(freqData: Uint8Array, lowBin: number, highBin: number): number {
  let sumSq = 0;
  let count = 0;
  for (let i = lowBin; i <= highBin; i++) {
    const v = freqData[i];
    sumSq += v * v;
    count++;
  }
  return count === 0 ? 0 : Math.sqrt(sumSq / count);
}

/**
 * Pushes the current mid-band RMS sample into the tremolo ring buffer in DisambiguationState.
 * Updates tremoloRmsHead (write index) and tremoloRmsSamples (valid count, capped at buffer length).
 *
 * @param state - DisambiguationState (mutated in place)
 * @param rms   - Current mid-band RMS value to store
 */
export function pushRmsSample(state: DisambiguationState, rms: number): void {
  const bufLen = state.tremoloRmsBuffer.length;
  state.tremoloRmsBuffer[state.tremoloRmsHead] = rms;
  state.tremoloRmsHead = (state.tremoloRmsHead + 1) % bufLen;
  if (state.tremoloRmsSamples < bufLen) {
    state.tremoloRmsSamples++;
  }
}

/**
 * Computes the variance of the values currently stored in the tremolo RMS ring buffer.
 * Requires at least 5 samples; returns 0 if insufficient data.
 *
 * Variance is an unbiased estimator (divided by N-1) computed without heap allocation:
 * a single-pass algorithm accumulates sum and sum-of-squares, then applies the
 * computational formula: Var = (sumSq - sum^2/N) / (N-1).
 *
 * @param state - DisambiguationState containing the ring buffer
 * @returns Variance of stored RMS values, or 0 if < 5 samples
 */
export function computeRmsVariance(state: DisambiguationState): number {
  const n = state.tremoloRmsSamples;
  if (n < 5) return 0;

  let sum = 0;
  let sumSq = 0;
  // Iterate only over valid samples; buffer wraps, but all n entries are valid
  for (let i = 0; i < n; i++) {
    const v = state.tremoloRmsBuffer[i];
    sum += v;
    sumSq += v * v;
  }

  const mean = sum / n;
  // Biased variance (N denominator) is fine for a signal detector
  const variance = sumSq / n - mean * mean;
  return Math.max(0, variance);
}

/**
 * Disambiguates vibraphone vs keyboard using mid-band RMS variance as a tremolo proxy.
 *
 * Algorithm:
 * 1. Find the 'mid' band from the bands array.
 * 2. Compute mid-band RMS from freqData.
 * 3. Push RMS into the ring buffer via pushRmsSample.
 * 4. Compute variance via computeRmsVariance.
 * 5. Map variance to vibesScore: min(1, variance / 1.0) — CALIBRATION_NEEDED
 * 6. Clamp vibesWeight and keyboardWeight to [0.15, 0.85].
 * 7. Confidence is capped at MAX_CONFIDENCE (0.5) due to Nyquist / motor-off limitations.
 *
 * When no 'mid' band is found, returns equal weights at zero confidence.
 *
 * @param freqData - Uint8Array from analyser.getByteFrequencyData()
 * @param bands    - Array of FrequencyBand definitions (must contain a 'mid' entry)
 * @param state    - DisambiguationState (mutated via pushRmsSample)
 * @returns { vibesWeight, keyboardWeight, confidence }
 */
export function disambiguateVibesKeyboard(
  freqData: Uint8Array,
  bands: FrequencyBand[],
  state: DisambiguationState,
): { vibesWeight: number; keyboardWeight: number; confidence: number } {
  // Step 1: locate the mid band
  const midBand = bands.find((b) => b.name === 'mid');
  if (!midBand) {
    return { vibesWeight: 0.5, keyboardWeight: 0.5, confidence: 0 };
  }

  // Step 2: compute mid-band RMS
  const rms = computeBandRms(freqData, midBand.lowBin, midBand.highBin);

  // Step 3: push sample into ring buffer
  pushRmsSample(state, rms);

  // Step 4: compute variance of buffered RMS values
  const variance = computeRmsVariance(state);

  // Step 5: map variance to vibesScore
  // Normalization constant 1.0 is a starting estimate — CALIBRATION_NEEDED
  // (empirical tuning required with real jazz vibraphone recordings)
  const vibesScore = Math.min(1, variance / 1.0);

  // Step 6: clamp weights to [0.15, 0.85]
  const vibesWeight = Math.min(0.85, Math.max(0.15, vibesScore));
  const keyboardWeight = Math.min(0.85, Math.max(0.15, 1 - vibesScore));

  // Step 7: confidence capped at MAX_CONFIDENCE (0.5)
  // Ramps up with sample count and how far weights are from 0.5 (50% = uncertain)
  // MAX_CONFIDENCE = 0.5 — Nyquist limits tremolo detection at 10fps
  const confidence = Math.min(
    MAX_CONFIDENCE,
    (state.tremoloRmsSamples / 20) * Math.abs(vibesWeight - 0.5) * 2,
  );

  return { vibesWeight, keyboardWeight, confidence };
}
