/**
 * NodeAnimState.ts — Per-node animation state interface and utilities.
 *
 * Contains:
 *   - RippleState interface
 *   - NodeAnimState interface (all mutable animation scalars)
 *   - createNodeAnimState factory
 *   - lerp / lerpExp utilities
 *   - drawAndUpdateRipple / updateRipples utilities
 *
 * Ripple utilities are placed here (not in drawGlow.ts) so both bass (05-03)
 * and drums (05-04) animation plans can import them from this Wave 1 artifact,
 * enabling 05-03 and 05-04 to run in parallel.
 *
 * Performance constraints:
 * - NO per-frame allocations inside drawAndUpdateRipple or updateRipples
 * - Ripple array spliced backward to avoid index shifting errors
 * - glowCanvas created once per node via createGlowLayer — never recreated
 *   unless color changes (gated by lastPocketScore threshold in 05-03)
 */

import { createGlowLayer } from '../offscreen/glowLayer';

// ---------------------------------------------------------------------------
// RippleState
// ---------------------------------------------------------------------------

/**
 * Describes a single outward ripple ring emanating from a node.
 * Ripples are stored in NodeAnimState.ripples[] and updated per-frame.
 */
export interface RippleState {
  /** Timestamp (ms) when this ripple was created — from performance.now() or rAF ts */
  startMs: number;
  /** Total duration of the ripple in ms before it expires */
  durationMs: number;
  /** Maximum radius the ripple reaches at the end of its lifetime */
  maxRadius: number;
  /** CSS color string for the ripple ring stroke */
  color: string;
  /** Canvas X coordinate of the ripple center (pixel, not fractional) */
  baseX: number;
  /** Canvas Y coordinate of the ripple center (pixel, not fractional) */
  baseY: number;
}

// ---------------------------------------------------------------------------
// NodeAnimState
// ---------------------------------------------------------------------------

/**
 * All mutable animation state for a single instrument node.
 * Plain object — no class, no methods. Updated in-place each rAF frame.
 *
 * Per RESEARCH.md Pattern 1: scalar fields, bounded ripples array, one
 * offscreen glowCanvas per node (no shadowBlur).
 */
export interface NodeAnimState {
  // --- Core geometry --------------------------------------------------------
  /** Base (resting) radius in CSS pixels — set by role in 05-02 */
  baseRadius: number;
  /** Current rendered radius — lerped toward baseRadius + radiusNudge */
  currentRadius: number;

  // --- Glow -----------------------------------------------------------------
  /** 0–1 intensity multiplier for the offscreen glow drawImage alpha */
  glowIntensity: number;
  /** Off-DOM canvas with pre-rendered radial gradient glow — never shadowBlur */
  glowCanvas: HTMLCanvasElement;

  // --- Transient animation scalars -----------------------------------------
  /** Short-lived radius boost from a beat hit — decays to 0 each frame */
  radiusNudge: number;

  // --- Ripples (bounded array — max 4 active) ------------------------------
  /** Active ripple rings spawned by beat events */
  ripples: RippleState[];

  // --- Orbit / breathe (Phase 5 secondary animations) ----------------------
  /** Current orbit angle in radians — incremented per-frame in 05-05 */
  orbitAngle: number;
  /** Phase offset for sine-based breathe animation — incremented per-frame in 05-05 */
  breathePhase: number;

  // --- Beat-sync timestamps (read from audioStateRef, compared each frame) -
  /** Last audioStateRef.current.beat.lastBassOnsetSec value seen — -1 = never */
  lastSeenBassOnsetSec: number;
  /** Last audioStateRef.current.beat.lastDrumOnsetSec value seen — -1 = never */
  lastSeenDrumOnsetSec: number;
  /** Last audioStateRef.current.beat.beatCounter value seen — -1 = never */
  lastSeenBeatCounter: number;
  /** Last audioStateRef.current.beat.lastDownbeatSec value seen — -1 = never */
  lastSeenDownbeatSec: number;

  // --- Glow re-creation threshold gate (05-03) -----------------------------
  /** Last pocket score used to set glow color — gate prevents re-creating glowCanvas every frame */
  lastPocketScore: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a NodeAnimState with all defaults.
 * Initializes glowCanvas via createGlowLayer.
 *
 * @param color      - Initial CSS color for the glow (e.g. '#b45309')
 * @param baseRadius - Resting radius in CSS pixels
 */
export function createNodeAnimState(color: string, baseRadius: number): NodeAnimState {
  return {
    baseRadius,
    currentRadius: baseRadius,
    glowIntensity: 0.4,
    glowCanvas: createGlowLayer(baseRadius * 2, color),
    radiusNudge: 0,
    ripples: [],
    orbitAngle: 0,
    breathePhase: 0,
    lastSeenBassOnsetSec: -1,
    lastSeenDrumOnsetSec: -1,
    lastSeenBeatCounter: -1,
    lastSeenDownbeatSec: -1,
    lastPocketScore: -1,
  };
}

// ---------------------------------------------------------------------------
// Interpolation utilities
// ---------------------------------------------------------------------------

/**
 * Standard linear interpolation.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor [0, 1]
 * @returns  Value between a and b
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate-independent exponential lerp.
 *
 * Uses `1 - Math.pow(1 - factor, deltaMs / 16.667)` as the t value,
 * which normalizes 'factor' from a per-16ms rate to actual elapsed time.
 * This ensures animation speed is consistent across 30fps and 60fps.
 *
 * @param current  - Current value
 * @param target   - Target value to move toward
 * @param factor   - Lerp factor per 16.667ms frame (e.g. 0.15 = 15% per frame)
 * @param deltaMs  - Elapsed ms since last frame (capped at 100ms by caller)
 * @returns          New value moved toward target
 */
export function lerpExp(current: number, target: number, factor: number, deltaMs: number): number {
  const t = 1 - Math.pow(1 - factor, deltaMs / 16.667);
  return lerp(current, target, t);
}

// ---------------------------------------------------------------------------
// Ripple drawing utilities
// ---------------------------------------------------------------------------

/**
 * Draws a single ripple ring and returns whether it is still alive.
 *
 * @param ctx    - Canvas 2D rendering context
 * @param ripple - Ripple state object
 * @param nowMs  - Current timestamp in ms (from rAF or performance.now())
 * @returns true if the ripple is still within its lifetime, false if expired
 */
export function drawAndUpdateRipple(
  ctx: CanvasRenderingContext2D,
  ripple: RippleState,
  nowMs: number
): boolean {
  const elapsed = nowMs - ripple.startMs;
  if (elapsed >= ripple.durationMs) {
    return false; // expired
  }

  const progress = elapsed / ripple.durationMs;
  const radius = ripple.maxRadius * progress;
  const alpha = 1 - progress;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ripple.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ripple.baseX, ripple.baseY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  return true; // still alive
}

/**
 * Iterates and draws all active ripples, removing expired ones in-place.
 * Iterates backward to allow safe splice without index errors.
 *
 * @param ctx    - Canvas 2D rendering context
 * @param ripples - Mutable ripple array from NodeAnimState
 * @param nowMs  - Current timestamp in ms
 */
export function updateRipples(
  ctx: CanvasRenderingContext2D,
  ripples: RippleState[],
  nowMs: number
): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const alive = drawAndUpdateRipple(ctx, ripples[i], nowMs);
    if (!alive) {
      ripples.splice(i, 1);
    }
  }
}
