---
phase: 09-data-layer-and-structural-refactor
plan: 03
subsystem: ui
tags: [canvas, typescript, animation, layout, instrument-nodes, edges]

# Dependency graph
requires:
  - phase: 09-01
    provides: InstrumentName expanded to 8 members, EDGE_TYPE expanded to 28 pairs, PitchAnalysisState restructured
provides:
  - computeNodePositions handles counts 2-8 with pre-computed fractional positions
  - buildPairs() utility generates PairTuple[] from any instrument list
  - PairTuple type exported from NodeLayout.ts
  - CanvasRenderer constructor accepts lineup:string[] and derives all internal state
  - drawCommunicationEdges accepts pairs as parameter (no module-level IIFE)
  - Pocket line guarded: only drawn when both bass and drums are in lineup
  - VisualizerCanvas reads lineup from Zustand and passes to CanvasRenderer
  - Click detection uses getNodeLayout().instruments (dynamic, not hardcoded INSTRUMENT_ORDER)
affects: [09-04, 10-canvas-interactions, future phases using CanvasRenderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lineup-driven construction: CanvasRenderer derives all node/edge state from lineup at construction time"
    - "Parameter-passing over module globals: drawCommunicationEdges receives pairs as parameter instead of using module-level IIFE"
    - "Guard pattern: pocket line only drawn when indexOf() returns >= 0 for both bass and drums"
    - "Dynamic pairs: buildPairs() generates all non-pocket pairs from any instrument list using alphabetical canonical key ordering"

key-files:
  created: []
  modified:
    - src/canvas/nodes/NodeLayout.ts
    - src/canvas/edges/drawCommunicationEdges.ts
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx

key-decisions:
  - "D-09-03-1: Pre-computed grid/cluster positions used for counts 5-8 (not circular math) — deterministic, visually tuned for 2:1 aspect ratio canvas"
  - "D-09-03-2: PairTuple type exported from NodeLayout.ts (not EdgeAnimState.ts) because it describes the node graph structure, not edge animation"
  - "D-09-03-3: INSTRUMENT_ORDER kept in NodeLayout.ts with deprecation note for backward compatibility (still imported elsewhere)"

patterns-established:
  - "NodeLayout.ts is the single source for PairTuple type and buildPairs() utility"
  - "CanvasRenderer constructor is the integration point: lineup in → all canvas state derived"
  - "drawCommunicationEdges is pure: all input as parameters, no module-level state"

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 09 Plan 03: Dynamic Lineup-Driven Canvas Renderer Summary

**CanvasRenderer refactored to accept lineup at construction, with PAIRS IIFE removed, computeNodePositions extended to 2-8, and pocket line guarded against missing rhythm section**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-12T04:57:00Z
- **Completed:** 2026-03-12T05:12:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed the PAIRS IIFE crash site from drawCommunicationEdges.ts — pairs now passed as parameter from CanvasRenderer
- Extended computeNodePositions from count 2|3|4 to 2|3|4|5|6|7|8 with pre-computed grid positions for 5-8 nodes
- CanvasRenderer constructor now accepts lineup and derives nodePositions, nodeAnimStates, pairs, and edgeAnimStates dynamically
- Pocket line guarded with indexOf >= 0 check — no crash when bass or drums absent from lineup
- VisualizerCanvas reads lineup from Zustand store and passes to CanvasRenderer; click detection uses dynamic instruments array

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend NodeLayout and remove PAIRS IIFE from drawCommunicationEdges** - `89f622d` (feat)
2. **Task 2: Refactor CanvasRenderer to accept lineup and wire VisualizerCanvas** - `46a375e` (feat)

**Plan metadata:** (docs: complete plan — see final commit)

## Files Created/Modified
- `src/canvas/nodes/NodeLayout.ts` - Added cases 5-8 to computeNodePositions; exported PairTuple type and buildPairs() utility; added deprecation note on INSTRUMENT_ORDER
- `src/canvas/edges/drawCommunicationEdges.ts` - Removed PAIRS IIFE and INSTRUMENT_ORDER import; added pairs: PairTuple[] parameter; imported NodePosition type and PairTuple from NodeLayout
- `src/canvas/CanvasRenderer.ts` - Added lineup parameter to constructor; stores as instrumentOrder; derives nodePositions, nodeAnimStates, pairs, edgeAnimStates from lineup; guarded pocket line; updated resize() and node loop; expanded getNodeLayout() to return instruments[]
- `src/components/VisualizerCanvas.tsx` - Removed INSTRUMENT_ORDER import; reads lineup from Zustand; passes lineup to CanvasRenderer; click handler uses instruments from getNodeLayout()

## Decisions Made
- D-09-03-1: Pre-computed grid/cluster positions used for 5-8 nodes rather than circular math — they are deterministic, tuned visually for the 2:1 aspect ratio canvas, and avoid any floating-point variance between browsers
- D-09-03-2: PairTuple type exported from NodeLayout.ts because it describes graph structure (node indices + edge key), not edge animation behavior
- D-09-03-3: INSTRUMENT_ORDER kept in NodeLayout.ts with a deprecation comment — removing it would require a larger sweep of all importers outside this plan's scope

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled cleanly on the first attempt for both tasks. Build succeeded immediately after Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Three of four zero-tolerance crash sites are now fixed: PAIRS IIFE, computeNodePositions count limit, CanvasRenderer hardcoded 4-node constructor, and pocket line indexOf(-1) throw
- Plan 04 (AnalysisTick restructure) can proceed — the TypeScript errors left in AnalysisTick.ts and App.tsx from 09-01 are the final target
- Phase 10 canvas interactions can use getNodeLayout().instruments for all dynamic lineup operations without hardcoded INSTRUMENT_ORDER references

---
*Phase: 09-data-layer-and-structural-refactor*
*Completed: 2026-03-12*
