/**
 * drawCommunicationEdges.ts — Communication edge rendering for all non-pocket pairs.
 *
 * Implements EDGE-07, EDGE-08, EDGE-09, EDGE-10:
 *   EDGE-07: Communication edges appear/fade based on cross-correlation weight
 *   EDGE-08: Edge color encodes relationship type (rhythmic/melodic/support)
 *   EDGE-09: Tension tinting — base color shifts amber/red at high tension
 *   EDGE-10: Resolution flash — cool blue-white glow when tension drops below 0.3
 *
 * Covers all non-pocket instrument pairs for any lineup (2-8 instruments).
 * bass_drums is handled by drawPocketLine — Plan 01.
 *
 * Visual states driven by smoothed cross-correlation weight:
 *   < 0.3          = hidden        (opacity fades to 0, no stroke)
 *   0.3 - 0.4      = static_thin   (lineWidth 1.5, opacity 0.4)
 *   0.4 - 0.7      = subtle        (lineWidth 3,   opacity 0.65)
 *   >= 0.7         = animated      (lineWidth 5,   opacity 0.9, flowing dashes)
 *
 * Performance constraints:
 * - NO per-frame allocations
 * - Always ctx.save()/ctx.restore() for lineDash isolation (iOS Safari)
 * - Pairs are passed as a parameter (computed by CanvasRenderer from lineup)
 * - Endpoint termination at node circumference via normalized direction vector
 */

import { lerpExp } from '../nodes/NodeAnimState';
import { drawGlow } from '../nodes/drawGlow';
import type { EdgeAnimState } from './EdgeAnimState';
import { EDGE_TYPE, EDGE_COLOR, getTintedColor } from './edgeTypes';
import type { NodePosition, PairTuple } from '../nodes/NodeLayout';

// ---------------------------------------------------------------------------
// Visual state type
// ---------------------------------------------------------------------------

type VisualState = 'hidden' | 'static_thin' | 'subtle' | 'animated';

// ---------------------------------------------------------------------------
// drawCommunicationEdges — EDGE-07, EDGE-08
// ---------------------------------------------------------------------------

/**
 * Draws all non-pocket communication edges with weight-driven visual states.
 *
 * Edges appear/fade dynamically based on cross-correlation weight.
 * Thickness, opacity, and animation state all driven by weight value.
 * Edge color encodes relationship type (rhythmic/melodic/support).
 *
 * All edges render behind instrument nodes — caller must invoke this before
 * the node drawing loop.
 *
 * @param ctx             - Main canvas 2D rendering context
 * @param nodePositions   - Fractional [0,1] positions per instrument (indexed by lineup)
 * @param nodeRadii       - Current rendered radii per instrument (CSS pixels)
 * @param pairs           - Non-pocket pair tuples [idxA, idxB, key] from buildPairs()
 * @param edgeAnimStates  - Mutable per-edge animation state keyed by pair string
 * @param edgeWeights     - Cross-correlation weights keyed by 'instrA_instrB' (alphabetical)
 * @param canvasW         - Logical canvas width in CSS pixels
 * @param canvasH         - Logical canvas height in CSS pixels
 * @param currentTension  - Current harmonic tension [0,1] for EDGE-09/10
 * @param deltaMs         - Elapsed ms since last frame (capped at 100ms by caller)
 */
