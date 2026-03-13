---
phase: 14-tech-debt-and-polish
plan: 01
subsystem: canvas
tags: [typescript, canvas, zustand, edge-rendering, tech-debt]

# Dependency graph
requires:
  - phase: 13-visual-family-identity
    provides: drawCommunicationEdges with EDGE_TYPE lookup and beatPulseIntensity parameter
  - phase: 06-edge-visualization
    provides: EdgeType, EDGE_TYPE table, and pair key system
provides:
  - Crash-safe pair key validation guard in drawCommunicationEdges
  - Removal of dead '?? support' fallback (DEBT-01)
  - Malformed key warning + skip pattern (DEBT-02)
  - Reactive lineup selector in VisualizerCanvas (DEBT-03)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KEY_PATTERN regex guard before Record lookup — validate format then presence before indexing"
    - "Reactive Zustand selector at component level so useEffect dep array stays accurate"

key-files:
  created: []
  modified:
    - src/canvas/edges/drawCommunicationEdges.ts
    - src/components/VisualizerCanvas.tsx

key-decisions:
  - "KEY_PATTERN validates both format (lowercase_lowercase) and presence in EDGE_TYPE — two-condition guard"
  - "guard placed at Step 6 just before EDGE_TYPE lookup — after all coordinate math so continue skips only the write into render buffer"
  - "lineup reactive selector placed at component level, not inside useEffect — React rules of hooks requires selectors at component scope"

patterns-established:
  - "Record lookup safety: validate key format + key-in-record before indexing, never use fallback operator on known tables"
  - "Zustand selector vs getState(): use reactive selector (useAppStore(s => s.x)) for values the effect should re-run on; use getState() only for fire-and-forget callbacks"

# Metrics
duration: 1min
completed: 2026-03-12
---

# Phase 14 Plan 01: Tech Debt Audit (DEBT-01, DEBT-02, DEBT-03) Summary

**Pair key crash guard with warn+continue replaces dead '?? support' fallback, and VisualizerCanvas reads lineup reactively so hot-swapping recordings triggers a proper renderer rebuild**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-13T03:47:57Z
- **Completed:** 2026-03-13T03:48:57Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- DEBT-01: Removed the `?? 'support'` fallback — valid EDGE_TYPE keys now resolve strictly with no silent type coercion
- DEBT-02: Malformed pair keys (wrong format or not in EDGE_TYPE) now log a `console.warn` and `continue`, preventing canvas crashes from bad data
- DEBT-03: `VisualizerCanvas` reads lineup via a reactive Zustand selector at component level; effect re-runs on lineup change and properly rebuilds the renderer

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pair key guard and remove fallback (DEBT-01 + DEBT-02)** - `28033ad` (fix)
2. **Task 2: Make lineup reactive in VisualizerCanvas (DEBT-03)** - `04a0108` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/canvas/edges/drawCommunicationEdges.ts` - Added KEY_PATTERN constant; replaced fallback with guard + warn + continue at Step 6
- `src/components/VisualizerCanvas.tsx` - Moved lineup read from getState() inside effect to reactive selector at component scope; added lineup to dep array

## Decisions Made

- KEY_PATTERN placed before VisualState type (near top of file, after imports) — keeps validation constants co-located with module-level buffers
- Guard inserted at Step 6 (just before the EDGE_TYPE lookup), not at the top of the loop — coordinate math and weight smoothing still run for all pairs; only the render buffer write is skipped for invalid keys
- lineup selector placed at component level above the useEffect — React rules of hooks prohibits hooks inside effects; getState() was the only workaround before, now unnecessary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Three tech debt items from v1.1 audit are closed
- drawCommunicationEdges is safe for any lineup data including malformed inputs from future recordings
- VisualizerCanvas will correctly react to lineup changes without requiring a full component remount
- No blockers for remaining Phase 14 plans

---
*Phase: 14-tech-debt-and-polish*
*Completed: 2026-03-12*
