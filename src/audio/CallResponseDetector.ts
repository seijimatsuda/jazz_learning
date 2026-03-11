/**
 * CallResponseDetector.ts — Sliding window call-and-response detection (MEL-03).
 *
 * Detects the jazz call-and-response pattern: keyboard plays a melodic phrase,
 * guitar responds within a 2-4 second window.
 *
 * Detection logic (runs at 10fps via AnalysisTick):
 *   1. When keyboard goes melodic (isMelodic=true) and no call is active:
 *      → Record lastKbMelodicSec = audioTimeSec
 *   2. While a call is active (lastKbMelodicSec > 0):
 *      → Wait for guitar to go melodic (isMelodic=true)
 *   3. When guitar goes melodic and gap is in [2.0, 4.0] seconds:
 *      → Emit a CallResponseEntry
 *      → Debounce: set lastDetectedResponseSec = audioTimeSec
 *      → Reset: lastKbMelodicSec = -1 (prevent cascading detections)
 *   4. If 4+ seconds pass without guitar response:
 *      → Expire the call (reset lastKbMelodicSec = -1)
 *
 * Exports:
 *   - initCallResponseState(): factory for initial state
 *   - updateCallResponse(): single-tick detection step
 *
 * Performance constraints:
 *   - No allocations on the null/reset paths — only allocates CallResponseEntry on detection
 *   - Called at 10fps from AnalysisTick
 */

import type { CallResponseState, CallResponseEntry } from './types';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the initial call-response detection state.
 * Both timestamps initialized to -1 (no active call or debounce).
 */
export function initCallResponseState(): CallResponseState {
  return {
    lastKbMelodicSec: -1,
    lastDetectedResponseSec: -1,
  };
}

// ---------------------------------------------------------------------------
// Detection step
// ---------------------------------------------------------------------------

/**
 * Runs one 10fps call-response detection step.
 *
 * @param crState       - Mutable call-response detection state (updated in-place)
 * @param kbIsMelodic   - Whether keyboard is currently in melodic state
 * @param gtIsMelodic   - Whether guitar is currently in melodic state
 * @param audioTimeSec  - Current audioCtx.currentTime in seconds
 * @returns CallResponseEntry if an event was detected this tick, null otherwise
 */
export function updateCallResponse(
  crState: CallResponseState,
  kbIsMelodic: boolean,
  gtIsMelodic: boolean,
  audioTimeSec: number,
): CallResponseEntry | null {

  // Step 1: Keyboard goes melodic — start of a call (only if no active call)
  if (kbIsMelodic && crState.lastKbMelodicSec === -1) {
    crState.lastKbMelodicSec = audioTimeSec;
  }

  // Steps 3 & 4: Guitar responds or call expires (only when a call is active)
  if (crState.lastKbMelodicSec > 0) {
    const gap = audioTimeSec - crState.lastKbMelodicSec;

    // Step 4: Call expired — no response within 4 seconds
    if (gap > 4.0) {
      crState.lastKbMelodicSec = -1;
      return null;
    }

    // Step 3: Guitar responds within the 2-4 second window
    if (gtIsMelodic && gap >= 2.0 && gap <= 4.0) {
      // Debounce: skip if this is the same response we already logged
      if (audioTimeSec === crState.lastDetectedResponseSec) {
        return null;
      }

      // Emit the call-response event
      const entry: CallResponseEntry = {
        callSec: crState.lastKbMelodicSec,
        responseSec: audioTimeSec,
        gapSec: gap,
      };

      // Update debounce timestamp and reset call window
      crState.lastDetectedResponseSec = audioTimeSec;
      crState.lastKbMelodicSec = -1;

      return entry;
    }
  }

  return null;
}
