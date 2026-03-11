/**
 * EdgeAnimState.ts — Per-edge mutable animation state and factory.
 *
 * Each edge in the instrument graph has its own EdgeAnimState object,
 * created once at CanvasRenderer construction and mutated in-place each frame.
 *
 * Pre-creates two offscreen glow canvases per edge:
 *   - flashGlowCanvas: white glow for sync flash (EDGE-05)
 *   - resolutionGlowCanvas: blue glow for tension resolution flash (EDGE-10)
 *
 * These canvases are created once per edge, never per frame.
 *
 * Performance constraints:
 * - No per-frame allocations — all fields are scalars or pre-created canvases
 * - Glow canvases created once at factory time, reused every frame via drawImage
 */

import { createGlowLayer } from '../offscreen/glowLayer';

// ---------------------------------------------------------------------------
// EdgeAnimState interface
// ---------------------------------------------------------------------------

/**
 * All mutable animation state for a single edge between two instrument nodes.
 * Plain object — no class, no methods. Updated in-place each rAF frame.
 */
export interface EdgeAnimState {
  // --- Core visual state ---------------------------------------------------
  /** Current line weight (thickness) in CSS pixels */
  currentWeight: number;
  /** Current opacity multiplier [0,1] */
  currentOpacity: number;
  /** Color tint interpolation factor [0,1] for tension-driven color shifts */
  tintFactor: number;

  // --- Flash intensities ---------------------------------------------------
  /** Flash intensity [0,1] for sync flash (EDGE-05) — decays per frame */
  flashIntensity: number;
  /** Flash intensity [0,1] for tension resolution flash (EDGE-10) — decays per frame */
  resolutionFlashIntensity: number;

  // --- Animation phases ----------------------------------------------------
  /** Dash offset for flowing dash animation on tight pocket line (EDGE-02) */
  dashOffset: number;
  /** Wobble phase in radians for loose pocket line sine wave (EDGE-03) */
  wobblePhase: number;

  // --- Timestamp gate (prevents re-triggering flash on same event) ---------
  /** Last BeatState.lastSyncEventSec value seen — -1 = never seen */
  lastSeenSyncEventSec: number;

  // --- Pre-created offscreen glow canvases ---------------------------------
  /** White glow canvas for sync flash (EDGE-05) — created once at init */
  flashGlowCanvas: HTMLCanvasElement;
  /** Blue glow canvas for tension resolution flash (EDGE-10) — created once at init */
  resolutionGlowCanvas: HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an EdgeAnimState with all defaults.
 * Pre-creates both offscreen glow canvases once — never recreated per frame.
 *
 * @returns EdgeAnimState with zero/default scalar fields and pre-built glow canvases
 */
export function createEdgeAnimState(): EdgeAnimState {
  return {
    currentWeight: 0,
    currentOpacity: 0,
    tintFactor: 0,
    flashIntensity: 0,
    resolutionFlashIntensity: 0,
    dashOffset: 0,
    wobblePhase: 0,
    lastSeenSyncEventSec: -1,
    flashGlowCanvas: createGlowLayer(30, '#ffffff'),          // sync flash — EDGE-05
    resolutionGlowCanvas: createGlowLayer(30, '#bfdbfe'),     // tension resolution — EDGE-10
  };
}
