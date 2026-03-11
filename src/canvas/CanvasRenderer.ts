/**
 * CanvasRenderer.ts — rAF loop, HiDPI setup, and basic node rendering.
 *
 * Performance constraints:
 * - NO shadowBlur anywhere — use offscreen glow via createGlowLayer + drawImage
 * - NO per-frame typed array allocations (new Uint8Array / new Float32Array)
 *   inside the rAF callback — all arrays are pre-allocated externally (AudioEngine)
 * - setupHiDPI() must be called once and again on every resize
 * - smoothedFreqData is read directly from audioStateRef — zero copying
 */

import type { MutableRefObject } from 'react';
import type { AudioStateRef, RoleLabel } from '../audio/types';
import { getBandEnergy } from '../audio/FrequencyBandSplitter';
import { createGlowLayer } from './offscreen/glowLayer';
import { runAnalysisTick } from '../audio/AnalysisTick';
import { TensionMeter } from './TensionMeter';
import { getGhostTension } from '../audio/TensionScorer';

type ChordChangeCallback = (
  chord: string,
  confidence: 'low' | 'medium' | 'high',
  fn: string,
  tension: number
) => void;

// ---------------------------------------------------------------------------
// Node layout — six circles, one per frequency band, arranged in an arc
// ---------------------------------------------------------------------------

interface NodeConfig {
  label: string;
  bandName: string;
  x: number;  // fractional [0,1] of logical canvas width
  y: number;  // fractional [0,1] of logical canvas height
  color: string;
}

const NODE_CONFIGS: NodeConfig[] = [
  { label: 'Bass',       bandName: 'bass',       x: 0.10, y: 0.55, color: '#f472b6' },
  { label: 'Drums L',   bandName: 'drums_low',  x: 0.25, y: 0.70, color: '#fb923c' },
  { label: 'Mid',        bandName: 'mid',        x: 0.42, y: 0.75, color: '#4ade80' },
  { label: 'Mid High',   bandName: 'mid_high',   x: 0.58, y: 0.75, color: '#60a5fa' },
  { label: 'Drums H',   bandName: 'drums_high', x: 0.75, y: 0.70, color: '#a78bfa' },
  { label: 'Ride',       bandName: 'ride',       x: 0.90, y: 0.55, color: '#34d399' },
];

const MIN_RADIUS = 20;
const MAX_RADIUS = 60;
const GLOW_COLOR_DEFAULT = 'rgba(129,140,248,0.6)';

