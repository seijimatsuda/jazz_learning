/**
 * TensionMeter.ts — Vertical gradient tension meter with ghost line.
 *
 * Renders a vertical bar that fills from bottom to top proportional to
 * currentTension (0.0–1.0). Color shifts from cool blue at low tension
 * through amber/orange to red at maximum tension.
 *
 * Performance constraints:
 * - Canvas gradient is created ONCE at init / resize — NEVER inside render()
 * - Off-DOM HTMLCanvasElement used for gradient fill (iOS compatible, no OffscreenCanvas)
 * - No new objects or typed arrays allocated per frame
 *
 * Implements TENS-04 (gradient bar) and TENS-05 (ghost line).
 */

// ---------------------------------------------------------------------------
// Gradient color stops (blue→amber→orange→red, bottom to top)
// ---------------------------------------------------------------------------

const GRADIENT_STOPS: [number, string][] = [
  [0.0,  '#3b82f6'],  // blue   — tonic / low tension
  [0.35, '#f59e0b'],  // amber  — subdominant
  [0.65, '#f97316'],  // orange — dominant
  [1.0,  '#ef4444'],  // red    — altered / max tension
];

// ---------------------------------------------------------------------------
// TensionMeter class
// ---------------------------------------------------------------------------

export class TensionMeter {
  /** Off-DOM canvas used to build the gradient fill — iOS OffscreenCanvas-free */
  private readonly gradientCanvas: HTMLCanvasElement;
  private readonly gradientCtx: CanvasRenderingContext2D;

  /** Last known height, used to detect resize need */
  private cachedHeight: number;

  constructor(initialHeight: number) {
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCanvas.width = 1;   // 1px wide — we only need vertical gradient
    this.gradientCanvas.height = Math.max(1, Math.round(initialHeight));

    const ctx = this.gradientCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('[TensionMeter] Could not get 2d context from gradient canvas.');
    }
    this.gradientCtx = ctx;
    this.cachedHeight = this.gradientCanvas.height;

    // Build gradient once on construction
    this.buildGradient(this.cachedHeight);
  }

  // -------------------------------------------------------------------------
  // resize: Rebuild gradient when height changes.
  // Call from CanvasRenderer.resize().
  // -------------------------------------------------------------------------

  resize(newHeight: number): void {
    const h = Math.max(1, Math.round(newHeight));
    if (h === this.cachedHeight) return;

    this.gradientCanvas.height = h;
    this.cachedHeight = h;
    this.buildGradient(h);
  }

  // -------------------------------------------------------------------------
  // render: Draw tension bar onto the provided context.
  //
  // Parameters:
  //   ctx            — main canvas 2D context (HiDPI-scaled, logical coords)
  //   x              — left edge of the meter rectangle (logical px)
  //   y              — top edge of the meter (logical px)
  //   height         — full meter height (logical px)
  //   currentTension — 0.0–1.0, filled portion (bottom to top)
  //   ghostTension   — 0.0–1.0, position of the ghost line
  //
  // CRITICAL: No createLinearGradient or canvas creation inside this function.
  // -------------------------------------------------------------------------

  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    width: number,
    currentTension: number,
    ghostTension: number,
  ): void {
    // -- Rebuild gradient if height changed (e.g. on resize between calls) ---
    const h = Math.round(height);
    if (h !== this.cachedHeight) {
      this.resize(h);
    }

    // -- 1. Dark background with subtle border --------------------------------
    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // -- 2. Filled tension portion (bottom to top) ----------------------------
    // currentTension=1.0 → full bar; currentTension=0.0 → empty
    const filledH = Math.max(0, Math.min(1, currentTension)) * height;
    const filledY = y + height - filledH;

    if (filledH > 0) {
      // Draw gradient fill from the pre-built gradient canvas via drawImage.
      // We source a vertical slice of the gradient canvas proportional to
      // which portion is filled — this avoids re-creating any gradient.
      //
      // Gradient canvas is (1 × cachedHeight) where y=0 is top (red) and
      // y=cachedHeight is bottom (blue). We want to display the TOP portion
      // of the gradient for the filled region (high tension = top = red).
      //
      // Source slice: from (0, 0) to (1, filledH) of gradientCanvas
      // Dest:         (x, filledY) to (x+width, y+height) on main canvas
      ctx.drawImage(
        this.gradientCanvas,
        0, 0, 1, Math.round(filledH),   // source: top portion of gradient
        x, filledY, width, filledH,      // dest: bottom of meter rect
      );
    }

    // -- 3. Ghost line (white, 0.5 opacity) -----------------------------------
    const ghost = Math.max(0, Math.min(1, ghostTension));
    if (ghost > 0) {
      const ghostY = y + height - ghost * height;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 2, ghostY);
      ctx.lineTo(x + width + 2, ghostY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // -- 4. Current level indicator (bright white line) -----------------------
    const levelY = y + height - currentTension * height;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, levelY);
    ctx.lineTo(x + width, levelY);
    ctx.stroke();

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Private: Build a vertical linear gradient on the gradient canvas.
  // Top (y=0) = red (high tension), Bottom (y=h) = blue (low tension).
  // -------------------------------------------------------------------------

  private buildGradient(h: number): CanvasGradient {
    // Resize the gradient canvas to match new height
    this.gradientCanvas.height = h;

    // createLinearGradient from top (y=0) to bottom (y=h)
    const grad = this.gradientCtx.createLinearGradient(0, 0, 0, h);

    // Stops are defined bottom→top in the spec, but linear gradient goes top→bottom.
    // Invert: stop at position p corresponds to (1.0 - p) from top.
    for (const [stop, color] of GRADIENT_STOPS) {
      grad.addColorStop(1.0 - stop, color);
    }

    // Fill the canvas with the gradient so drawImage can sample it
    this.gradientCtx.fillStyle = grad;
    this.gradientCtx.fillRect(0, 0, 1, h);

    return grad;
  }
}
