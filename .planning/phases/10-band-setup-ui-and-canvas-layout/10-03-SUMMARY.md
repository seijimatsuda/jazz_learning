---
phase: 10-band-setup-ui-and-canvas-layout
plan: "03"
subsystem: canvas
tags: [canvas, performance, ios-safari, edge-rendering, batch-rendering, 2d-context]

# Dependency graph
requires:
  - phase: 10-02
    provides: bass-center circular layout (computeNodePositions updated for 2-8 instruments)
  - phase: 06-edge-visualization
    provides: drawCommunicationEdges, EdgeAnimState, edgeTypes with TENSION_RED_RGB/TENSION_AMBER_RGB
provides:
  - CANV-03: Non-animated edges batch-rendered without per-edge save/restore (single pass)
  - CANV-04: Dynamic hide threshold (0.30 for 2-5 instruments, 0.45 for 6-8 instruments)
  - Module-level pre-allocated edgeRenderBuf (28 slots, zero per-frame heap allocations)
affects:
  - phase 11 (final polish — canvas performance baseline established)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Collect-then-draw pattern: Pass 1 fills pre-allocated buffer, Pass 2-4 draw by type"
    - "rgba() opacity encoding for batch non-animated strokes avoids per-edge globalAlpha"
    - "setLineDash isolation via save/restore kept only for animated (dashed) edges on iOS Safari"
    - "Module-level pre-allocated interface array (28 slots) for zero per-frame allocation"

key-files:
  created: []
  modified:
    - src/canvas/edges/drawCommunicationEdges.ts
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-10-03-1: Non-animated edges use rgba() in strokeStyle instead of globalAlpha — batched in single pass without save/restore"
  - "D-10-03-2: Animated (dashed) edges still isolated with save/restore — iOS Safari requires this for setLineDash correctness"
  - "D-10-03-3: Dynamic threshold breakpoint at instrumentCount > 5 (from 2 to 28 edges is quadratic — 0.45 threshold at 6-8 keeps graph readable)"
  - "D-10-03-4: getTintedColor call replaced with inline lerp in collect pass — eliminates string allocation per visible edge per frame"
  - "D-10-03-5: Pre-allocated buffer is module-level (not class field) — persists across CanvasRenderer instances, safe for single-canvas apps"

patterns-established:
  - "Collect-then-draw: separate state computation from rendering for batching opportunity"
  - "Pre-allocate render buffers at module level for hot animation loops"

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 10 Plan 03: Edge Batching and Dynamic Hide Threshold Summary

**Collect-then-draw edge refactor: non-animated edges batch-rendered with rgba() opacity (zero save/restore), animated edges isolated with save/restore for iOS Safari, dynamic threshold 0.30 -> 0.45 above 5 instruments**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-12
- **Completed:** 2026-03-12
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Reduced per-frame save/restore pairs from up to 28 (one per edge) to 1 per animated edge — at 8 instruments with all animated edges, worst case drops from 28 to at most ~10 for animated subset
- CANV-03: Single ctx.setLineDash([]) call batches all static_thin + subtle edges; opacity encoded in rgba() strokeStyle eliminates per-edge globalAlpha mutation
- CANV-04: Dynamic hide threshold raises weak-edge cutoff from 0.30 to 0.45 when instrument count exceeds 5, keeping 28-edge graph readable
- Module-level pre-allocated edgeRenderBuf (28 slots) eliminates per-frame heap allocation in the hot render path
- Flash/glow pass (EDGE-10 resolution flash, MEL-04 call-response flash) preserved and co-located in Pass 4 using stored midpoint coordinates

## Task Commits

Each task was committed atomically:

1. **Task 1: Add instrumentCount parameter and dynamic threshold to drawCommunicationEdges** - `3da0c5b` (feat)
2. **Task 2: Wire instrumentCount from CanvasRenderer to drawCommunicationEdges** - `5d1e9e1` (feat)

## Files Created/Modified
- `src/canvas/edges/drawCommunicationEdges.ts` - Restructured into 4-pass collect-then-draw pattern; added instrumentCount param, dynamic hideThreshold, module-level edgeRenderBuf, rgba() opacity encoding for non-animated edges
- `src/canvas/CanvasRenderer.ts` - Added `this.instrumentOrder.length` as final argument to drawCommunicationEdges call

## Decisions Made
- **D-10-03-1:** Non-animated edges use `rgba()` in strokeStyle rather than `globalAlpha` — enables batching in a single ctx pass without save/restore bracketing per edge
- **D-10-03-2:** Animated (dashed) edges still individually isolated with save/restore — iOS Safari requires this for `setLineDash` to not bleed across draw calls
- **D-10-03-3:** Dynamic threshold breakpoint at `instrumentCount > 5` — at 6+ instruments the graph has 15+ edges; raising threshold to 0.45 hides low-weight connections that would clutter the layout
- **D-10-03-4:** Replaced `getTintedColor()` call with inline lerp in collect pass — the string allocation from getTintedColor per visible edge per frame is avoided; lerp from NodeAnimState and tension targets from edgeTypes already imported
- **D-10-03-5:** Pre-allocated buffer is module-level (not CanvasRenderer class field) — single canvas app pattern, simpler lifecycle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled clean first attempt, vite build succeeded on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 is now complete (3/3 plans done)
- Canvas rendering performance baseline established for iOS Safari at 8 instruments
- Phase 11 (final polish) can proceed — edge rendering is stable and tested through TypeScript + build verification
- iOS empirical device testing of 8-instrument scenario (the remaining concern from STATE.md) should be done early in Phase 11 to validate the CANV-03/CANV-04 improvements

---
*Phase: 10-band-setup-ui-and-canvas-layout*
*Completed: 2026-03-12*
