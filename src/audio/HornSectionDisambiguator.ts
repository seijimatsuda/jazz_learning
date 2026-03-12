/**
 * HornSectionDisambiguator.ts
 *
 * Disambiguates horn section instruments (trombone, saxophone, trumpet) using
 * spectral centroid ordering when 3 or more horns are present in the lineup.
 *
 * WHY DISAMBIGUATION IS NEEDED (DISC-03):
 * Jazz horn sections share the same mid-range spectral territory. When three or more
 * horns are playing simultaneously, raw band energy cannot separate them. The key
 * physical insight is that the instruments have different fundamental register ranges:
 *
 *   trombone:  ~80–500 Hz fundamentals, centroid typically ~900 Hz with harmonics
 *   saxophone: ~140–900 Hz fundamentals, centroid typically ~1400 Hz
 *   trumpet:   ~160–1000 Hz fundamentals, centroid typically ~2250 Hz with bright harmonics
 *
 * By computing the spectral centroid over the horn range (250–3000 Hz) and mapping
 * each horn to its expected centroid position, we can assign relative weights.
 *
 * GUARD CONDITION:
 * This function is a no-op when fewer than 3 horns are present. With only 2 horns,
 * the simpler pair-disambiguation path (DISC-04) is used instead. Returning empty
 * weights at confidence 0 signals to the caller to skip weight application.
 *
 * CONFIDENCE PENALTIES:
 * - Centroids within 200 Hz of each other → -0.15 (instruments smearing together)
 * - Multiple high-activity horns present → -0.20 (tutti tutti sections are ambiguous)
 *
 * CALIBRATION NOTE:
 * Expected centroid positions {trombone: 900, saxophone: 1400, trumpet: 2250} are
 * estimates derived from acoustic literature — CALIBRATION_NEEDED for empirical
 * validation against real jazz ensemble recordings.
 */

import { computeBandCentroid } from './SpectralFeatures';
import type { FrequencyBand } from './types';

/**
 * Expected spectral centroid positions (Hz) for each horn instrument.
 * CALIBRATION_NEEDED — these are literature-derived starting estimates.
 * Empirical tuning required with real jazz ensemble recordings.
 */
const EXPECTED_CENTROID_HZ: Record<string, number> = {
  trombone: 900,   // CALIBRATION_NEEDED
  saxophone: 1400, // CALIBRATION_NEEDED
  trumpet: 2250,   // CALIBRATION_NEEDED
};

/** Minimum weight any horn receives, even with poor disambiguation signal */
const WEIGHT_FLOOR = 0.15;

/** Maximum weight any horn receives (matching [0.15, 0.85] convention) */
const WEIGHT_CEILING = 0.85;

/** Centroid proximity threshold in Hz — penalties applied below this */
const CENTROID_PROXIMITY_HZ = 200;

/** Base confidence before applying penalties */
const BASE_CONFIDENCE = 0.7;

/** Confidence penalty when any centroid pair is within CENTROID_PROXIMITY_HZ */
const PROXIMITY_PENALTY = 0.15;

/** Confidence penalty when multiple high-activity horns are present */
const HIGH_ACTIVITY_PENALTY = 0.20;

/** Activity score threshold above which a horn is considered "high activity" */
const HIGH_ACTIVITY_THRESHOLD = 0.6;

/**
 * Disambiguates horn section instrument weights using spectral centroid hierarchy.
 *
 * Algorithm:
 * 1. Guard: if < 3 horns, return empty weights at confidence 0.
 * 2. Locate the 'mid' and 'mid_high' bands to span the horn range (~250–3000 Hz).
 *    Falls back to 'mid' alone if 'mid_high' not found.
 * 3. Compute spectral centroid via computeBandCentroid over the horn range.
 * 4. For each horn, compute distance from actual centroid to expected centroid.
 *    Closer to expected → higher weight. Score = 1 / (1 + distance).
 * 5. Normalize scores to sum to 1.0, then apply WEIGHT_FLOOR and WEIGHT_CEILING.
 * 6. Confidence starts at BASE_CONFIDENCE (0.7):
 *    - -PROXIMITY_PENALTY for each pair of centroids within CENTROID_PROXIMITY_HZ
 *    - -HIGH_ACTIVITY_PENALTY if >= 2 horns have rawActivityScore > HIGH_ACTIVITY_THRESHOLD
 * 7. Return { weights, confidence }.
 *
 * @param freqData        - Uint8Array from analyser.getByteFrequencyData()
 * @param hornInstruments - Array of horns with their raw activity scores
 * @param bands           - Array of FrequencyBand definitions
 * @param sampleRate      - Audio context sample rate (e.g. 44100)
 * @param fftSize         - FFT size (e.g. 4096)
 * @returns { weights: Record<string, number>, confidence: number }
 */
