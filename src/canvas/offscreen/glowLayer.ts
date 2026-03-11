/**
 * glowLayer.ts — Offscreen glow pre-rendering.
 *
 * Creates an off-DOM HTMLCanvasElement (NOT OffscreenCanvas — iOS 16 compat)
 * with a radial gradient that fades from the given color at the center to
 * transparent at the edge.  This canvas is rendered once and then reused via
 * ctx.drawImage() in the rAF loop — no shadowBlur required.
 *
 * Performance notes:
 * - Created once per color/radius combo, cached by caller.
 * - drawImage is GPU-composited; far cheaper than recomputing shadowBlur each frame.
 * - Canvas size = radius * 4 so the full gradient has room to fade out.
 */

/**
 * Creates and returns an off-DOM canvas containing a radial gradient glow.
 *
 * @param radius - The "hot spot" radius in CSS pixels. Canvas will be radius*4 square.
 * @param color  - CSS color string for the center of the glow (e.g. '#818cf8' or 'rgba(129,140,248,1)')
 * @returns       HTMLCanvasElement with the gradient painted, ready for ctx.drawImage
 */
export function createGlowLayer(radius: number, color: string): HTMLCanvasElement {
  const size = radius * 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('[glowLayer] Could not get 2d context for offscreen glow canvas');
    return canvas;
  }

  const cx = size / 2;
  const cy = size / 2;

  // Radial gradient: full color at center → transparent at outer edge
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}
