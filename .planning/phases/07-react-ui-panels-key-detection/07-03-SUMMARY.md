---
phase: 07-react-ui-panels-key-detection
plan: 03
subsystem: ui
tags: [react, canvas, zustand, hidpi, sparkline, pie-chart, click-detection, typescript]

# Dependency graph
requires:
  - phase: 07-01
    provides: selectedInstrument in Zustand + setSelectedInstrument action
  - phase: 05-canvas-node-graph
    provides: CanvasRenderer, NodeLayout, INSTRUMENT_ORDER, fractional node positions
  - phase: 02-instrument-activity-analysis
    provides: InstrumentAnalysis with historyBuffer, timeInRole, edgeWeights on audioStateRef

provides:
  - NodeDetailPanel.tsx — instrument detail panel with sparkline (UI-05), pie chart (UI-06), most-active partner (UI-07), close button (UI-04)
  - CanvasRenderer.getNodeLayout() — exposes fractional node positions and logical dims for click hit detection
  - VisualizerCanvas click handler — maps CSS click coords to fractional canvas coords, detects node hits, sets selectedInstrument in Zustand

affects:
  - 07-04 (BandSetupPanel further panel work — node interaction pattern established)
  - 07-06 (key detection integration — same polling pattern)
  - Phase 8 (any future detail panels)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Mini-canvas HiDPI pattern: init with dpr on mount, clear + redraw on each 100ms poll tick
    - Fractional coordinate hit detection: clickX/rect.width → fx, compare to nodePositions[i].x
    - Ring-buffer chronological read: idx = ((head - samples + i) % 100 + 100) % 100
    - edgeKey alphabetical sort: a < b ? a_b : b_a — consistent with AnalysisState.edgeWeights format

key-files:
  created:
    - src/components/NodeDetailPanel.tsx
  modified:
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx
    - src/App.tsx

key-decisions:
  - "D-07-03-1: getNodeLayout() returns NodePosition[] reference not copy — positions array is recomputed on resize, not per-frame; returning reference is safe and zero-allocation"
  - "D-07-03-2: initMiniCanvas called on selectedInstrument change (not just mount) — canvas element may re-mount when panel appears; ensures correct dpr scaling each time"
  - "D-07-03-3: bestWeight threshold initialized at 0.3 (same as communication edge visibility threshold) — consistent with EDGE-07 minimum weight for visible partnership"
  - "D-07-03-4: timeInRole displayed live from audioStateRef in render (not setInterval state) — pie chart percentages stay current without extra state; sparkline/pie drawn on canvas via interval, text percentages read ref in render path"

patterns-established:
  - "Mini canvas polling pattern: useEffect with setInterval(100) draws to canvas refs, setInterval cleanup on selectedInstrument/unmount"
  - "Fractional hit radius 0.06 (6% of canvas width) for node click detection — matches ~48px target on 800px canvas"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 7 Plan 03: Node Detail Panel & Canvas Click-to-Select Summary

**Interactive instrument detail panel: canvas node click triggers sparkline activity history (UI-05), time-in-role pie chart (UI-06), and highest-weight communication partner (UI-07) via HiDPI mini-canvases polling audioStateRef at 100ms**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T00:44:28Z
- **Completed:** 2026-03-11T00:46:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- CanvasRenderer.getNodeLayout() exposes fractional node positions for click hit detection without breaking existing rAF loop
- VisualizerCanvas click handler converts CSS pixel coords to fractional [0,1] coords and matches against node positions with 0.06 hit radius
- NodeDetailPanel renders sparkline (200x60px, ring-buffer chronological read, indigo-400 stroke) and pie chart (80x80px, arc segments by timeInRole) with full HiDPI backing store
- Most-active partner reads edgeWeights, finds alphabetically-keyed pair with weight >= 0.3
- Close button and click-outside-nodes both set selectedInstrument to null

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose node positions from CanvasRenderer and wire click handler in VisualizerCanvas** - `4d87ecd` (feat)
2. **Task 2: Create NodeDetailPanel with sparkline, pie chart, and most-active partner** - `16ab374` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/canvas/CanvasRenderer.ts` — Added getNodeLayout() public method returning NodePosition[] and logical canvas dims
- `src/components/VisualizerCanvas.tsx` — Added INSTRUMENT_ORDER import and click handler with fractional coordinate hit detection
- `src/components/NodeDetailPanel.tsx` — Created: detail panel with HiDPI sparkline, pie chart, most-active partner, close button
- `src/App.tsx` — Added NodeDetailPanel import and render inside isFileLoaded && !isCalibrating block

## Decisions Made
- D-07-03-1: getNodeLayout() returns NodePosition[] reference not copy — safe because positions array is recomputed on resize, not per-frame
- D-07-03-2: initMiniCanvas called on selectedInstrument change — canvas element re-mounts when panel first appears; ensures correct dpr each time
- D-07-03-3: bestWeight threshold 0.3 consistent with EDGE-07 communication edge visibility minimum
- D-07-03-4: timeInRole text percentages read audioStateRef directly in render (not setInterval state) — stays current without extra state slice

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Node click-to-select fully wired: selectedInstrument in Zustand, NodeDetailPanel renders on click
- Pattern established for mini-canvas polling panels — reusable for any future per-node detail views
- No blockers for remaining Phase 7 plans (07-02 BPM/role legend already done; 07-04 BandSetup; 07-05 KeyDetector done; 07-06 key integration)

---
*Phase: 07-react-ui-panels-key-detection*
*Completed: 2026-03-11*
