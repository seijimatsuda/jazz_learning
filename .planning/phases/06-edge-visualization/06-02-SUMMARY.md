---
phase: 06-edge-visualization
plan: 02
subsystem: ui
tags: [canvas, animation, cross-correlation, edge-rendering, typescript]

# Dependency graph
requires:
  - phase: 06-01
    provides: EdgeAnimState factory, edgeAnimStates initialization, drawPocketLine, EDGE_TYPE/EDGE_COLOR constants
  - phase: 05-canvas-node-graph
    provides: CanvasRenderer class, NodeAnimState, lerpExp, INSTRUMENT_ORDER, nodePositions
provides:
  - drawCommunicationEdges function rendering all 5 non-pocket instrument pairs
  - Weight-driven visual states (hidden/static_thin/subtle/animated) with smooth transitions
  - Flowing dash animation for high-correlation edges
  - Type-based edge coloring (green rhythmic, purple melodic, blue support)
  - EDGE-07 and EDGE-08 complete
affects:
  - 06-03 (tension tinting will add tension-driven color shift on top of base color)
  - 06-04 (resolution flash will use resolutionGlowCanvas on communication edges)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PAIRS tuple array pre-computed at module load from INSTRUMENT_ORDER — zero per-frame allocation
    - visualState enum-style string for weight-based dispatch (hidden/static_thin/subtle/animated)
    - ctx.save()/ctx.restore() wraps ALL lineDash operations — iOS Safari leak isolation
    - Early-exit on currentOpacity < 0.01 prevents redundant strokes for invisible edges

key-files:
  created:
    - src/canvas/edges/drawCommunicationEdges.ts
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-06-02-1: PAIRS pre-computed at module load using nested INSTRUMENT_ORDER loop — zero per-frame allocation; bass_drums excluded as pocket line pair"
  - "D-06-02-2: visualState string dispatch ('hidden'/'static_thin'/'subtle'/'animated') — clear intent at each weight threshold without numeric comparisons in draw block"
  - "D-06-02-3: nodeRadii 4-element array created in render() per frame — acceptable as small non-typed array from existing values; avoids passing nodeAnimStates into edge draw function"
  - "D-06-02-4: dashOffset speed 0.04 vs pocket line 0.06 — communication edges animate slightly slower to visually distinguish from the primary pocket line"

patterns-established:
  - "Edge draw functions accept explicit nodeRadii array — decouples edge rendering from NodeAnimState internals"
  - "All communication edge draw logic contained in single exported function — no class, pure side-effect draw call"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 6 Plan 02: Communication Edges Summary

**Weight-driven communication edge rendering for all 5 non-pocket instrument pairs using cross-correlation weights, with type-based color (green/purple/blue) and animated dashes at high correlation.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T07:01:23Z
- **Completed:** 2026-03-11T07:03:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `drawCommunicationEdges.ts` created with all 5 non-pocket pairs (bass_guitar, bass_keyboard, drums_guitar, drums_keyboard, guitar_keyboard)
- Four visual states driven by smoothed cross-correlation weight with lerpExp transitions
- Animated flowing dashes (slower than pocket line) for high-correlation edges (>=0.7)
- Edge color from EDGE_TYPE/EDGE_COLOR — green (melodic: guitar_keyboard), blue (support: all bass/drums pairs)
- Wired into CanvasRenderer immediately after drawPocketLine, before node loop — edges render behind nodes

## Task Commits

Each task was committed atomically:

1. **Task 1: Communication edge drawing function** - `63c8701` (feat)
2. **Task 2: Wire communication edges into CanvasRenderer** - `426c605` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/canvas/edges/drawCommunicationEdges.ts` - Exports `drawCommunicationEdges()` — weight-based visual states, type coloring, smooth transitions, node-circumference termination
- `src/canvas/CanvasRenderer.ts` - Added import and render() call after drawPocketLine; removed stale Plan 02 comment

## Decisions Made

- **PAIRS pre-computed at module load:** Nested loop over INSTRUMENT_ORDER generates all non-pocket pair tuples once — zero per-frame allocation.
- **dashOffset speed 0.04:** Slightly slower than pocket line (0.06) to visually distinguish communication edges from the primary rhythmic edge.
- **nodeRadii 4-element array in render():** Created per-frame in CanvasRenderer.render() from nodeAnimStates.map(). Acceptable — 4-element non-typed array from existing computed values; avoids exposing NodeAnimState internals into edge draw function.
- **Early exit at currentOpacity < 0.01:** Prevents redundant path/stroke calls for edges transitioning to invisible.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EDGE-07 and EDGE-08 complete
- Communication edges render with correct weight-based visuals and type-based coloring
- All edges render behind nodes
- Pocket line (Plan 01) unaffected
- Plan 03 (tension tinting) can add tension-driven color interpolation on top of the base EDGE_COLOR by modifying `colorString` computation in drawCommunicationEdges
- Plan 04 (resolution flash) can use `animState.resolutionGlowCanvas` at edge midpoints

---
*Phase: 06-edge-visualization*
*Completed: 2026-03-11*
