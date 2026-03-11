---
phase: 02-instrument-activity-analysis
plan: 05
subsystem: ui
tags: [react, zustand, tailwind, canvas, audio-analysis]

# Dependency graph
requires:
  - phase: 02-instrument-activity-analysis
    provides: "Zustand instrumentRoles map populated by CanvasRenderer/AnalysisTick pipeline (02-01 through 02-04)"
provides:
  - "InstrumentRoleOverlay component reading Zustand instrumentRoles and audioStateRef activity scores"
  - "Phase 2 verification gap closed — role labels visible to user during playback"
affects:
  - phase-05-canvas-node-graph (replaces this overlay with proper canvas nodes)
  - phase-07-react-panels (replaces with full panel components)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hybrid Zustand+ref UI pattern: role labels (occasional changes) via Zustand re-renders; activity scores (high-frequency numeric) via 100ms setInterval polling audioStateRef — avoids continuous Zustand mutations for hot-path data"

key-files:
  created:
    - src/components/InstrumentRoleOverlay.tsx
  modified:
    - src/App.tsx

key-decisions:
  - "D-02-05-1: Activity scores polled from audioStateRef via 100ms interval instead of Zustand — scores change every 10fps tick, routing through Zustand would cause constant store mutations for numeric-only data that doesn't drive routing/logic"
  - "D-02-05-2: !isCalibrating guard on InstrumentRoleOverlay — analysis state (audioStateRef.current.analysis) is null until calibration completes; guard prevents interval from polling undefined"

patterns-established:
  - "Hybrid Zustand+ref UI pattern: use Zustand for low-frequency state changes that need re-renders (role labels), use ref polling via setInterval for high-frequency numeric display values"

# Metrics
duration: 1m 24s
completed: 2026-03-11
---

# Phase 2 Plan 05: InstrumentRoleOverlay Gap Closure Summary

**Disposable React overlay displaying per-instrument role badges (soloing/comping/holding/silent) and activity score bars by reading Zustand instrumentRoles and polling audioStateRef at ~10fps — closes Phase 2 visibility gap**

## Performance

- **Duration:** 1m 24s
- **Started:** 2026-03-11T03:00:02Z
- **Completed:** 2026-03-11T03:01:26Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Created InstrumentRoleOverlay component with 4 instrument cards (bass, drums, keyboard, guitar)
- Role badges with distinct colors: soloing=amber (#f59e0b), comping=blue (#3b82f6), holding=gray (#6b7280), silent=dark (#1f2937)
- Activity bars fill to activityScore percentage with 80ms CSS transition for smooth ~10fps updates
- Zustand instrumentRoles map is no longer orphaned — component consumes it, triggering re-renders on role changes
- Wired into App.tsx below canvas with !isCalibrating guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Create InstrumentRoleOverlay component** - `c1d733b` (feat)
2. **Task 2: Wire InstrumentRoleOverlay into App.tsx** - `fd64e81` (feat)

**Plan metadata:** `(pending docs commit)` (docs: complete plan)

## Files Created/Modified
- `src/components/InstrumentRoleOverlay.tsx` - Minimal Phase 2 gap closure overlay; reads Zustand roles + polls audioStateRef activity scores at 100ms
- `src/App.tsx` - Import + render InstrumentRoleOverlay below VisualizerCanvas, guarded by !isCalibrating

## Decisions Made
- **D-02-05-1:** Activity scores read from audioStateRef via 100ms setInterval, not Zustand — scores update every 10fps tick and are purely numeric display values. Routing them through Zustand would cause continuous store mutations with no benefit (nothing else subscribes to exact score values).
- **D-02-05-2:** !isCalibrating guard prevents the interval from trying to read `audioStateRef.current.analysis?.instruments` before `initAnalysisState` has been called (which happens after calibration resolves in App.tsx).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 is fully complete. All INST-01 through INST-09 truths satisfied.
- Phase 2 verification truth "Role labels update at ~10fps and are recognizably correct on a real jazz recording — visible to the user" is now satisfiable by visual inspection during playback.
- InstrumentRoleOverlay is explicitly marked TEMPORARY — Phase 5 Canvas Node Graph replaces it with proper canvas-rendered instrument nodes; Phase 7 React panels replace it with full detail components.
- Ready to proceed to Phase 3 (Chord Detection).

---
*Phase: 02-instrument-activity-analysis*
*Completed: 2026-03-11*
