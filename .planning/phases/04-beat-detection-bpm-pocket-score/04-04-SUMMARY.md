---
phase: 04-beat-detection-bpm-pocket-score
plan: 04
subsystem: ui
tags: [zustand, typescript, beat-detection, bpm, pocket-score, canvas-renderer]

# Dependency graph
requires:
  - phase: 04-01
    provides: DrumTransientDetector with initBeatState, computeDrumFlux, detectDrumOnset
  - phase: 04-02
    provides: BpmTracker with updateBpm, detectBassOnset; SwingAnalyzer with applyRubatoGate
  - phase: 04-03
    provides: PocketScorer with updatePocketScore; BeatState type on AudioStateRef

provides:
  - Phase 4 beat tick wired into AnalysisTick.ts 10fps orchestrator
  - onBeatUpdate callback chain: AnalysisTick -> CanvasRenderer -> VisualizerCanvas -> Zustand
  - Zustand store fields: currentBpm (number|null), pocketScore (0.0-1.0), timingOffsetMs
  - setBeatInfo action; reset() clears Phase 4 state
  - ChordDisplay BPM readout (BEAT-05: "♩ = —" when null) and pocket score display

affects:
  - 05-canvas-node-graph (reads lastDownbeatSec and beatCounter from audioStateRef.current.beat)
  - future phases consuming currentBpm or pocketScore from Zustand

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Phase N callback chain: AnalysisTick param -> CanvasRenderer field + setter -> VisualizerCanvas wire -> Zustand
    - Beat tick guard pattern: if (state.beat) mirrors if (state.chord && state.tension)
    - Band lookup by name: state.bands.find(b => b.name === '...') not hardcoded bin indices

key-files:
  created: []
  modified:
    - src/audio/AnalysisTick.ts
    - src/App.tsx
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx
    - src/store/useAppStore.ts
    - src/components/ChordDisplay.tsx

key-decisions:
  - "D-04-04-1: onBeatUpdate callback chain goes through CanvasRenderer (setOnBeatUpdate method) and VisualizerCanvas — matches the existing pattern for onRoleChange/onChordChange/onTensionUpdate; App.tsx does not call runAnalysisTick directly"
  - "D-04-04-2: lastDownbeatSec and beatCounter stay on audioStateRef.current.beat (not Zustand) — Phase 5 canvas renderer reads them at 60fps, pushing to Zustand would cause excessive re-renders"
  - "D-04-04-3: onBeatUpdate fires only when BPM or pocket score changes (not every tick) — matches onChordChange pattern; prevents continuous Zustand mutations during steady-state"

patterns-established:
  - "Callback chain for per-analysis-tick data: AnalysisTick optional param -> CanvasRenderer private field + public setter -> VisualizerCanvas wire in useEffect -> Zustand getState() call"
  - "Phase initialization order in App.tsx: analysis state -> chord state -> tension state -> beat state, each after calibration completes"

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 4 Plan 04: Beat Detection Wiring Summary

**Phase 4 beat tick fully wired: drum onset -> bass onset -> BPM autocorrelation -> rubato gate -> pocket score, bridged to Zustand via onBeatUpdate callback chain and displayed in ChordDisplay**

## Performance

- **Duration:** ~2m 43s
- **Started:** 2026-03-11T05:07:09Z
- **Completed:** 2026-03-11T05:09:52Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- All four Phase 4 modules (DrumTransientDetector, BpmTracker, SwingAnalyzer, PocketScorer) integrated into 10fps AnalysisTick in correct call order
- Full Zustand bridge for BPM, pocket score, and timing offset via onBeatUpdate callback chain through CanvasRenderer and VisualizerCanvas
- ChordDisplay shows "♩ = —" in gray when BPM is null (rubato/no data), "♩ = N" in white when available, with color-coded pocket score hidden during rubato

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Phase 4 beat tick to AnalysisTick.ts** - `163119b` (feat)
2. **Task 2: Extend Zustand store with BPM, pocket score, timing offset** - `1590486` (feat)
3. **Task 3: Add BPM display to ChordDisplay component** - `d8590e8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/audio/AnalysisTick.ts` - Added Phase 4 imports, extended signature with onBeatUpdate, added Phase 4 beat block after Phase 3; bands looked up by name; no new typed array allocations
- `src/App.tsx` - Added initBeatState import; initializes audioStateRef.current.beat after tension state
- `src/canvas/CanvasRenderer.ts` - Added onBeatUpdate private field, setOnBeatUpdate setter, passes onBeatUpdate to runAnalysisTick
- `src/components/VisualizerCanvas.tsx` - Wires setOnBeatUpdate callback to useAppStore.getState().setBeatInfo
- `src/store/useAppStore.ts` - Added currentBpm, pocketScore, timingOffsetMs fields; setBeatInfo action; reset() clears Phase 4 fields
- `src/components/ChordDisplay.tsx` - Added currentBpm and pocketScore selectors; BPM readout with BEAT-05 null rendering; pocket score with color coding; hidden when BPM is null

## Decisions Made

- **D-04-04-1:** onBeatUpdate callback chain routes through CanvasRenderer (setOnBeatUpdate method) and VisualizerCanvas — matches the existing Phase 2/3 pattern for role/chord/tension callbacks. App.tsx does not call runAnalysisTick directly.
- **D-04-04-2:** lastDownbeatSec and beatCounter remain on audioStateRef.current.beat (not pushed to Zustand) — Phase 5 canvas renderer reads them at 60fps; Zustand would cause excessive re-renders for frame-rate data.
- **D-04-04-3:** onBeatUpdate fires only when BPM or pocket score changes (prevBpm/prevPocket check), not every tick — consistent with onChordChange pattern, prevents continuous Zustand mutations during steady-state playback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added onBeatUpdate wiring through CanvasRenderer and VisualizerCanvas**

- **Found during:** Task 1 (wiring onBeatUpdate in App.tsx)
- **Issue:** Plan specified wiring onBeatUpdate at the "runAnalysisTick call site in App.tsx" but App.tsx does not call runAnalysisTick — it's called from CanvasRenderer.ts (discovered by grepping). The plan described the intent (Zustand bridge) but the actual call site is in CanvasRenderer's rAF loop.
- **Fix:** Added onBeatUpdate field and setOnBeatUpdate() method to CanvasRenderer; passed it to runAnalysisTick in the render loop; wired the callback in VisualizerCanvas using the exact same pattern as setOnTensionUpdate.
- **Files modified:** src/canvas/CanvasRenderer.ts, src/components/VisualizerCanvas.tsx
- **Verification:** TypeScript compiles with zero errors; callback chain is complete AnalysisTick -> CanvasRenderer -> VisualizerCanvas -> Zustand
- **Committed in:** 163119b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking: call site was in CanvasRenderer not App.tsx)
**Impact on plan:** Fix was necessary for correct operation; the intent of the plan (Zustand bridge for BPM data) is fully realized. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 is now complete (all 4 plans done): drum onset, bass onset, BPM autocorrelation, rubato gate, pocket score, and Zustand bridge all wired
- Phase 5 (canvas node graph) can read lastDownbeatSec and beatCounter directly from audioStateRef.current.beat for beat-synchronized visual effects
- Phase 5 can also read currentBpm and pocketScore from Zustand for UI overlays
- No blockers for Phase 5

---
*Phase: 04-beat-detection-bpm-pocket-score*
*Completed: 2026-03-10*
