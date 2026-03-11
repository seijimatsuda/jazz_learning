/**
 * RoleClassifier.ts — Role classification state machine with hysteresis.
 *
 * Assigns a RoleLabel ('soloing' | 'comping' | 'holding' | 'silent') to each
 * instrument based on its activity score (0.0–1.0) relative to calibration peak.
 *
 * Thresholds (match CalibrationPass ratios normalized by peak):
 *   soloing  : activityScore >= 0.75  — dominant voice, clearly audible
 *   comping  : activityScore >= 0.40  — accompanying, active support
 *   holding  : activityScore >= 0.10  — sustaining or resting
 *   silent   : activityScore <  0.10  — below noise floor
 *
 * Hysteresis prevents flicker at threshold boundaries. When an instrument is
 * in a given role, it must drop by MORE than the hysteresis amount below the
 * role's lower boundary before transitioning down. Upward transitions have no
 * extra barrier — an instrument can always move to a higher role immediately
 * when the score crosses the threshold.
 *
 * The 10fps update rate (100ms per tick) means role transitions have ~100ms
 * minimum latency, which is perceptually smooth for a jazz visualization.
 */

import type { RoleLabel } from './types';

/**
 * Classify an instrument's role based on its normalized activity score.
 *
 * Uses a hysteresis dead-band on downward transitions to prevent rapid label
 * flipping near threshold boundaries. Upward transitions are immediate.
 *
 * @param activityScore - Normalized activity score in [0, 1] (from computeActivityScore)
 * @param currentRole   - The instrument's current RoleLabel (provides hysteresis context)
 * @param hysteresis    - Dead-band size for downward transitions (default 0.05)
 * @returns New RoleLabel — may equal currentRole if hysteresis holds
 */
export function classifyRole(
  activityScore: number,
  currentRole: RoleLabel,
  hysteresis = 0.05
): RoleLabel {
  // Threshold constants
  const T_SOLO    = 0.75;
  const T_COMP    = 0.40;
  const T_HOLD    = 0.10;

  // --- Upward transitions: no hysteresis barrier ---
  // An instrument can always move up immediately when score crosses the threshold.
  if (activityScore >= T_SOLO) {
    return 'soloing';
  }
  if (activityScore >= T_COMP) {
    // Only transition to comping if not already soloing (already handled above)
    // If currentRole is 'soloing', score < 0.75 but we need hysteresis for downward check
    if (currentRole === 'soloing') {
      // Downward from soloing: must drop below T_SOLO - hysteresis
      if (activityScore < T_SOLO - hysteresis) {
        return 'comping';
      }
      // Still in hysteresis dead-band — stay soloing
      return 'soloing';
    }
    return 'comping';
  }
  if (activityScore >= T_HOLD) {
    // Score is in [0.10, 0.40)
    if (currentRole === 'soloing') {
      // Must cross T_SOLO - hysteresis to leave soloing (already below T_SOLO here)
      // Score < 0.40 so definitely not soloing — transition
      return 'holding';
    }
    if (currentRole === 'comping') {
      // Downward from comping: must drop below T_COMP - hysteresis
      if (activityScore < T_COMP - hysteresis) {
        return 'holding';
      }
      // Still in hysteresis dead-band — stay comping
      return 'comping';
    }
    return 'holding';
  }

  // Score < T_HOLD (0.10)
  if (currentRole === 'holding') {
    // Downward from holding: must drop below T_HOLD - hysteresis
    if (activityScore < T_HOLD - hysteresis) {
      return 'silent';
    }
    // Still in hysteresis dead-band — stay holding
    return 'holding';
  }
  if (currentRole === 'comping') {
    // Score < 0.10, definitely not comping
    return 'silent';
  }
  if (currentRole === 'soloing') {
    // Score < 0.10, definitely not soloing
    return 'silent';
  }

  // currentRole is 'silent': stay silent until score reaches T_HOLD
  return 'silent';
}

/**
 * Accumulate time spent in the current role.
 *
 * Mutates timeInRole in place — no allocations. Called once per 10fps tick
 * with deltaSec = 0.1 (100ms).
 *
 * @param timeInRole  - Record tracking cumulative seconds per RoleLabel
 * @param currentRole - The role to accumulate time for
 * @param deltaSec    - Time elapsed since last tick in seconds (typically 0.1)
 */
export function updateTimeInRole(
  timeInRole: Record<RoleLabel, number>,
  currentRole: RoleLabel,
  deltaSec: number
): void {
  timeInRole[currentRole] += deltaSec;
}
