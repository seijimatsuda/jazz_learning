/**
 * CanvasRenderer.ts — rAF loop, HiDPI setup, and instrument node rendering.
 *
 * Performance constraints:
 * - NO shadowBlur anywhere — use offscreen glow via createGlowLayer + drawImage
 * - NO per-frame typed array allocations (new Uint8Array / new Float32Array)
 *   inside the rAF callback — all arrays are pre-allocated externally (AudioEngine)
 * - setupHiDPI() must be called once and again on every resize
 * - smoothedFreqData is read directly from audioStateRef — zero copying
 * - Delta-time capped at 100ms to prevent jump on tab-resume
 */

import type { MutableRefObject } from 'react';
import type { AudioStateRef, RoleLabel } from '../audio/types';
import { runAnalysisTick } from '../audio/AnalysisTick';
import { TensionMeter } from './TensionMeter';
import { getGhostTension } from '../audio/TensionScorer';
import { computeNodePositions, INSTRUMENT_ORDER } from './nodes/NodeLayout';
import type { NodePosition } from './nodes/NodeLayout';
import { createNodeAnimState } from './nodes/NodeAnimState';
import type { NodeAnimState } from './nodes/NodeAnimState';

type ChordChangeCallback = (
  chord: string,
  confidence: 'low' | 'medium' | 'high',
  fn: string,
  tension: number
) => void;

// ---------------------------------------------------------------------------
// Instrument node colors (holding state — role-based sizing/color from 05-02)
// ---------------------------------------------------------------------------

const INSTRUMENT_COLORS: Record<string, string> = {
  guitar:   '#64748b', // slate
  drums:    '#60a5fa', // blue
  keyboard: '#0d9488', // teal
  bass:     '#b45309', // amber
};

/** Initial base radius for all nodes in holding state. Role-based sizing in 05-02. */
const INITIAL_BASE_RADIUS = 28;

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

  /** Tension meter — gradient created once, reused every frame (TENS-04) */
  private readonly tensionMeter: TensionMeter;

  /** rAF handle — stored so we can cancel on destroy */
  private rafHandle = 0;

  /** Delta-time: previous rAF timestamp for computing deltaMs */
  private prevTimestamp = 0;

  /** Cached fractional node positions — recomputed on resize */
  private nodePositions: NodePosition[] = [];

  /** Per-instrument animation state objects — one per INSTRUMENT_ORDER entry */
  private nodeAnimStates: NodeAnimState[] = [];

  /** Background beat pulse progress [0,1] — for VIZ-11, wired in 05-05 */
  private bgPulseProgress = 0;

  /** Optional callback fired when an instrument's role label changes */
  private onRoleChange?: (instrument: string, role: RoleLabel) => void;

  /** Optional callback fired when the displayed chord changes (Phase 3) */
  private onChordChange?: ChordChangeCallback;

  /** Optional callback fired every tick with current tension value (Phase 3) */
  private onTensionUpdate?: (tension: number) => void;

  /** Optional callback fired when BPM or pocket score changes (Phase 4) */
  private onBeatUpdate?: (bpm: number | null, pocketScore: number, timingOffsetMs: number) => void;

  /** Bound rAF callback — receives DOMHighResTimeStamp for delta-time */
  private readonly boundRender: (ts: DOMHighResTimeStamp) => void;

  constructor(canvas: HTMLCanvasElement, audioStateRef: MutableRefObject<AudioStateRef>) {
    this.canvas = canvas;
    this.audioStateRef = audioStateRef;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[CanvasRenderer] Could not get 2d context from canvas element.');
    }
    this.ctx = ctx;

    // Compute diamond layout for 4 instruments (hardcoded jazz quartet)
    this.nodePositions = computeNodePositions(4);

    // Create per-instrument animation state objects
    this.nodeAnimStates = INSTRUMENT_ORDER.map((instrument) =>
      createNodeAnimState(INSTRUMENT_COLORS[instrument] ?? '#64748b', INITIAL_BASE_RADIUS)
    );

    // Pre-create tension meter — gradient built once, reused every frame (TENS-04)
    // Use 360 as default height; resize() corrects this after layout settles.
    this.tensionMeter = new TensionMeter(360);

    // rAF callback receives DOMHighResTimeStamp for delta-time computation
    this.boundRender = (ts: DOMHighResTimeStamp) => this.render(ts);

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
    // Recompute fractional positions (same values but explicit for future layout changes)
    this.nodePositions = computeNodePositions(4);
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

  /** Set callback for per-tick tension updates (Phase 3). */
  setOnTensionUpdate(cb: (tension: number) => void): void {
    this.onTensionUpdate = cb;
  }

  /** Set callback for BPM and pocket score updates (Phase 4). */
  setOnBeatUpdate(cb: (bpm: number | null, pocketScore: number, timingOffsetMs: number) => void): void {
    this.onBeatUpdate = cb;
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

  private render(timestamp: DOMHighResTimeStamp): void {
    const { ctx, logicalWidth: w, logicalHeight: h } = this;

    // -- Delta-time computation (capped at 100ms to prevent tab-resume jump) -
    const rawDelta = this.prevTimestamp > 0 ? timestamp - this.prevTimestamp : 16.667;
    const deltaMs = Math.min(rawDelta, 100);
    this.prevTimestamp = timestamp;

    // Suppress unused variable lint warning for deltaMs — used in 05-02+ animations
    void deltaMs;
    // Suppress unused variable lint warning for bgPulseProgress — wired in 05-05
    void this.bgPulseProgress;

    // -- Background ----------------------------------------------------------
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // -- Read audio state (zero allocations) ---------------------------------
    const state = this.audioStateRef.current;
    const freqData = state.smoothedFreqData;

    // -- Pull FFT data once per frame (not per node) -------------------------
    if (freqData && state.smoothedAnalyser) {
      state.smoothedAnalyser.getByteFrequencyData(freqData);
    }

    // -- 10fps analysis gate -------------------------------------------------
    // runAnalysisTick pulls from BOTH analysers (smoothed AND raw).
    const analysis = state.analysis;
    if (analysis && analysis.isAnalysisActive) {
      const now = performance.now();
      if ((now - analysis.lastAnalysisMs) >= 100) {
        analysis.lastAnalysisMs = now;
        runAnalysisTick(state, this.onRoleChange, this.onChordChange, this.onTensionUpdate, this.onBeatUpdate);
      }
    }

    // -- Draw instrument nodes -----------------------------------------------
    for (let i = 0; i < INSTRUMENT_ORDER.length; i++) {
      const instrument = INSTRUMENT_ORDER[i];
      const pos = this.nodePositions[i];
      const animState = this.nodeAnimStates[i];
      const x = pos.x * w;
      const y = pos.y * h;

      // Placeholder circle rendering — 05-02 adds role-based sizing and glow,
      // 05-03/04 add bass/drum animations driven by beat timestamps
      ctx.beginPath();
      ctx.arc(x, y, animState.currentRadius, 0, Math.PI * 2);
      ctx.fillStyle = INSTRUMENT_COLORS[instrument] ?? '#64748b';
      ctx.fill();

      // Instrument label below the node
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(instrument, x, y + animState.currentRadius + 4);
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