export function drawCommunicationEdges(
  ctx: CanvasRenderingContext2D,
  nodePositions: NodePosition[],
  nodeRadii: number[],
  pairs: PairTuple[],
  edgeAnimStates: Record<string, EdgeAnimState>,
  edgeWeights: Record<string, number>,
  canvasW: number,
  canvasH: number,
  currentTension: number,
  deltaMs: number,
): void {
  for (const [idxA, idxB, key] of pairs) {
    const animState = edgeAnimStates[key];
    if (!animState) continue;

    // -----------------------------------------------------------------------
    // Step 1: Read raw weight and smooth it
    // -----------------------------------------------------------------------
    const rawWeight = edgeWeights[key] ?? 0;
    animState.currentWeight = lerpExp(animState.currentWeight, rawWeight, 0.12, deltaMs);
    const w = animState.currentWeight;

    // -----------------------------------------------------------------------
    // Step 2: Determine visual state and target values
    // -----------------------------------------------------------------------
    let visualState: VisualState;
    let targetOpacity: number;
    let lineWidth: number;

    if (w < 0.3) {
      visualState = 'hidden';
      targetOpacity = 0;
      lineWidth = 1.5; // unused but avoids uninitialized variable
    } else if (w < 0.4) {
      visualState = 'static_thin';
      targetOpacity = 0.4;
      lineWidth = 1.5;
    } else if (w < 0.7) {
      visualState = 'subtle';
      targetOpacity = 0.65;
      lineWidth = 3;
    } else {
      visualState = 'animated';
      targetOpacity = 0.9;
      lineWidth = 5;
    }

    // -----------------------------------------------------------------------
    // Step 3: Smooth opacity toward target
    // -----------------------------------------------------------------------
    animState.currentOpacity = lerpExp(animState.currentOpacity, targetOpacity, 0.1, deltaMs);

    // -----------------------------------------------------------------------
    // Step 4: Early exit if invisible — no stroke needed
    // -----------------------------------------------------------------------
    if (animState.currentOpacity < 0.01) continue;

    // -----------------------------------------------------------------------
    // Step 5: Compute pixel coordinates and direction vector
    // -----------------------------------------------------------------------
    const posA = nodePositions[idxA];
    const posB = nodePositions[idxB];
    const xA = posA.x * canvasW;
    const yA = posA.y * canvasH;
    const xB = posB.x * canvasW;
    const yB = posB.y * canvasH;

    const dx = xB - xA;
    const dy = yB - yA;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Guard: nodes coincident — nothing to draw
    if (dist < 1) continue;

    const nx = dx / dist;
    const ny = dy / dist;

    // Terminate at each node's circumference — same pattern as drawPocketLine
    const startX = xA + nx * nodeRadii[idxA];
    const startY = yA + ny * nodeRadii[idxA];
    const endX   = xB - nx * nodeRadii[idxB];
    const endY   = yB - ny * nodeRadii[idxB];

    // -----------------------------------------------------------------------
    // Step 6: Determine base color from edge type
    // -----------------------------------------------------------------------
    const edgeType = EDGE_TYPE[key];
    const baseColor = EDGE_COLOR[edgeType];

    // -----------------------------------------------------------------------
    // Step 6b: Tension tinting (EDGE-09) — smooth tintFactor and lerp color
    // -----------------------------------------------------------------------
    const targetTint = currentTension > 0.6 ? (currentTension - 0.6) / 0.4 : 0;
    animState.tintFactor = lerpExp(animState.tintFactor, targetTint, 0.1, deltaMs);

    const colorString = animState.tintFactor > 0.01
      ? getTintedColor(baseColor.r, baseColor.g, baseColor.b, animState.tintFactor, currentTension)
      : `rgb(${baseColor.r},${baseColor.g},${baseColor.b})`;

    // -----------------------------------------------------------------------
    // Step 7: Draw with ctx.save()/ctx.restore() for lineDash isolation
    // -----------------------------------------------------------------------
    ctx.save();
    ctx.globalAlpha = animState.currentOpacity;
    ctx.strokeStyle = colorString;
    ctx.lineWidth = lineWidth;

    if (visualState === 'animated') {
      // Flowing dashes — slightly slower than pocket line (0.04 vs 0.06)
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -animState.dashOffset;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Advance dash offset for flowing animation
      animState.dashOffset = (animState.dashOffset + deltaMs * 0.04) % 20;
    } else {
      // Static or subtle — plain solid line
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    ctx.restore();

    // -----------------------------------------------------------------------
    // Step 8: Resolution flash (EDGE-10) — cool blue-white glow at midpoint
    // -----------------------------------------------------------------------
    if (animState.resolutionFlashIntensity > 0.01) {
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      drawGlow(ctx, animState.resolutionGlowCanvas, midX, midY, animState.resolutionFlashIntensity);
      animState.resolutionFlashIntensity = lerpExp(animState.resolutionFlashIntensity, 0, 0.08, deltaMs);
      if (animState.resolutionFlashIntensity < 0.02) animState.resolutionFlashIntensity = 0;
    }

    // -----------------------------------------------------------------------
    // Step 9: Call-response purple flash (MEL-04) — purple glow at midpoint
    //         Only active on guitar_keyboard edge; decayed by CanvasRenderer
    // -----------------------------------------------------------------------
    if (animState.callResponseFlashIntensity > 0.01) {
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      // Draw purple glow with scaled alpha — full intensity at 0.8 globalAlpha
      const savedAlpha = ctx.globalAlpha;
      ctx.globalAlpha = animState.callResponseFlashIntensity * 0.8;
      drawGlow(ctx, animState.callResponseGlowCanvas, midX, midY, 1.0);
      ctx.globalAlpha = savedAlpha;
    }
  }
}
