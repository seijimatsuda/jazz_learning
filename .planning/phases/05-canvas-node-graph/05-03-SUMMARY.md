---
phase: 05-canvas-node-graph
plan: "03"
subsystem: ui
tags: [canvas, animation, glow, ripple, bass, pocket-score, compositing, BPM, breath]

# Dependency graph
requires:
  - phase: 05-01
    provides: NodeAnimState with breathePhase, lastSeenBassOnsetSec, lastPocketScore, glowCanvas, ripples[] — all fields needed by bass animation
  - phase: 05-02
    provides: drawNode, ROLE_BASE_RADIUS, ROLE_FILL_COLOR — base node rendering that bass glow composites behind
  - phase: 04-beat-detection
    provides: BeatState.lastBassOnsetSec, BeatState.bpm, BeatState.pocketScore — all three read per-frame for bass animation
  - phase: 01-audio-pipeline
    provides: createGlowLayer (glowLayer.ts) — offscreen HTMLCanvasElement pre-rendered radial gradient, iOS-safe

provides:
  - drawGlow.ts module with additive glow compositing (globalCompositeOperation='lighter')
  - pocketToGlowColor() mapping pocket score [0,1] to amber (#b45309) at high / blue (#1e40af) at low
  - AMBER_RGB and BLUE_RGB pre-parsed constants for zero-alloc channel lerp
  - Bass node breathing glow synced to BPM (VIZ-03): sine wave [0.2, 0.8] modulated by pocket score
  - Bass onset flash with 800ms expanding amber ring (VIZ-04): triggered on lastBassOnsetSec change
  - Pocket-score-driven glow color shift amber to blue (VIZ-05): glowCanvas re-created when delta > 0.05
  - updateBassBreath() private method in CanvasRenderer for BPM-synced breathe phase advancement

affects:
  - 05-04 (drums glow — same additive blend pattern via drawGlow if needed)
  - 05-05 (background pulse — reads bgPulseProgress already wired)
  - All future plans reading pocketScore or BPM for visual feedback

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive glow compositing: globalCompositeOperation='lighter' with pre-rendered offscreen HTMLCanvasElement — no shadowBlur"
    - "Onset detection by timestamp comparison (lastBassOnsetSec !== lastSeenBassOnsetSec) — no boolean flags needed"
    - "Pocket-score color gate: delta > 0.05 threshold before re-creating HTMLCanvasElement — prevents per-frame allocation"
    - "Draw order: glow (behind, additive) → node circle (fills glow hole) → ripples (rings on top)"
    - "Breathing: breathePhase advanced per-frame via deltaMs/beatPeriodMs, modulo 1.0 — frame-rate-independent sine cycle"
    - "Flash decay: lerpExp(glowIntensity, 0, 0.05, deltaMs) gives ~300ms+ visible onset flash before fading"

key-files:
  created:
    - src/canvas/nodes/drawGlow.ts
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "AMBER_RGB=#b45309 / BLUE_RGB=#1e40af — pre-parsed at module load, zero string parsing in hot path"
  - "drawGlow reads glowCanvas.width as the size argument — convention matches createGlowLayer(radius*2) which makes size=radius*8; caller owns the radius contract"
  - "updateBassBreath returns 0.15 static when bpm=null (rubato) — bass still glows faintly during free sections"
  - "onset flash: glowIntensity=1.0 → finalGlowIntensity=max(breathe, glowIntensity) — onset always overrides breathing intensity, breathing resumes as flash decays"
  - "Ripple color rgba(180,83,9,0.6) matches AMBER_RGB in CSS form — semantic consistency with glow color at high pocket score"
  - "Pocket-score gate threshold 0.05 chosen as smallest perceptually meaningful color change — below this threshold glow re-creation cost exceeds visual benefit"

patterns-established:
  - "Bass animation branch in instrument loop: if (instrument === 'bass') { ... } else if (instrument === 'drums') { ... } else { drawNode }"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 5 Plan 03: Bass Glow and Pocket-Score Animation Summary

**Amber breathing glow synced to BPM via sine wave, onset flash with 800ms expanding ring, and pocket-score-driven amber-to-blue color shift using additive canvas compositing**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T05:54:00Z
- **Completed:** 2026-03-11T05:57:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Created `drawGlow.ts` with `drawGlow()` (additive compositing), `pocketToGlowColor()` (amber/blue lerp), and pre-parsed `AMBER_RGB`/`BLUE_RGB` constants
- Added `updateBassBreath()` private method to CanvasRenderer that advances breathePhase at BPM tempo and maps sine to [0.2, 0.8] range modulated by pocket score
- Wired complete bass animation branch in render loop: onset detection, flash, breathing, color-shift gate, draw-order (glow → node → ripples)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create drawGlow.ts with pocket-score color interpolation** - `d17f61b` (feat)
2. **Task 2: Wire bass node animations into CanvasRenderer** - `32c83fe` (feat)

**Plan metadata:** _(docs commit — see below)_

## Files Created/Modified

- `src/canvas/nodes/drawGlow.ts` — drawGlow, pocketToGlowColor, AMBER_RGB, BLUE_RGB exports
- `src/canvas/CanvasRenderer.ts` — imports added, updateBassBreath method, bass animation branch in render loop

## Decisions Made

- `drawGlow` uses `glowCanvas.width` as the size (not a passed-in parameter) — matches createGlowLayer convention that canvas width = radius * 4; caller controls the radius contract at glowCanvas creation time
- `updateBassBreath` returns 0.15 (static low glow) when bpm=null — bass still has a faint presence during rubato sections, no harsh on/off
- Pocket-score gate threshold = 0.05 — smallest perceptually meaningful color shift; tighter gate would cause per-frame HTMLCanvasElement churn
- Ripple color `rgba(180,83,9,0.6)` matches AMBER_RGB numerically — semantic consistency; ripple color represents "bass at high pocket" visual language

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 05-04 had already landed drums animation in CanvasRenderer**

- **Found during:** Task 2 (wiring bass into render loop)
- **Issue:** Plan spec said to modify the generic `else` branch ("05-03/05-04 will add glow and ripples above this"), but 05-04 had already run in parallel and restructured the loop to `if (instrument === 'drums') { ... } else { drawNode }`. The bass branch needed to nest inside the `else` block as `else if (instrument === 'bass')`.
- **Fix:** Added `else if (instrument === 'bass') { ... }` between the drums branch and the fallback `else { drawNode }`. Logic is identical to what the plan specified.
- **Files modified:** src/canvas/CanvasRenderer.ts
- **Verification:** `npx tsc --noEmit` passes; all three branches (drums, bass, other) correctly structured
- **Committed in:** 32c83fe (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (blocking — parallel plan execution ordering)
**Impact on plan:** Zero scope change. Bass animation logic identical to spec; only the structural nesting in the if/else chain changed.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- VIZ-03, VIZ-04, VIZ-05 complete — bass node is the gravitational center with breathing, flash, and color-shift
- `drawGlow.ts` available for 05-04 if drums need additive glow (import already structured)
- Ready for 05-05 (background pulse, orbit lines, phase complete)

---
*Phase: 05-canvas-node-graph*
*Completed: 2026-03-11*