export function disambiguateHornSection(
  freqData: Uint8Array,
  hornInstruments: Array<{ instrument: string; rawActivityScore: number }>,
  bands: FrequencyBand[],
  sampleRate: number,
  fftSize: number,
): { weights: Record<string, number>; confidence: number } {
  // Step 1: guard — require 3+ horns
  if (hornInstruments.length < 3) {
    return { weights: {}, confidence: 0 };
  }

  // Step 2: locate band bin range spanning horn register (~250–3000 Hz)
  const midBand = bands.find((b) => b.name === 'mid');
  const midHighBand = bands.find((b) => b.name === 'mid_high');

  if (!midBand) {
    // No band data — can't compute centroid, return equal weights at zero confidence
    const equalWeight = 1 / hornInstruments.length;
    const fallbackWeights: Record<string, number> = {};
    for (const h of hornInstruments) {
      fallbackWeights[h.instrument] = equalWeight;
    }
    return { weights: fallbackWeights, confidence: 0 };
  }

  const lowBin = midBand.lowBin;
  // Extend to mid_high if available, otherwise use mid's upper bound
  const highBin = midHighBand ? midHighBand.highBin : midBand.highBin;

  // Step 3: compute spectral centroid over the combined horn range
  const centroidHz = computeBandCentroid(freqData, lowBin, highBin, sampleRate, fftSize);

  // Step 4: score each horn by inverse distance from expected centroid
  // Fall back to the instrument's position in the sorted-by-rawActivity list
  // if it has no known expected centroid entry.
  const rawScores: Record<string, number> = {};
  let totalScore = 0;

  for (const h of hornInstruments) {
    const expectedHz = EXPECTED_CENTROID_HZ[h.instrument];
    let score: number;
    if (expectedHz !== undefined) {
      // Inverse distance weighting: closer to expected → higher score
      const distance = Math.abs(centroidHz - expectedHz);
      score = 1 / (1 + distance);
    } else {
      // Unknown instrument — assign neutral score
      score = 1 / (1 + 1000);
    }
    rawScores[h.instrument] = score;
    totalScore += score;
  }

  // Step 5: normalize to sum 1.0, then clamp each weight to [WEIGHT_FLOOR, WEIGHT_CEILING]
  const weights: Record<string, number> = {};
  if (totalScore === 0) {
    const fallbackWeight = 1 / hornInstruments.length;
    for (const h of hornInstruments) {
      weights[h.instrument] = fallbackWeight;
    }
  } else {
    for (const h of hornInstruments) {
      const normalized = rawScores[h.instrument] / totalScore;
      weights[h.instrument] = Math.min(WEIGHT_CEILING, Math.max(WEIGHT_FLOOR, normalized));
    }
  }

  // Step 6: compute confidence with penalties
  let confidence = BASE_CONFIDENCE;

  // Penalty: check if actual centroid is within CENTROID_PROXIMITY_HZ of any expected centroid pair
  // We compare each pair of expected centroids and reduce confidence if the actual centroid
  // falls in a region where two horns' expected positions are indistinguishable.
  const hornNames = hornInstruments.map((h) => h.instrument);
  for (let i = 0; i < hornNames.length; i++) {
    for (let j = i + 1; j < hornNames.length; j++) {
      const expA = EXPECTED_CENTROID_HZ[hornNames[i]];
      const expB = EXPECTED_CENTROID_HZ[hornNames[j]];
      if (expA !== undefined && expB !== undefined) {
        if (Math.abs(expA - expB) < CENTROID_PROXIMITY_HZ) {
          // The expected centroids for this pair are very close — reduce confidence
          confidence -= PROXIMITY_PENALTY;
        }
      }
    }
  }

  // Penalty: multiple high-activity horns (tutti sections are ambiguous)
  const highActivityCount = hornInstruments.filter(
    (h) => h.rawActivityScore > HIGH_ACTIVITY_THRESHOLD,
  ).length;
  if (highActivityCount >= 2) {
    confidence -= HIGH_ACTIVITY_PENALTY;
  }

  // Clamp confidence to [0, 1]
  confidence = Math.min(1, Math.max(0, confidence));

  return { weights, confidence };
}
