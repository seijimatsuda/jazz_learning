---
phase: 10-band-setup-ui-and-canvas-layout
plan: "02"
subsystem: ui
tags: [canvas, layout, bass, circular, ellipse, geometry, 2d]

# Dependency graph
requires:
  - phase: 09-data-layer-and-structural-refactor
    provides: NodeLayout.ts with computeNodePositions, buildPairs, PairTuple; CanvasRenderer.ts with instrumentOrder pattern

provides:
  - Bass-center circular layout for all instrument counts 2-8 (rx=0.34, ry=0.17 aspect-corrected ellipse)
  - Bass-first reordering in CanvasRenderer constructor so bass always maps to canvas center

affects:
  - 10-band-setup-ui-and-canvas-layout (plan 03 — BandSetupPanel, count badge, 2-8 validation)
  - 11 (future phases consuming CanvasRenderer or NodeLayout layout geometry)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bass-center convention: position[0] = center, positions[1..n-1] = ring"
    - "Aspect-corrected ellipse: rx=0.34, ry=0.17 on 2:1 canvas for visual circularity"
    - "12 o'clock ring start: angle = (2*PI*k/ringCount) - PI/2"

key-files:
  created: []
  modified:
    - src/canvas/nodes/NodeLayout.ts
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-10-02-1: position[0] convention — always canvas center regardless of instrument count"
  - "D-10-02-2: count=2 special case — center + one peer offset right (no ring semantics needed)"
  - "D-10-02-3: rx=0.34, ry=0.17 chosen for true visual circularity on 800x400 canvas (2:1 aspect ratio)"
  - "D-10-02-4: Ring starts at -PI/2 (12 o'clock) so first non-bass instrument is at top"
  - "D-10-02-5: When bass absent, no reordering — position[0] becomes non-bass anchor at center"

patterns-established:
  - "Bass-center-first: CanvasRenderer always reorders so bass occupies index 0 before calling computeNodePositions"
  - "Aspect-corrected ring radii: ry = rx/2 for 2:1 canvas ensures visual circularity"

# Metrics
duration: 6min
completed: 2026-03-12
---

# Phase 10 Plan 02: Band Setup UI and Canvas Layout Summary

**Bass-center circular layout replacing grid placeholders: bass at canvas center (0.5, 0.5), remaining instruments on aspect-corrected elliptical ring (rx=0.34, ry=0.17) for visual circularity on 2:1 canvas, for all counts 2-8**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-12T06:09:10Z
- **Completed:** 2026-03-12T06:10:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced hand-tuned grid/cluster positions (Phase 9 placeholders) with deterministic elliptical ring algorithm covering all counts 2-8
- Bass is always at canvas center (position[0] = {x:0.5, y:0.5}), orbited by all other instruments
- CanvasRenderer reorders lineup at construction time so bass is always at index 0, making it the center node automatically

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace computeNodePositions with bass-center circular layout** - `28ff54f` (feat)
2. **Task 2: Add bass-first reordering in CanvasRenderer constructor** - `a4608b9` (feat)

**Plan metadata:** (to follow — docs commit)

## Files Created/Modified

- `src/canvas/nodes/NodeLayout.ts` - New bass-center circular layout: position[0]=center, ring positions 1..n-1 on aspect-corrected ellipse
- `src/canvas/CanvasRenderer.ts` - Bass-first reordering block in constructor; all subsequent code uses this.instrumentOrder

## Decisions Made

- **count=2 special case:** center + one peer offset right at x=0.75, not a ring of one — cleaner visual separation
- **rx=0.34, ry=0.17:** These radii give 272px horizontal and 136px visual vertical radius on 800x400, creating a true visual circle due to the 2:1 canvas aspect ratio
- **12 o'clock ring start:** `-PI/2` offset ensures first non-bass instrument appears at top, which is the most visually natural starting point
- **No reorder when bass absent:** position[0] (center) becomes a non-bass anchor — still visually coherent, no special-casing needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Layout engine is complete and deterministic for all 2-8 instrument counts
- Bass always at center, ring instruments always in elliptical orbit
- Ready for plan 10-03: BandSetupPanel UI (family grouping, count badge, 2-8 validation)
- iOS canvas performance concern (28 edges at 8 instruments) still needs empirical test — should be done in plan 10-03 or a dedicated validation step

---
*Phase: 10-band-setup-ui-and-canvas-layout*
*Completed: 2026-03-12*
