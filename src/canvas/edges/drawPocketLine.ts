/**
 * drawPocketLine.ts — Pocket line rendering with 3 visual states.
 *
 * Implements EDGE-01 through EDGE-06, EDGE-09, EDGE-10:
 *   EDGE-01: Pocket line always visible between bass and drums
 *   EDGE-02: Tight pocket (>0.7) — thick green flowing dashes
 *   EDGE-03: Loose pocket (0.4-0.7) — medium yellow sine wobble
 *   EDGE-04: Free (< 0.4) — thin gray-blue static line
 *   EDGE-05: Sync flash — white glow at midpoint on confirmed sync event
 *   EDGE-06: Floating label — four pocket phrases above the midpoint
 *   EDGE-09: Tension tinting — base color shifts amber/orange/red at high tension
 *   EDGE-10: Resolution flash — cool blue-white glow when tension drops below 0.3
 *
 * Performance constraints:
 * - NO per-frame allocations
 * - Always ctx.save()/ctx.restore() for lineDash isolation (iOS Safari)
 * - flashGlowCanvas and resolutionGlowCanvas pre-created once in EdgeAnimState
 *
 * Endpoint termination: line starts/ends at each node's circumference,
 * not the center. Computed via normalized direction vector.
 */

import { lerpExp } from '../nodes/NodeAnimState';
import { drawGlow } from '../nodes/drawGlow';
import type { EdgeAnimState } from './EdgeAnimState';
import { getTintedColor } from './edgeTypes';

// ---------------------------------------------------------------------------
// getPocketLabel — EDGE-06
// ---------------------------------------------------------------------------

/**
 * Returns one of four pocket-state phrases based on the current pocket score.
 *
 * @param pocketScore - [0,1] current pocket score
 * @returns Phrase string for the floating label
 */
function getPocketLabel(pocketScore: number): string {
  if (pocketScore > 0.7) return 'deep in the pocket';
  if (pocketScore > 0.5) return 'locked in';
  if (pocketScore > 0.3) return 'swinging loose';
  return 'playing free';
}

// ---------------------------------------------------------------------------
// drawPocketLine — EDGE-01 through EDGE-06
// ---------------------------------------------------------------------------

/**
 * Draws the bass-drums pocket line with state-dependent visual appearance.
 *
 * Always visible regardless of pocket score (EDGE-01).
 *
 * Line terminates at each node's circumference (not center) via direction-vector
 * offset of bassRadius from bass end and drumsRadius from drums end.
 *
 * Visual states (EDGE-02, EDGE-03, EDGE-04):
 *   pocketScore > 0.7: thick green dashes flowing toward drums
 *   pocketScore > 0.4: medium yellow quad-curve wobble
 *   else:              thin gray-blue static line
 *
 * Sync flash (EDGE-05): white glow at midpoint when lastSyncEventSec changes.
 * Floating label (EDGE-06): pocket phrase text above midpoint.
 * Tension tinting (EDGE-09): base color lerps toward amber/red at high tension.
 * Resolution flash (EDGE-10): cool blue-white glow when tension drops below 0.3.
 *
 * @param ctx              - Main canvas 2D rendering context
 * @param bassX            - Bass node center X in logical pixels
 * @param bassY            - Bass node center Y in logical pixels
 * @param bassRadius       - Bass node current radius in logical pixels
 * @param drumsX           - Drums node center X in logical pixels
 * @param drumsY           - Drums node center Y in logical pixels
 * @param drumsRadius      - Drums node current radius in logical pixels
 * @param animState        - Mutable EdgeAnimState (dashOffset, wobblePhase, flashIntensity, etc.)
 * @param pocketScore      - Current pocket score [0,1]
 * @param lastSyncEventSec - BeatState.lastSyncEventSec from audioStateRef
 * @param currentTension   - Current harmonic tension [0,1] for EDGE-09/10
 * @param deltaMs          - Elapsed ms since last frame (capped at 100ms by caller)
 */
