/**
 * CrossCorrelationTracker.ts — Pearson r cross-correlation over 2-second sliding windows.
 *
 * Computes pairwise Pearson correlation coefficients between instrument activity
 * score histories stored in pre-allocated circular ring buffers. The correlation
 * is computed over the most recent CORR_WINDOW = 20 samples (2 seconds at 10fps).
 *
 * WHY CROSS-CORRELATION:
 * Instruments that co-activate (e.g. bass and piano locking into a groove) produce
 * positive Pearson r. Instruments that alternate (e.g. piano solo → bass walks →
 * piano comps) produce negative r. This gives a rich directed-graph edge weight
 * for visualizing musical interaction.
 *
 * EDGE SUPPRESSION (INST-07):
 * Edge weights with |r| < 0.3 are suppressed to zero. This prevents visual noise
 * from uncorrelated or weakly correlated instrument pairs cluttering the graph.
 *
 * ZERO ALLOCATIONS:
 * pearsonR reads directly from pre-allocated historyBuffer ring buffers on each
 * InstrumentAnalysis. No new arrays are created during the 10fps analysis tick.
 */

// CORR_WINDOW: 2-second sliding window at 10fps (20 samples)
export const CORR_WINDOW = 20;

/**
 * Computes the Pearson correlation coefficient between two circular ring buffer
 * histories over the most recent min(samplesA, samplesB, CORR_WINDOW) samples.
 *
 * Reads backwards from each head pointer (most recent first) using:
 *   index = (head - 1 - i + 100) % 100
 *
 * Two-pass algorithm:
 *   1. First pass: compute means
 *   2. Second pass: compute covariance and variances
 *
 * Guards:
 *   - Returns 0 if n < 2 (not enough samples)
 *   - Returns 0 if denominator is 0 (no variance in either signal)
 *   - Result clamped to [-1, 1] as final safety
 *
 * @param histA     - Pre-allocated ring buffer for instrument A (Float32Array, length 100)
 * @param headA     - Current write index for instrument A (0–99)
 * @param samplesA  - Number of valid samples written to histA (capped at 100)
 * @param histB     - Pre-allocated ring buffer for instrument B (Float32Array, length 100)
 * @param headB     - Current write index for instrument B (0–99)
 * @param samplesB  - Number of valid samples written to histB (capped at 100)
 * @returns Pearson r in [-1, 1], or 0 if insufficient data
 */
export function pearsonR(
  histA: Float32Array,
  headA: number,
  samplesA: number,
  histB: Float32Array,
  headB: number,
  samplesB: number
): number {
  const n = Math.min(samplesA, samplesB, CORR_WINDOW);

  // Guard: not enough samples
  if (n < 2) return 0;

  // First pass: compute means
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    const idxA = (headA - 1 - i + 100) % 100;
    const idxB = (headB - 1 - i + 100) % 100;
    sumA += histA[idxA];
    sumB += histB[idxB];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  // Second pass: compute covariance and variances
  let cov = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const idxA = (headA - 1 - i + 100) % 100;
    const idxB = (headB - 1 - i + 100) % 100;
    const dA = histA[idxA] - meanA;
    const dB = histB[idxB] - meanB;
    cov += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }

  // Guard: zero denominator (no variance — constant signal)
  const denom = Math.sqrt(denA * denB);
  if (denom === 0) return 0;

  // Clamp to [-1, 1] as final safety (floating point rounding may exceed bounds)
  const r = cov / denom;
  return Math.max(-1, Math.min(1, r));
}

/**
 * Converts a raw Pearson r into an edge weight for the instrument interaction graph.
 *
 * Edge suppression (INST-07): edges with |r| < 0.3 are suppressed to zero to
 * prevent visual noise from weakly correlated instrument pairs.
 *
 * The sign is preserved: positive = co-activating (both active together),
 * negative = alternating (one active while other is quiet).
 *
 * @param r - Pearson r in [-1, 1]
 * @returns Edge weight — 0 if |r| < 0.3, otherwise r (preserving sign)
 */
export function computeEdgeWeight(r: number): number {
  if (Math.abs(r) < 0.3) return 0;
  return r;
}
