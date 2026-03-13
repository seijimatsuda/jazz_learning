---
phase: 13-visual-family-identity
plan: "01"
subsystem: ui
tags: [canvas, instrument-families, visualization, ring-stroke, layout-sort]

# Dependency graph
requires:
  - phase: 12-disambiguation-engine
    provides: INSTRUMENT_FAMILIES map and disambiguation engine that drives confidence alpha (ctx.globalAlpha) on drawNode calls
  - phase: 05-canvas-node-graph
    provides: drawNode, NodeLayout, CanvasRenderer architecture
provides:
  - FAMILY_RING_COLOR constant mapping family strings to hex colors (instrumentFamilies.ts)
  - Ring stroke rendering with optional ringColor parameter in drawNode (radius+1.5, 3px, ctx.save/restore)
  - Family-sorted instrumentOrder in CanvasRenderer constructor via FAMILY_SORT_ORDER
  - Clustered circular layout: drums | keyboard+vibes | guitar | saxophone | trumpet+trombone
affects: [14-pocket-scoring-visual, any future phase touching drawNode or CanvasRenderer constructor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ring stroke sits OUTSIDE fill circle at radius+1.5 so role-color fill is never obscured"
    - "ctx.save/restore isolates lineWidth changes in ring stroke to prevent edge bleed"
    - "Family sort runs before all index-dependent data structures (nodePositions, nodeAnimStates, pairs, edgeAnimStates)"
    - "ringColor inherits ctx.globalAlpha set by Phase 12 confidence indicator — intentional behavior"

key-files:
  created: []
  modified:
    - src/audio/instrumentFamilies.ts
    - src/canvas/nodes/drawNode.ts
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "Ring drawn at radius+1.5 (not radius) — keeps ring outside fill, no overlap"
  - "strings sort value 2 (adjacent to keyboard=1) — guitar and keyboard share comping/chordal roles in jazz"
  - "FAMILY_SORT_ORDER as module-level const (not inside constructor) for readability"
  - "Bass-absent edge case: all instruments sorted by family when bass not in lineup"

patterns-established:
  - "VIS-01 pattern: family ring = stable visual layer, role fill = dynamic role layer — orthogonal concerns"
  - "VIS-02 pattern: family sort must precede all index-dependent constructor code"

# Metrics
duration: 99min
completed: 2026-03-13
---

# Phase 13 Plan 01: Visual Family Identity Summary

**Colored family ring strokes on all instrument nodes (amber/emerald/orange/indigo/fuchsia) with family-clustered circular layout sorting horns, keyboard, and strings into adjacent groups**

## Performance

- **Duration:** 99 min
- **Started:** 2026-03-13T01:32:29Z
- **Completed:** 2026-03-13T03:11:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `FAMILY_RING_COLOR` to `instrumentFamilies.ts` — maps rhythm/brass/woodwind/keyboard/strings to distinct hex colors without touching any existing Phase 12 exports
- Extended `drawNode` with optional `ringColor` parameter — 3px stroke at radius+1.5 outside fill circle, isolated with ctx.save/restore, inherits globalAlpha for Phase 12 confidence dimming
- Added `FAMILY_SORT_ORDER` and family-sort logic to CanvasRenderer constructor — sorts ring instruments before all index-dependent data structures, bass fixed at center

## Task Commits

Each task was committed atomically:

1. **Task 1: Family ring stroke on nodes (VIS-01)** - `c871eaa` (feat)
2. **Task 2: Family-sorted circular layout (VIS-02)** - `05b591d` (feat)

**Plan metadata:** _(pending final commit)_

## Files Created/Modified
- `src/audio/instrumentFamilies.ts` - Added `FAMILY_RING_COLOR` constant (20 lines, no changes to existing exports)
- `src/canvas/nodes/drawNode.ts` - Added optional `ringColor` 7th parameter, ring stroke block with ctx.save/restore
- `src/canvas/CanvasRenderer.ts` - Added FAMILY_SORT_ORDER constant, family-sort in constructor, imported INSTRUMENT_FAMILIES + FAMILY_RING_COLOR, ringColor computed and passed to all 3 drawNode call sites

## Decisions Made
- **Ring at radius+1.5 not radius** — ensures ring sits visually outside fill circle with a 1.5px gap, preventing any overlap with the role-colored fill
- **strings sort value 2 adjacent to keyboard value 1** — guitar and keyboard cluster together because they share harmonic/comping roles in jazz (both chordal instruments)
- **FAMILY_SORT_ORDER as module-level constant** — preferred over inside-constructor for readability and potential future reuse
- **ringColor inherits ctx.globalAlpha** — Phase 12 confidence dimming (0.5 alpha when confidence < 0.5) applies equally to ring and fill; this is correct — a low-confidence node should appear dimmed entirely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. TypeScript compiled clean on first attempt. Vite production build succeeded without warnings.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VIS-01 and VIS-02 fully implemented and TypeScript/build verified
- Ring colors and layout sort are ready for Phase 14 pocket-scoring visual work
- No blockers
- Note: ring colors can be tuned empirically once viewed on actual recordings — current values are perceptually distinct on dark background but real-world calibration may adjust specific hex values

---
*Phase: 13-visual-family-identity*
*Completed: 2026-03-13*
