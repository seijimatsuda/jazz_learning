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
import { createNodeAnimState, lerpExp, updateRipples } from './nodes/NodeAnimState';
import type { NodeAnimState } from './nodes/NodeAnimState';
import { drawNode, getRoleRadius, getRoleFillColor } from './nodes/drawNode';
import { drawGlow, pocketToGlowColor } from './nodes/drawGlow';
import { createGlowLayer } from './offscreen/glowLayer';

type ChordChangeCallback = (
  chord: string,
  confidence: 'low' | 'medium' | 'high',
  fn: string,
  tension: number
) => void;

// ---------------------------------------------------------------------------
// Instrument node initial radius (holding state — role-based sizing from 05-02)
// ---------------------------------------------------------------------------

/** Initial base radius for all nodes in holding state. Role-based sizing active from 05-02. */
const INITIAL_BASE_RADIUS = 28;

// ---------------------------------------------------------------------------
// Drums animation constants (VIZ-06, VIZ-07, VIZ-08, VIZ-09)
// ---------------------------------------------------------------------------

/** Timing offset threshold (ms) to activate the orbit effect (VIZ-09). */
const ORBIT_THRESHOLD_MS = 30;
/** Maximum orbit displacement radius in CSS pixels (VIZ-09). */
const ORBIT_RADIUS_PX = 3;
/** Orbit angular speed in radians per ms — one full orbit ~1.57s (VIZ-09). */
const ORBIT_SPEED = 0.004;

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

    // Create per-instrument animation state objects — initial glow color uses holding state color
    this.nodeAnimStates = INSTRUMENT_ORDER.map((_instrument) =>
      createNodeAnimState(getRoleFillColor('holding'), INITIAL_BASE_RADIUS)
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
  // Bass breathing animation
  // -------------------------------------------------------------------------

  /**
   * Advances the bass node's breathe phase and returns the breathing intensity.
   *
   * - If BPM is null (rubato), returns a static low glow of 0.15.
   * - Advances animState.breathePhase by (deltaMs / beatPeriodMs), wrapping at 1.0.
   * - Maps sine wave to [0.2, 0.8] intensity range.
   * - Modulates by pocket score: in-pocket bass glows brighter.
   *
   * VIZ-03: bass breathing glow synced to BPM.
   *
   * @param animState - Bass node's mutable animation state
   * @param bpm       - Current BPM or null for rubato
   * @param pocketScore - Current pocket score [0,1]
   * @param deltaMs   - Elapsed ms since last frame
   * @returns Breathing glow intensity [0,1]
   */
  private updateBassBreath(
    animState: NodeAnimState,
    bpm: number | null,
    pocketScore: number,
    deltaMs: number,
  ): number {
    if (bpm === null) return 0.15;

    const beatPeriodMs = (60 / bpm) * 1000;
    animState.breathePhase = (animState.breathePhase + deltaMs / beatPeriodMs) % 1.0;

    const sine = Math.sin(animState.breathePhase * Math.PI * 2);
    const breathe = 0.2 + ((sine + 1) / 2) * 0.6;

    // Modulate brightness by pocket score: pocketScore=1 → full, pocketScore=0 → half
    return breathe * (0.5 + pocketScore * 0.5);
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
    const instruments = state.analysis?.instruments ?? null;
    for (let i = 0; i < INSTRUMENT_ORDER.length; i++) {
      const instrument = INSTRUMENT_ORDER[i];
      const pos = this.nodePositions[i];
      const animState = this.nodeAnimStates[i];
      const x = pos.x * w;
      const y = pos.y * h;

      // Look up current role from analysis state — default to 'silent' if unavailable
      const instrAnalysis = instruments?.find((ia) => ia.instrument === instrument) ?? null;
      const role = instrAnalysis?.role ?? 'silent';

      // Update target radius and smoothly transition current radius (VIZ-12)
      const targetRadius = getRoleRadius(role);
      animState.baseRadius = targetRadius;
      animState.currentRadius = lerpExp(
        animState.currentRadius,
        targetRadius + animState.radiusNudge,
        0.15,
        deltaMs,
      );

      // Role-based fill color (VIZ-12)
      const fillColor = getRoleFillColor(role);

      // Capitalize label: 'guitar' → 'Guitar'
      const label = instrument.charAt(0).toUpperCase() + instrument.slice(1);

      // -----------------------------------------------------------------------
      // Drums-specific animations (VIZ-06, VIZ-07, VIZ-08, VIZ-09)
      // -----------------------------------------------------------------------
      if (instrument === 'drums') {
        const beat = state.beat;
        const nowMs = performance.now();

        // -- 1. Beat Nudge decay (VIZ-06) ------------------------------------
        // Exponential lerp toward 0; snap to 0 when sub-pixel to avoid float drift
        animState.radiusNudge = lerpExp(animState.radiusNudge, 0, 0.92, deltaMs);
        if (animState.radiusNudge < 0.5) animState.radiusNudge = 0;

        // -- 2. Onset detection (VIZ-06, VIZ-07) — use timestamp not beatCounter
        if (beat !== null && beat.bpm !== null) {
          if (beat.lastDrumOnsetSec !== animState.lastSeenDrumOnsetSec) {
            animState.lastSeenDrumOnsetSec = beat.lastDrumOnsetSec;

            // Sharp +6px nudge (VIZ-06)
            animState.radiusNudge = 6;

            // Crisp ripple ring on each drum beat (VIZ-07)
            if (animState.ripples.length < 4) {
              animState.ripples.push({
                startMs: nowMs,
                durationMs: 300,
                maxRadius: 60,
                color: '#e0f2fe',
                baseX: x,
                baseY: y,
              });
            }
          }

          // -- 3. Downbeat double ripple (VIZ-08) ----------------------------
          if (beat.lastDownbeatSec !== animState.lastSeenDownbeatSec) {
            animState.lastSeenDownbeatSec = beat.lastDownbeatSec;

            // Second wider ripple with longer fade for downbeats
            if (animState.ripples.length < 4) {
              animState.ripples.push({
                startMs: nowMs,
                durationMs: 500,
                maxRadius: 90,
                color: '#e0f2fe',
                baseX: x,
                baseY: y,
              });
            }
          }
        }

        // -- 4. Timing offset orbit (VIZ-09) ---------------------------------
        let ox = 0;
        let oy = 0;
        if (beat !== null && Math.abs(beat.timingOffsetMs) > ORBIT_THRESHOLD_MS) {
          animState.orbitAngle = (animState.orbitAngle + ORBIT_SPEED * deltaMs) % (Math.PI * 2);
          ox = Math.cos(animState.orbitAngle) * ORBIT_RADIUS_PX;
          oy = Math.sin(animState.orbitAngle) * ORBIT_RADIUS_PX;
        } else {
          animState.orbitAngle = 0;
        }

        // -- 5. Draw drums node: circle -> label -> ripples (VIZ-06..09) -----
        drawNode(ctx, x + ox, y + oy, animState.currentRadius, fillColor, label);
        updateRipples(ctx, animState.ripples, nowMs);
      } else if (instrument === 'bass') {
        // -- Bass-specific animation (VIZ-03, VIZ-04, VIZ-05) ----------------
        const nowMs = performance.now();
        const beat = state.beat ?? null;
        const pocketScore = beat?.pocketScore ?? 0;
        const bpm = beat?.bpm ?? null;

        // Onset detection — compare current lastBassOnsetSec to last seen value
        if (beat !== null && beat.lastBassOnsetSec !== animState.lastSeenBassOnsetSec) {
          animState.lastSeenBassOnsetSec = beat.lastBassOnsetSec;
          // Flash: boost glow intensity to full on onset (VIZ-04)
          animState.glowIntensity = 1.0;
          // Spawn an expanding deep ring if we have headroom (max 4 ripples)
          if (animState.ripples.length < 4) {
            animState.ripples.push({
              startMs: nowMs,
              durationMs: 800,
              maxRadius: 80,
              color: 'rgba(180,83,9,0.6)',
              baseX: x,
              baseY: y,
            });
          }
        }

        // Breathing intensity synced to BPM (VIZ-03)
        const breatheIntensity = this.updateBassBreath(animState, bpm, pocketScore, deltaMs);

        // Onset flash overrides breathing — take the max so breath resumes after decay
        const finalGlowIntensity = Math.max(breatheIntensity, animState.glowIntensity);

        // Decay onset flash back toward 0 (slow exponential so flash is visible ~300ms+)
        animState.glowIntensity = lerpExp(animState.glowIntensity, 0, 0.05, deltaMs);

        // Pocket-score color shift gate (VIZ-05) — re-create glowCanvas only when score
        // changes enough (0.05 threshold) to avoid per-frame HTMLCanvasElement allocation
        if (Math.abs(pocketScore - animState.lastPocketScore) > 0.05) {
          animState.glowCanvas = createGlowLayer(animState.baseRadius * 2, pocketToGlowColor(pocketScore));
          animState.lastPocketScore = pocketScore;
        }

        // Draw glow BEFORE node circle so glow renders behind (additive blend on dark bg)
        drawGlow(ctx, animState.glowCanvas, x, y, finalGlowIntensity);

        // Draw node circle + label
        drawNode(ctx, x, y, animState.currentRadius, fillColor, label);

        // Draw ripples AFTER node circle so rings appear on top
        updateRipples(ctx, animState.ripples, nowMs);
      } else {
        // Guitar and keyboard — draw node circle + label only (glow added in later plans)
        drawNode(ctx, x, y, animState.currentRadius, fillColor, label);
      }
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
