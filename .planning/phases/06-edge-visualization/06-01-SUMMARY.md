---
phase: 06-edge-visualization
plan: 01
subsystem: ui
tags: [canvas, animation, edges, pocket-score, bass-drums, sync-flash]

# Dependency graph
requires:
  - phase: 05-canvas-node-graph
    provides: NodeAnimState, drawGlow, createGlowLayer, INSTRUMENT_ORDER, NodeLayout
  - phase: 04-beat-detection-bpm-pocket-score
    provides: BeatState, pocketScore, lastDrumOnsetSec, PocketScorer
provides:
  - EdgeAnimState interface and createEdgeAnimState factory
  - edgeTypes with EDGE_COLOR, EDGE_TYPE, tension color constants
  - drawPocketLine with three visual states, sync flash, floating label
  - BeatState.lastSyncEventSec field written by PocketScorer
  - Pocket line always visible between bass and drums (EDGE-01)
affects: [06-02, 06-03, 06-04, 07-chord-tension-viz]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - EdgeAnimState plain object pattern (mirrors NodeAnimState — no class, no methods)
    - Pre-create offscreen glow canvases once in factory (never per frame)
    - ctx.save()/ctx.restore() wrapping ALL lineDash state changes for iOS Safari isolation
    - Direction-vector endpoint termination for lines connecting node circles
    - Deviation rules 1-3 not triggered — plan executed exactly as written

key-files:
  created:
    - src/canvas/edges/EdgeAnimState.ts
    - src/canvas/edges/edgeTypes.ts
    - src/canvas/edges/drawPocketLine.ts
  modified:
    - src/audio/types.ts
    - src/audio/PocketScorer.ts
    - src/audio/DrumTransientDetector.ts
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-06-01-1: EdgeAnimState pre-creates two glow canvases (flashGlowCanvas, resolutionGlowCanvas) at factory time — mirrors NodeAnimState glowCanvas pattern, never per frame"
  - "D-06-01-2: lastSyncEventSec written in PocketScorer when score > 0 — reads audioTimeSec argument available at call site, no extra state needed"
  - "D-06-01-3: ctx.save()/ctx.restore() wraps all lineDash operations — iOS Safari lineDash state leaks across draw calls without explicit reset"
  - "D-06-01-4: Line terminates at node circumference via normalized direction vector offset — prevents line overlapping node fill circle"
  - "D-06-01-5: edgeAnimStates initialized for all 6 pairs in constructor — Plan 02 needs only to add drawCommunicationEdges at same insertion point"

patterns-established:
  - "Edge draw calls: AFTER background fill, BEFORE node loop in CanvasRenderer.render()"
  - "Edge pair key format: 'instrumentA_instrumentB' alphabetical (e.g. bass_drums, not drums_bass)"
  - "Pocket state thresholds: >0.7 tight, >0.4 loose, else free — used in both drawPocketLine and getPocketLabel"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 6 Plan 1: Edge Visualization Foundation Summary

**Pocket line (bass-drums) always visible with 3 animated states (green dashes/yellow wobble/gray static), white sync flash glow, and floating label — edge foundation (EdgeAnimState, edgeTypes) established for Plans 02-04**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T06:56:08Z
- **Completed:** 2026-03-11T06:59:22Z
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments
- Edge rendering foundation created: `EdgeAnimState.ts` (per-edge mutable state, pre-creates glow canvases) and `edgeTypes.ts` (static classification table and pre-parsed RGB color constants)
- `drawPocketLine.ts` implements EDGE-01 through EDGE-06: always-visible line, three visual states (tight/loose/free), flowing dash animation, sine wobble, sync flash, floating label
- `BeatState.lastSyncEventSec` added to types.ts and wired through PocketScorer and initBeatState, creating the data pipeline for EDGE-05 sync flash
- CanvasRenderer integrated: edge anim states for all 6 pairs initialized in constructor; pocket line drawn after background fill, before node loop

## Task Commits

Each task was committed atomically:

1. **Task 1: Edge foundation types and data gap fix** - `a9dc0c2` (feat)
2. **Task 2: Pocket line rendering and CanvasRenderer integration** - `b57a52e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/canvas/edges/EdgeAnimState.ts` - Per-edge mutable animation state interface and factory; pre-creates flashGlowCanvas (#ffffff) and resolutionGlowCanvas (#bfdbfe)
- `src/canvas/edges/edgeTypes.ts` - EdgeType union, EDGE_COLOR (pre-parsed RGB), EDGE_TYPE pair mapping, TENSION_AMBER_RGB, TENSION_RED_RGB, RESOLUTION_BLUE_RGB
- `src/canvas/edges/drawPocketLine.ts` - Pocket line renderer: endpoint termination, 3 visual states, sync flash, floating label; always draws (EDGE-01)
- `src/audio/types.ts` - Added `lastSyncEventSec: number` to BeatState interface
- `src/audio/PocketScorer.ts` - Writes `beat.lastSyncEventSec = audioTimeSec` when score > 0
- `src/audio/DrumTransientDetector.ts` - Initializes `lastSyncEventSec: -1` in initBeatState
- `src/canvas/CanvasRenderer.ts` - Imports and integrates edges: edgeAnimStates field, 6-pair initialization, drawPocketLine call before node loop

## Decisions Made
- D-06-01-1: EdgeAnimState pre-creates two glow canvases at factory time — matches NodeAnimState glowCanvas pattern; never recreated per frame
- D-06-01-2: lastSyncEventSec written when `score > 0` in PocketScorer — any non-zero sync pair triggers a visual flash event
- D-06-01-3: `ctx.save()/ctx.restore()` wraps all lineDash state — iOS Safari lineDash leaks across draw calls without explicit reset (known compatibility issue)
- D-06-01-4: Direction-vector endpoint termination prevents line from overlapping inside node fill circles
- D-06-01-5: All 6 edgeAnimStates initialized at construction — Plan 02 adds drawCommunicationEdges at the same insertion point without needing further structural changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EDGE-01 through EDGE-06 complete; pocket line renders with all visual states
- EdgeAnimState and edgeTypes are established for Plan 02 (communication edges) and Plan 03 (tension tint)
- `edgeAnimStates['bass_drums']` is the primary object; Plans 02-04 will use the remaining 5 pairs
- Plan 02 insertion point is already identified: add `drawCommunicationEdges` immediately after `drawPocketLine` call in the `// -- Draw edges (behind nodes) --` block

---
*Phase: 06-edge-visualization*
*Completed: 2026-03-11*
