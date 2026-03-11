/**
 * TensionScorer.ts — Chord function to tension mapping with lerp smoothing and ring buffer history.
 *
 * This module bridges harmonic analysis (chord detection) and visual output (tension meter,
 * heatmap tinting, edge coloring). It:
 *
 *   1. Maps each ChordFunction to a tension range (TENS-01):
 *      - tonic       → [0.0,  0.2 ]  — home, relaxed and stable
 *      - subdominant → [0.2,  0.45]  — away from home, gentle pull
 *      - dominant    → [0.55, 0.75]  — strong pull toward resolution
 *      - altered     → [0.75, 1.0 ]  — maximum tension, outside/dissonant
 *
 *   2. Lerps currentTension toward the target midpoint at LERP_RATE = 0.05 per frame (TENS-02).
 *      This prevents flickering in the tension meter during fast chord changes.
 *
 *   3. Writes each lerped tension value into a ring buffer of capacity 32 (TENS-03).
 *      At 10fps, 32 samples covers ~3.2 seconds — enough for a 3-second ghost line lookback.
 *
 *   4. Provides getGhostTension() to read the tension value from 30 ticks ago (TENS-05),
 *      enabling the "ghost line" in the tension visualization.
 *
 * CRITICAL: updateTension and getGhostTension must NOT allocate any new objects or typed arrays.
 * All buffers are pre-allocated in initTensionState().
 */

import type { ChordFunction, TensionState } from './types';

// -------------------------------------------------------------------
// Tension target ranges per chord function (TENS-01)
// -------------------------------------------------------------------

export const TENSION_TARGETS: Record<ChordFunction, [number, number]> = {
  tonic:       [0.0,  0.2 ],
  subdominant: [0.2,  0.45],
  dominant:    [0.55, 0.75],
  altered:     [0.75, 1.0 ],
};

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/** Lerp rate toward tension target per 10fps tick (TENS-02) */
const LERP_RATE = 0.05;

/** Ring buffer capacity: 3s at 10fps = 30 samples, +2 margin (TENS-03) */
const HISTORY_CAP = 32;

/** Ticks to look back for ghost line: 30 ticks = 3 seconds at 10fps (TENS-05) */
const GHOST_OFFSET = 30;

// -------------------------------------------------------------------
// initTensionState: Pre-allocates all buffers for tension tracking.
// Call once after calibration. Zero allocations in updateTension after this.
// -------------------------------------------------------------------

export function initTensionState(): TensionState {
  return {
    currentTension:        0,
    tensionHistory:        new Float32Array(HISTORY_CAP),
    tensionHistoryHead:    0,
    tensionHistorySamples: 0,
  };
}

// -------------------------------------------------------------------
// updateTension: Lerp currentTension toward target midpoint and write
// to ring buffer. Called once per 10fps tick.
//
// CRITICAL: Zero new allocations inside this function.
// -------------------------------------------------------------------

export function updateTension(tension: TensionState, chordFunction: ChordFunction): void {
  const [lo, hi] = TENSION_TARGETS[chordFunction];
  const target = (lo + hi) / 2;

  // Lerp toward target (TENS-02)
  tension.currentTension += LERP_RATE * (target - tension.currentTension);

  // Clamp to [0, 1]
  if (tension.currentTension < 0) tension.currentTension = 0;
  if (tension.currentTension > 1) tension.currentTension = 1;

  // Write to ring buffer (TENS-03) — no new allocation
  tension.tensionHistory[tension.tensionHistoryHead] = tension.currentTension;
  tension.tensionHistoryHead = (tension.tensionHistoryHead + 1) % HISTORY_CAP;

  // Track sample count, cap at HISTORY_CAP
  if (tension.tensionHistorySamples < HISTORY_CAP) {
    tension.tensionHistorySamples++;
  }
}

// -------------------------------------------------------------------
// getGhostTension: Read the tension value from 30 ticks ago.
// Returns 0 if fewer than GHOST_OFFSET (30) samples have been written.
//
// CRITICAL: Zero allocations here.
// -------------------------------------------------------------------

export function getGhostTension(tension: TensionState): number {
  if (tension.tensionHistorySamples < GHOST_OFFSET) return 0;

  // The ring buffer head points to the NEXT write slot, so the most recent
  // written value is at (head - 1 + HISTORY_CAP) % HISTORY_CAP.
  // 30 ticks ago is at (head - 1 - (GHOST_OFFSET - 1) + HISTORY_CAP * 2) % HISTORY_CAP
  // = (head - GHOST_OFFSET + HISTORY_CAP * 2) % HISTORY_CAP
  const ghostIdx =
    (tension.tensionHistoryHead - GHOST_OFFSET + HISTORY_CAP * 2) % HISTORY_CAP;

  return tension.tensionHistory[ghostIdx];
}
