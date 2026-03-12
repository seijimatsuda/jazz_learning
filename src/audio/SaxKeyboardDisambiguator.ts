/**
 * SaxKeyboardDisambiguator.ts
 *
 * Disambiguates saxophone vs keyboard activity using chroma entropy as the
 * primary signal.
 *
 * WHY DISAMBIGUATION IS NEEDED (DISC-05):
 * Saxophone and keyboard share similar frequency bands (250–3000 Hz). Raw band
 * energy cannot separate them. Saxophone is a monophonic instrument — it plays
 * one pitch at a time — producing low chroma entropy (energy concentrated in
 * few pitch classes). Keyboard can play chords → high chroma entropy (energy
 * spread across many pitch classes).
 *
 * ALGORITHM:
 * 1. Compute chroma entropy from the full-spectrum chroma vector.
 * 2. Normalize to [0, 1] by dividing by log2(12).
 * 3. Map: low entropy (<0.3) = sax-like, high entropy (>0.5) = keyboard-like.
 * 4. Clamp weights to [0.15, 0.85] matching KbGuitarDisambiguator convention.
 *
 * NOTE: Band-limiting the chroma computation to the saxophone range is deferred
 * to the calibration phase. Full-spectrum chroma is used here as a first approximation.
 * TODO: band-limit chroma to saxophone range (250–3000 Hz) during calibration.
 *
 * CALIBRATION: Entropy thresholds (0.3, 0.5) are estimates based on typical
 * monophonic vs chordal entropy values. Tuning against real jazz recordings is
 * needed. See CALIBRATION_NEEDED markers below.
 */

import { chromaEntropy } from './SpectralFeatures';

/**
 * Disambiguates saxophone vs keyboard using chroma entropy.
 *
 * Saxophone characteristics:
 * - Monophonic: one pitch class dominant → low chroma entropy
 *
 * Keyboard characteristics:
 * - Polyphonic/chordal: energy spread across pitch classes → high chroma entropy
 *
 * @param chroma - Array of 12 chroma bin values (from Meyda or band-limited extraction)
 * @returns { saxWeight, keyboardWeight, confidence } — each weight in [0.15, 0.85]
 */
export function disambiguateSaxKeyboard(
  chroma: number[],
): { saxWeight: number; keyboardWeight: number; confidence: number } {
  // --- 1. Compute chroma entropy ---
  // chromaEntropy returns raw entropy in [0, log2(12)]; normalize to [0, 1].
  const entropy = chromaEntropy(chroma);
  const normalizedEntropy = entropy / Math.log2(12); // log2(12) ≈ 3.585

  // --- 2. Map normalized entropy to keyboard score ---
  // Low entropy (< 0.3) = sax-like → keyboardScore near 0
  // High entropy (> 0.5) = keyboard-like → keyboardScore near 1
  // Between 0.3–0.5: linear interpolation
  const LOW_ENTROPY_THRESHOLD = 0.3;  // CALIBRATION_NEEDED
  const HIGH_ENTROPY_THRESHOLD = 0.5; // CALIBRATION_NEEDED

  let keyboardScore: number;
  if (normalizedEntropy <= LOW_ENTROPY_THRESHOLD) {
    keyboardScore = 0;
  } else if (normalizedEntropy >= HIGH_ENTROPY_THRESHOLD) {
    keyboardScore = 1;
  } else {
    // Linear ramp across the ambiguous zone [0.3, 0.5]
    keyboardScore = (normalizedEntropy - LOW_ENTROPY_THRESHOLD) /
      (HIGH_ENTROPY_THRESHOLD - LOW_ENTROPY_THRESHOLD);
  }

  // --- 3. Clamp weights to [0.15, 0.85] ---
  // Both instruments always receive at least 15% weight to prevent total suppression.
  const keyboardWeight = 0.15 + keyboardScore * 0.7;
  const saxWeight = 1.15 - keyboardWeight; // equivalent to 0.15 + (1 - keyboardScore) * 0.7

  // --- 4. Confidence ---
  // High confidence when entropy is clearly outside the ambiguous zone.
  const isAmbiguous =
    normalizedEntropy > LOW_ENTROPY_THRESHOLD &&
    normalizedEntropy < HIGH_ENTROPY_THRESHOLD;
  const confidence = isAmbiguous ? 0.3 : 0.8;

  return { saxWeight, keyboardWeight, confidence };
}
