/**
 * drawGlow.ts — Bass node glow compositing with pocket-score color interpolation.
 *
 * Exports:
 *   - AMBER_RGB     — pre-parsed amber color constants for zero-alloc lerp
 *   - BLUE_RGB      — pre-parsed blue color constants for zero-alloc lerp
 *   - pocketToGlowColor — maps pocket score [0,1] to rgb() string (amber=high, blue=low)
 *   - drawGlow      — composites offscreen glow canvas onto main ctx using 'lighter' blend
 *
 * Design:
 * - RGB constants are pre-parsed at module load — no per-frame string parsing
 * - pocketToGlowColor uses lerp from NodeAnimState (no new import from Tailwind/CSS)
 * - drawGlow uses globalCompositeOperation='lighter' for additive glow blending
 *   which brightens the underlying node without requiring shadowBlur
 * - Caller is responsible for gating glowCanvas re-creation by pocketScore threshold
 *   (see CanvasRenderer.ts — lastPocketScore gate) to avoid per-frame allocations
 *
 * VIZ-03: Bass node amber breathing glow
 * VIZ-04: Onset flash with additive intensity
 * VIZ-05: Pocket-score-driven color shift amber → blue
 */

import { lerp } from './NodeAnimState';

// ---------------------------------------------------------------------------
// Color constants (pre-parsed RGB for zero-alloc channel interpolation)
// ---------------------------------------------------------------------------

/**
 * Amber color for high pocket score glow.
 * Matches Tailwind amber-700 (#b45309).
 */
export const AMBER_RGB = { r: 0xb4, g: 0x53, b: 0x09 } as const;

/**
 * Blue color for low pocket score glow.
 * Matches Tailwind blue-800 (#1e40af).
 */
export const BLUE_RGB = { r: 0x1e, g: 0x40, b: 0xaf } as const;

// ---------------------------------------------------------------------------
// pocketToGlowColor
// ---------------------------------------------------------------------------

/**
 * Converts a pocket score in [0,1] to a CSS rgb() color string.
 *
 * Mapping:
 *   pocketScore = 1.0 → AMBER_RGB (hot pocket, bass in the groove)
 *   pocketScore = 0.0 → BLUE_RGB  (out of pocket, bass loose)
 *
 * Uses pre-parsed RGB constants and channel-wise lerp for zero string parsing.
 *
 * @param pocketScore - Value in [0,1]; clamped internally
 * @returns CSS rgb() string suitable for createGlowLayer color parameter
 */
export function pocketToGlowColor(pocketScore: number): string {
  const t = Math.max(0, Math.min(1, pocketScore));
  const r = Math.round(lerp(BLUE_RGB.r, AMBER_RGB.r, t));
  const g = Math.round(lerp(BLUE_RGB.g, AMBER_RGB.g, t));
  const b = Math.round(lerp(BLUE_RGB.b, AMBER_RGB.b, t));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// drawGlow
// ---------------------------------------------------------------------------

/**
 * Composites a pre-rendered offscreen glow canvas onto the main context.
 *
 * Uses globalCompositeOperation='lighter' (additive blending) so overlapping
 * glows brighten rather than occlude each other. This is the correct operation
 * for light-source glow effects on a dark background.
 *
 * The glow canvas must have been created by createGlowLayer(baseRadius * 2, color).
 * Its size = radius * 4 (two-argument call convention from glowLayer.ts).
 * This function reads glowCanvas.width as the full compositing size.
 *
 * @param ctx        - Main canvas 2D rendering context
 * @param glowCanvas - Offscreen canvas with pre-rendered radial gradient
 * @param cx         - Center X of the node in logical canvas pixels
 * @param cy         - Center Y of the node in logical canvas pixels
 * @param intensity  - Alpha multiplier [0,1]; returns early if <= 0
 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  glowCanvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  intensity: number,
): void {
  if (intensity <= 0) return;

  // glowCanvas.width = radius * 4 (from createGlowLayer convention)
  const size = glowCanvas.width;

  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowCanvas, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}