export function drawPocketLine(
  ctx: CanvasRenderingContext2D,
  bassX: number,
  bassY: number,
  bassRadius: number,
  drumsX: number,
  drumsY: number,
  drumsRadius: number,
  animState: EdgeAnimState,
  pocketScore: number,
  lastSyncEventSec: number,
  currentTension: number,
  deltaMs: number,
): void {
  // -------------------------------------------------------------------------
  // Compute direction vector and endpoint termination
  // -------------------------------------------------------------------------
  const dx = drumsX - bassX;
  const dy = drumsY - bassY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Guard: nodes coincident or too close — nothing to draw
  if (dist < 1) return;

  // Normalize direction vector
  const nx = dx / dist;
  const ny = dy / dist;

  // Terminate at each node's circumference, not center
  const startX = bassX  + nx * bassRadius;
  const startY = bassY  + ny * bassRadius;
  const endX   = drumsX - nx * drumsRadius;
  const endY   = drumsY - ny * drumsRadius;

  // Midpoint (used for flash glow and label)
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // Perpendicular normal (for wobble control point)
  const perpX = -ny;
  const perpY =  nx;

  // -------------------------------------------------------------------------
  // EDGE-09: Tension tinting — smooth tintFactor toward target each frame
  // -------------------------------------------------------------------------
  const targetTint = currentTension > 0.6 ? (currentTension - 0.6) / 0.4 : 0;
  animState.tintFactor = lerpExp(animState.tintFactor, targetTint, 0.1, deltaMs);

  // -------------------------------------------------------------------------
  // EDGE-05: Sync flash — detect new sync event before drawing
  // -------------------------------------------------------------------------
  if (lastSyncEventSec > 0 && lastSyncEventSec !== animState.lastSeenSyncEventSec) {
    animState.flashIntensity = 1.0;
    animState.lastSeenSyncEventSec = lastSyncEventSec;
  }

  // -------------------------------------------------------------------------
  // Draw line with ctx.save()/ctx.restore() for lineDash isolation (iOS Safari)
  // -------------------------------------------------------------------------
  ctx.save();

  if (pocketScore > 0.7) {
    // -- EDGE-02: Tight pocket — thick green flowing dashes ------------------
    // Base: tight green #4ade80 (r=0x4a, g=0xde, b=0x80)
    const tightColor = animState.tintFactor > 0.01
      ? getTintedColor(0x4a, 0xde, 0x80, animState.tintFactor, currentTension)
      : '#4ade80';
    ctx.strokeStyle = tightColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -animState.dashOffset;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Advance dash offset for flowing animation
    animState.dashOffset = (animState.dashOffset + deltaMs * 0.06) % 20;

  } else if (pocketScore > 0.4) {
    // -- EDGE-03: Loose pocket — medium yellow wobble curve ------------------
    // Base: loose yellow #fde68a (r=0xfd, g=0xe6, b=0x8a)
    const looseColor = animState.tintFactor > 0.01
      ? getTintedColor(0xfd, 0xe6, 0x8a, animState.tintFactor, currentTension)
      : '#fde68a';
    ctx.strokeStyle = looseColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);

    // Control point offset from midpoint along perpendicular normal
    const wobbleAmp = 8 * Math.sin(animState.wobblePhase);
    const cpX = midX + perpX * wobbleAmp;
    const cpY = midY + perpY * wobbleAmp;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    ctx.stroke();

    // Advance wobble phase
    animState.wobblePhase = (animState.wobblePhase + deltaMs * 0.003) % (Math.PI * 2);

  } else {
    // -- EDGE-04: Free — thin gray-blue static line --------------------------
    // Base: free gray-blue #94a3b8 (r=0x94, g=0xa3, b=0xb8)
    const freeColor = animState.tintFactor > 0.01
      ? getTintedColor(0x94, 0xa3, 0xb8, animState.tintFactor, currentTension)
      : '#94a3b8';
    ctx.strokeStyle = freeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();

  // -------------------------------------------------------------------------
  // EDGE-05: Sync flash glow at midpoint
  // -------------------------------------------------------------------------
  if (animState.flashIntensity > 0.01) {
    drawGlow(ctx, animState.flashGlowCanvas, midX, midY, animState.flashIntensity);

    // Decay flash toward 0 (exponential — visible ~200-300ms)
    animState.flashIntensity = lerpExp(animState.flashIntensity, 0, 0.08, deltaMs);
    if (animState.flashIntensity < 0.02) {
      animState.flashIntensity = 0; // snap to zero to stop redundant drawGlow calls
    }
  }

  // -------------------------------------------------------------------------
  // EDGE-10: Resolution flash — cool blue-white glow when triggered
  // -------------------------------------------------------------------------
  if (animState.resolutionFlashIntensity > 0.01) {
    drawGlow(ctx, animState.resolutionGlowCanvas, midX, midY, animState.resolutionFlashIntensity);
    animState.resolutionFlashIntensity = lerpExp(animState.resolutionFlashIntensity, 0, 0.08, deltaMs);
    if (animState.resolutionFlashIntensity < 0.02) animState.resolutionFlashIntensity = 0;
  }

  // -------------------------------------------------------------------------
  // EDGE-06: Floating label above midpoint
  // -------------------------------------------------------------------------
  const label = getPocketLabel(pocketScore);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(label, midX, midY - 14);
  ctx.restore();
}
