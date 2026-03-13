/**
 * drawNode.ts — Role-based node rendering for instrument nodes.
 *
 * Exports:
 *   - ROLE_BASE_RADIUS  — target radius per role (used by CanvasRenderer to set animState.baseRadius)
 *   - ROLE_FILL_COLOR   — fill color per role
 *   - getRoleRadius     — convenience getter
 *   - getRoleFillColor  — convenience getter
 *   - drawNode          — draws a filled circle + label at given position/radius/color
 *
 * Design: drawNode intentionally has no ctx.save()/restore() for the basic
 * fill path — callers that need isolation (glow compositing, globalAlpha) wrap
 * it themselves. The label uses explicit property resets after the fill so the
 * ctx state is predictable after return.
 *
 * VIZ-02: dark background with labeled nodes
 * VIZ-12: role-based visual states (soloing > comping > holding > silent)
 */

import type { RoleLabel } from '../../audio/types';

// ---------------------------------------------------------------------------
// Role constants
// ---------------------------------------------------------------------------

/**
 * Target radius (CSS pixels) for each role.
 * CanvasRenderer sets animState.baseRadius = ROLE_BASE_RADIUS[role] and
 * lerpExp currentRadius toward it each frame for smooth transitions.
 *
 * VIZ-12: soloing nodes are visibly larger than silent nodes.
 */
export const ROLE_BASE_RADIUS: Record<RoleLabel, number> = {
  soloing: 52,
  comping: 36,
  holding: 28,
  silent:  18,
};

/**
 * Fill color for each role.
 * Colors chosen for perceptual brightness order: soloing (amber) > comping (teal)
 * > holding (slate) > silent (near-black slate).
 *
 * VIZ-12: soloing nodes are brighter than silent nodes.
 */
export const ROLE_FILL_COLOR: Record<RoleLabel, string> = {
  soloing: '#f59e0b', // amber-400
  comping: '#0d9488', // teal-600
  holding: '#64748b', // slate-500
  silent:  '#1e293b', // slate-800
};

// ---------------------------------------------------------------------------
// Convenience getters
// ---------------------------------------------------------------------------

/**
 * Returns the base radius in CSS pixels for the given role.
 * Wraps ROLE_BASE_RADIUS for callers that prefer a function API.
 */
export function getRoleRadius(role: RoleLabel): number {
  return ROLE_BASE_RADIUS[role];
}

/**
 * Returns the CSS color string for the given role.
 * Wraps ROLE_FILL_COLOR for callers that prefer a function API.
 */
export function getRoleFillColor(role: RoleLabel): string {
  return ROLE_FILL_COLOR[role];
}

// ---------------------------------------------------------------------------
// drawNode
// ---------------------------------------------------------------------------

/**
 * Draws a filled circle, optional family ring stroke, and instrument label.
 *
 * @param ctx       - Canvas 2D rendering context
 * @param x         - Absolute pixel X of node center
 * @param y         - Absolute pixel Y of node center
 * @param radius    - Current rendered radius (from animState.currentRadius — includes nudge/pulse)
 * @param fillColor - Fill color string (from getRoleFillColor or animation override)
 * @param label     - Instrument name to display below the node (already capitalized by caller)
 * @param ringColor - Optional family ring color (VIS-01). When provided, draws a 3px stroke
 *                    ring at radius+1.5 OUTSIDE the fill circle. Inherits ctx.globalAlpha so
 *                    Phase 12 confidence dimming applies equally to ring and fill.
 */
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fillColor: string,
  label: string,
  ringColor?: string,
): void {
  // -- Filled circle ---------------------------------------------------------
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // -- Family ring stroke (VIS-01) -------------------------------------------
  // Drawn OUTSIDE the fill circle at radius+1.5 so it never overlaps the fill.
  // ctx.save/restore isolates lineWidth changes so subsequent edge draws are unaffected.
  if (ringColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // -- Label below circle ----------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + radius + 6);
}
