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
 *   < threshold       = hidden        (opacity fades to 0, no stroke)
 *   threshold - 0.4   = static_thin   (lineWidth 1.5, opacity 0.4)
 *   0.4 - 0.7         = subtle        (lineWidth 3,   opacity 0.65)
 *   >= 0.7            = animated      (lineWidth 5,   opacity 0.9, flowing dashes)
 *
 * CANV-03: Non-animated edges batch-rendered without per-edge save/restore.
 *   All static_thin + subtle edges share a single ctx pass — opacity encoded
 *   directly in rgba() strokeStyle, avoiding per-edge globalAlpha changes.
 *   Animated (dashed) edges still use ctx.save()/ctx.restore() for setLineDash
 *   isolation (required on iOS Safari).
 *
 * CANV-04: Dynamic hide threshold — 0.30 for 2-5 instruments, 0.45 for 6-8.
 *   At 8 instruments there are 28 edges (C(8,2)). Raising the threshold above
 *   5 instruments keeps the graph readable by hiding weak connections.
 *
 * Performance constraints:
 * - Module-level pre-allocated buffer — zero per-frame allocations
 * - Non-animated edges: single pass, no save/restore per edge
 * - Animated edges: isolated with save/restore for setLineDash (iOS Safari)
 * - Pairs are passed as a parameter (computed by CanvasRenderer from lineup)
 * - Endpoint termination at node circumference via normalized direction vector
 */

import { lerp, lerpExp } from '../nodes/NodeAnimState';
import { drawGlow } from '../nodes/drawGlow';
import type { EdgeAnimState } from './EdgeAnimState';
import { EDGE_TYPE, EDGE_COLOR, TENSION_RED_RGB, TENSION_AMBER_RGB } from './edgeTypes';
import type { EdgeType } from './edgeTypes';
import type { NodePosition, PairTuple } from '../nodes/NodeLayout';

// ---------------------------------------------------------------------------
// Visual state type
// ---------------------------------------------------------------------------

type VisualState = 'hidden' | 'static_thin' | 'subtle' | 'animated';

// ---------------------------------------------------------------------------
// Module-level pre-allocated render buffer — avoids per-frame allocation
// Max 28 edges for C(8,2) — full 8-instrument lineup
// ---------------------------------------------------------------------------

interface EdgeRenderData {
  startX: number; startY: number;
  endX: number; endY: number;
  colorR: number; colorG: number; colorB: number;
  opacity: number;
  lineWidth: number;
  visualState: VisualState;
  dashOffset: number;
  animState: EdgeAnimState;
  midX: number; midY: number;
  edgeType: EdgeType;
}