// ---------------------------------------------------------------------------
// CanvasRenderer class
// ---------------------------------------------------------------------------

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly audioStateRef: MutableRefObject<AudioStateRef>;

  /** Logical canvas dimensions (before DPR scaling) */
  private logicalWidth = 0;
  private logicalHeight = 0;

  /** Cached glow layer — created once, reused every frame */
  private glowCanvas: HTMLCanvasElement;

  /** Tension meter — gradient created once, reused every frame */
  private readonly tensionMeter: TensionMeter;

  /** rAF handle — stored so we can cancel on destroy */
  private rafHandle = 0;

  /** Optional callback fired when an instrument's role label changes */
  private onRoleChange?: (instrument: string, role: RoleLabel) => void;

  /** Optional callback fired when the displayed chord changes (Phase 3) */
  private onChordChange?: ChordChangeCallback;

  /** Bind render to this for rAF callback */
  private readonly boundRender: () => void;

  constructor(canvas: HTMLCanvasElement, audioStateRef: MutableRefObject<AudioStateRef>) {
    this.canvas = canvas;
    this.audioStateRef = audioStateRef;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[CanvasRenderer] Could not get 2d context from canvas element.');
    }
    this.ctx = ctx;

    // Pre-create a default glow layer (radius=40).  The exact radius doesn't
    // matter much for the placeholder — Phase 2 will bind it to energy levels.
    this.glowCanvas = createGlowLayer(40, GLOW_COLOR_DEFAULT);

    // Pre-create tension meter — gradient built once, reused every frame (TENS-04)
    // Use 360 as default height; resize() corrects this after layout settles.
    this.tensionMeter = new TensionMeter(360);

    this.boundRender = this.render.bind(this);

    // HiDPI + start loop
    this.setupHiDPI();
    this.rafHandle = requestAnimationFrame(this.boundRender);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Call on every ResizeObserver callback to keep canvas sized correctly.
   * Reads the element's current CSS size via getBoundingClientRect.
   */
  resize(): void {
    this.setupHiDPI();
    // Rebuild tension meter gradient at the new canvas height
    this.tensionMeter.resize(this.logicalHeight - 40);
  }

  /**
   * Wires a callback that fires when any instrument's role label changes.
   *
   * Called by VisualizerCanvas after CanvasRenderer construction to bridge
   * role change events to the Zustand store for UI consumption.
   * The callback is passed through to runAnalysisTick on every 10fps tick.
   *
   * @param cb - Callback receiving (instrument: string, role: RoleLabel)
   */
  setOnRoleChange(cb: (instrument: string, role: RoleLabel) => void): void {
    this.onRoleChange = cb;
  }

  /**
   * Wires a callback that fires when the displayed chord changes.
   *
   * Called by VisualizerCanvas after CanvasRenderer construction to bridge
   * chord/tension change events to the Zustand store for UI consumption.
   * The callback is passed through to runAnalysisTick on every 10fps tick
   * and fires only when displayedChordIdx changes (not every tick).
   *
   * @param cb - Callback receiving (chord, confidence, fn, tension)
   */
  setOnChordChange(cb: ChordChangeCallback): void {
    this.onChordChange = cb;
  }

  /** Stop the animation loop and release resources. */
  destroy(): void {
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  // -------------------------------------------------------------------------
  // HiDPI setup
  // -------------------------------------------------------------------------

  /**
   * Configures canvas backing store for the current devicePixelRatio.
   *
   * Pattern:
   *   canvas.width  = cssWidth  * dpr
   *   canvas.height = cssHeight * dpr
   *   ctx.scale(dpr, dpr)
   *
   * This means all draw calls use logical CSS pixels, but the canvas
   * backing store has enough pixels for crisp rendering on Retina/HiDPI.
   */
  private setupHiDPI(): void {
    const dpr = window.devicePixelRatio ?? 1;
    const rect = this.canvas.getBoundingClientRect();

    // Use the element's CSS size as our logical canvas size.
    // Fall back to sensible defaults if element is not yet laid out.
    const cssWidth  = rect.width  > 0 ? rect.width  : 800;
    const cssHeight = rect.height > 0 ? rect.height : 400;

    this.logicalWidth  = cssWidth;
    this.logicalHeight = cssHeight;

    // Set backing-store resolution
    this.canvas.width  = Math.round(cssWidth  * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);

    // Scale so all draw calls use logical coords
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // -------------------------------------------------------------------------
  // rAF render loop
  // -------------------------------------------------------------------------

  private render(): void {
    const { ctx, logicalWidth: w, logicalHeight: h } = this;

    // -- Background ----------------------------------------------------------
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // -- Read audio state (zero allocations) ---------------------------------
    const state = this.audioStateRef.current;
    const freqData   = state.smoothedFreqData;
    const bands      = state.bands;

    // -- Pull FFT data once per frame (not per node) -------------------------
    if (freqData && state.smoothedAnalyser) {
      state.smoothedAnalyser.getByteFrequencyData(freqData);
    }

    // -- 10fps analysis gate -------------------------------------------------
    // runAnalysisTick pulls from BOTH analysers (smoothed AND raw).
    // The smoothed pull above is redundant on analysis frames but harmless —
    // same pre-allocated array, same data. Keep both for clarity.
    const analysis = state.analysis;
    if (analysis && analysis.isAnalysisActive) {
      const now = performance.now();
      if ((now - analysis.lastAnalysisMs) >= 100) {
        analysis.lastAnalysisMs = now;
        runAnalysisTick(state, this.onRoleChange, this.onChordChange);
      }
    }

    // -- Draw nodes ----------------------------------------------------------
    for (const cfg of NODE_CONFIGS) {
      const x = cfg.x * w;
      const y = cfg.y * h;

      // Find matching band by name; fall back to energy=0 if not found yet
      let energy = 0;
      if (freqData && bands.length > 0) {
        const band = bands.find((b) => b.name === cfg.bandName);
        if (band) {
          energy = getBandEnergy(freqData, band);
        }
      }

      const radius = MIN_RADIUS + energy * (MAX_RADIUS - MIN_RADIUS);

      // -- Glow (offscreen composite, NO shadowBlur) -------------------------
      // drawImage the pre-rendered glow centered on the node.
      // glowCanvas is radius*4 wide/tall — center it on (x, y).
      const glowSize = this.glowCanvas.width; // already radius*4 from creation
      ctx.globalAlpha = 0.5 + energy * 0.5;
      ctx.drawImage(
        this.glowCanvas,
        x - glowSize / 2,
        y - glowSize / 2,
        glowSize,
        glowSize
      );
      ctx.globalAlpha = 1;

      // -- Node circle -------------------------------------------------------
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.fill();

      // -- Label -------------------------------------------------------------
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(cfg.label, x, y + radius + 4);
    }

    // -- Tension meter -------------------------------------------------------
    // Positioned at the right edge: x = w - 40, y = 20, height = h - 40, width = 24.
    // Only rendered when tension state exists (analysis active after calibration).
    const tension = state.tension;
    if (tension) {
      const meterX = w - 40;
      const meterY = 20;
      const meterH = h - 40;
      const meterW = 24;
      const ghostTension = getGhostTension(tension);
      this.tensionMeter.render(ctx, meterX, meterY, meterH, meterW, tension.currentTension, ghostTension);
    }

    // -- Schedule next frame -------------------------------------------------
    this.rafHandle = requestAnimationFrame(this.boundRender);
  }
}
