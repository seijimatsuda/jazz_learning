---
phase: 03-chord-detection-harmonic-analysis
plan: "04"
subsystem: ui
tags: [canvas, tension-meter, gradient, rAF, iOS]

# Dependency graph
requires:
  - phase: 03-02
    provides: TensionScorer with getGhostTension and ring buffer history
  - phase: 03-03
    provides: AnalysisTick wiring tension into the rAF loop via state.tension

provides:
  - TensionMeter class rendering vertical gradient bar with ghost line (TENS-04, TENS-05)
  - CanvasRenderer integrating TensionMeter at right edge of canvas in rAF loop

affects:
  - 03-05 (chord display UI components reading Zustand)
  - Any future visual phase using CanvasRenderer

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gradient-canvas pattern: off-DOM HTMLCanvasElement (1×h) used as gradient source, drawImage samples it per frame — no OffscreenCanvas, iOS compatible"
    - "Gradient ONCE init: createLinearGradient called only in constructor and resize(), never in render()"
    - "Guard pattern: tension meter only renders when state.tension is non-null (after calibration)"

key-files:
  created:
    - src/canvas/TensionMeter.ts
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-03-04-1: drawImage from 1-pixel-wide gradient canvas for fill instead of ctx.createLinearGradient per frame — zero gradient allocations in hot rAF path"
  - "D-03-04-2: TensionMeter.render() takes currentTension and ghostTension as explicit params — no direct state access inside component"
  - "D-03-04-3: tensionMeter.resize() called inside CanvasRenderer.resize() to propagate height changes"

patterns-established:
  - "Off-DOM canvas as pre-rendered texture: build once, drawImage every frame — applicable to any repeating gradient or pattern element"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 3 Plan 04: TensionMeter Canvas Component Summary

**Vertical gradient tension bar (blue->amber->orange->red) with 3-second ghost line rendered at right edge of canvas via off-DOM pre-baked gradient canvas (iOS safe, zero per-frame gradient allocations)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T03:48:39Z
- **Completed:** 2026-03-11T03:50:15Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created TensionMeter class with gradient built once in constructor and rebuilt only in resize()
- render() accepts currentTension and ghostTension params directly — no state coupling inside component
- Ghost line (white, 0.5 opacity) from getGhostTension() satisfies TENS-05
- CanvasRenderer now instantiates TensionMeter, propagates resize, and calls render() after node drawing with guard on state.tension

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TensionMeter Canvas component** - `423b210` (feat)
2. **Task 2: Integrate TensionMeter into CanvasRenderer rAF loop** - `6d0ecd2` (feat)

## Files Created/Modified

- `src/canvas/TensionMeter.ts` - Vertical tension bar with gradient, ghost line, and current-level indicator
- `src/canvas/CanvasRenderer.ts` - TensionMeter field, constructor init, resize propagation, render call with guard

## Decisions Made

- **D-03-04-1:** Used a 1-pixel-wide off-DOM HTMLCanvasElement pre-filled with the linear gradient, then `drawImage` slices it each frame — eliminates `createLinearGradient` from the rAF hot path entirely.
- **D-03-04-2:** `render()` takes `currentTension` and `ghostTension` as explicit parameters — TensionMeter has no knowledge of AudioStateRef or Zustand.
- **D-03-04-3:** `CanvasRenderer.resize()` delegates to `tensionMeter.resize(h - 40)` so the gradient canvas matches the logical meter height after any layout change.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TensionMeter is live in the rAF loop and will display immediately once tension state is populated after calibration
- 03-05 (chord display UI overlay reading Zustand currentChord / chordConfidence / chordFunction) is unblocked
- iOS compatibility maintained: no OffscreenCanvas, no shadowBlur, no per-frame typed array allocations

---
*Phase: 03-chord-detection-harmonic-analysis*
*Completed: 2026-03-11*