const edgeRenderBuf: EdgeRenderData[] = [];
for (let i = 0; i < 28; i++) {
  edgeRenderBuf.push({
    startX: 0, startY: 0, endX: 0, endY: 0,
    colorR: 0, colorG: 0, colorB: 0,
    opacity: 0, lineWidth: 0,
    visualState: 'hidden' as VisualState,
    dashOffset: 0,
    animState: null!,
    midX: 0, midY: 0,
    edgeType: 'support' as EdgeType,
  });
}
let edgeRenderCount = 0;

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
 * CANV-03: Non-animated edges (static_thin + subtle) rendered in a single pass
 * without per-edge ctx.save()/ctx.restore(). Opacity encoded in rgba() color string.
 *
 * CANV-04: Dynamic hide threshold — 0.30 for ≤5 instruments, 0.45 for >5.
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
 * @param instrumentCount    - Number of instruments in lineup (used for CANV-04 threshold)
 * @param beatPulseIntensity - Normalized beat pulse strength [0,1] (this.beatPulse/4 from CanvasRenderer)
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
  instrumentCount: number,   // lineup.length from CanvasRenderer
  beatPulseIntensity: number, // VIS-03: [0,1] normalized beat pulse for rhythmic edge boost
): void {
  // CANV-04: raise hide threshold when instrument count > 5 to keep graph readable
  const hideThreshold = instrumentCount > 5 ? 0.45 : 0.30;

  // ---------------------------------------------------------------------------
  // Pass 1 — Collect: compute state for all pairs, write into edgeRenderBuf
  // ---------------------------------------------------------------------------
  edgeRenderCount = 0;

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

    if (w < hideThreshold) {
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
    const midX   = (startX + endX) / 2;
    const midY   = (startY + endY) / 2;

    // -----------------------------------------------------------------------
    // Step 6: Determine base color from edge type
    // -----------------------------------------------------------------------
    const edgeType: EdgeType = EDGE_TYPE[key] ?? 'support';
    const baseColor = EDGE_COLOR[edgeType];

    // -----------------------------------------------------------------------
    // Step 6b: Tension tinting (EDGE-09) — smooth tintFactor and lerp color
    // -----------------------------------------------------------------------
    const targetTint = currentTension > 0.6 ? (currentTension - 0.6) / 0.4 : 0;
    animState.tintFactor = lerpExp(animState.tintFactor, targetTint, 0.1, deltaMs);

    let r = baseColor.r, g = baseColor.g, b = baseColor.b;
    if (animState.tintFactor > 0.01) {
      const target = currentTension > 0.8 ? TENSION_RED_RGB : TENSION_AMBER_RGB;
      r = Math.round(lerp(r, target.r, animState.tintFactor));
      g = Math.round(lerp(g, target.g, animState.tintFactor));
      b = Math.round(lerp(b, target.b, animState.tintFactor));
    }

    // -----------------------------------------------------------------------
    // Step 7: Write into pre-allocated render buffer
    // -----------------------------------------------------------------------
    const slot = edgeRenderBuf[edgeRenderCount];
    slot.startX = startX;
    slot.startY = startY;
    slot.endX = endX;
    slot.endY = endY;
    slot.midX = midX;
    slot.midY = midY;
    slot.colorR = r;
    slot.colorG = g;
    slot.colorB = b;
    slot.opacity = animState.currentOpacity;
    slot.lineWidth = lineWidth;
    slot.visualState = visualState;
    slot.dashOffset = animState.dashOffset;
    slot.animState = animState;
    slot.edgeType = edgeType;
    edgeRenderCount++;
  }

  // ---------------------------------------------------------------------------
  // Pass 2 — Draw non-animated edges (no save/restore per edge)
  // CANV-03: single ctx.setLineDash([]) for entire batch
  // Opacity encoded in rgba() — no per-edge globalAlpha changes
  // ---------------------------------------------------------------------------
  ctx.setLineDash([]);  // clear once for entire non-animated pass
  for (let i = 0; i < edgeRenderCount; i++) {
    const e = edgeRenderBuf[i];
    if (e.visualState === 'animated' || e.visualState === 'hidden') continue;
    // Encode opacity directly in rgba — no globalAlpha needed
    ctx.strokeStyle = `rgba(${e.colorR},${e.colorG},${e.colorB},${e.opacity})`;
    ctx.lineWidth = e.lineWidth;
    ctx.beginPath();
    ctx.moveTo(e.startX, e.startY);
    ctx.lineTo(e.endX, e.endY);
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Pass 3 — Draw animated edges (VIS-03: per-type animation branches)
  // save/restore required per edge for setLineDash isolation on iOS Safari
  // ---------------------------------------------------------------------------
  for (let i = 0; i < edgeRenderCount; i++) {
    const e = edgeRenderBuf[i];
    if (e.visualState !== 'animated') continue;

    // VIS-03: Rhythmic — opacity and lineWidth boost proportional to beatPulse
    if (e.edgeType === 'rhythmic') {
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, e.opacity + beatPulseIntensity * 0.3);
      ctx.strokeStyle = `rgb(${e.colorR},${e.colorG},${e.colorB})`;
      ctx.lineWidth = e.lineWidth + beatPulseIntensity * 2;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -e.dashOffset;
      ctx.beginPath();
      ctx.moveTo(e.startX, e.startY);
      ctx.lineTo(e.endX, e.endY);
      ctx.stroke();
      ctx.restore();
    }

    // VIS-03: Melodic — inline gradient with flowing midpoint stop
    if (e.edgeType === 'melodic') {
      ctx.save();
      // Gradient acceptable at <=3 animated melodic edges per frame (VIS-03 comment)
      const grad = ctx.createLinearGradient(e.startX, e.startY, e.endX, e.endY);
      const midStop = 0.3 + (e.dashOffset / 20) % 0.4;
      grad.addColorStop(0, `rgba(${e.colorR},${e.colorG},${e.colorB},0)`);
      grad.addColorStop(midStop, `rgba(${e.colorR},${e.colorG},${e.colorB},${e.opacity})`);
      grad.addColorStop(1, `rgba(${e.colorR},${e.colorG},${e.colorB},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = e.lineWidth;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -e.dashOffset;
      ctx.beginPath();
      ctx.moveTo(e.startX, e.startY);
      ctx.lineTo(e.endX, e.endY);
      ctx.stroke();
      ctx.restore();
    }

    // VIS-03: Support — slow sine-wave opacity breathing independent of BPM
    if (e.edgeType === 'support') {
      e.animState.supportBreathePhase = (e.animState.supportBreathePhase + deltaMs * 0.0025) % (Math.PI * 2);
      const breatheOpacity = 0.5 + ((Math.sin(e.animState.supportBreathePhase) + 1) / 2) * 0.4;
      ctx.save();
      ctx.globalAlpha = breatheOpacity;
      ctx.strokeStyle = `rgb(${e.colorR},${e.colorG},${e.colorB})`;
      ctx.lineWidth = e.lineWidth;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -e.dashOffset;
      ctx.beginPath();
      ctx.moveTo(e.startX, e.startY);
      ctx.lineTo(e.endX, e.endY);
      ctx.stroke();
      ctx.restore();
    }

    // Advance dash offset for flowing animation (slightly slower than pocket line)
    e.animState.dashOffset = (e.animState.dashOffset + deltaMs * 0.04) % 20;
  }

  // ---------------------------------------------------------------------------
  // Pass 4 — Flash / glow effects (EDGE-10, MEL-04)
  // Resolution flash and call-response flash drawn at edge midpoints
  // ---------------------------------------------------------------------------
  for (let i = 0; i < edgeRenderCount; i++) {
    const e = edgeRenderBuf[i];
    const animState = e.animState;

    // Step 8: Resolution flash (EDGE-10) — cool blue-white glow at midpoint
    if (animState.resolutionFlashIntensity > 0.01) {
      drawGlow(ctx, animState.resolutionGlowCanvas, e.midX, e.midY, animState.resolutionFlashIntensity);
      animState.resolutionFlashIntensity = lerpExp(animState.resolutionFlashIntensity, 0, 0.08, deltaMs);
      if (animState.resolutionFlashIntensity < 0.02) animState.resolutionFlashIntensity = 0;
    }

    // Step 9: Call-response purple flash (MEL-04) — purple glow at midpoint
    //         Only active on guitar_keyboard edge; decayed by CanvasRenderer
    if (animState.callResponseFlashIntensity > 0.01) {
      const savedAlpha = ctx.globalAlpha;
      ctx.globalAlpha = animState.callResponseFlashIntensity * 0.8;
      drawGlow(ctx, animState.callResponseGlowCanvas, e.midX, e.midY, 1.0);
      ctx.globalAlpha = savedAlpha;
    }
  }
}
