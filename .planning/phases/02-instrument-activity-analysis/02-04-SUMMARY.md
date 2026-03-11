---
phase: 02-instrument-activity-analysis
plan: "04"
subsystem: audio
tags: [cross-correlation, pearson-r, analysis-tick, canvas-renderer, zustand, typed-arrays]

# Dependency graph
requires:
  - phase: 02-01
    provides: InstrumentActivityScorer with computeActivityScore, pushHistory, initAnalysisState
  - phase: 02-02
    provides: RoleClassifier with classifyRole, updateTimeInRole, hysteresis state machine
  - phase: 02-03
    provides: KbGuitarDisambiguator with disambiguate, computeSpectralFlux, computeZcr
  - phase: 01-audio-pipeline-foundation
    provides: AudioEngine allocateTypedArrays, CanvasRenderer rAF loop, AudioStateRef types
provides:
  - CrossCorrelationTracker.ts with pearsonR (2-second window) and computeEdgeWeight (0.3 suppression)
  - AnalysisTick.ts orchestrating all Phase 2 modules at 10fps
  - CanvasRenderer 10fps analysis gate via performance.now() inside rAF loop
  - App.tsx analysis state initialization in runCalibrationPass .then() chain
  - VisualizerCanvas.tsx role change callback wired to Zustand
  - useAppStore.ts instrumentRoles map for UI role label consumption
  - rawTimeData buffer size fix in AudioEngine.ts (fftSize, not fftSize/2)
affects:
  - Phase 3 (chord detection) — AnalysisState.edgeWeights and instrumentRoles available as inputs
  - Phase 7 (BandSetupPanel UI) — lineup currently hardcoded as ['bass', 'drums', 'keyboard', 'guitar']
  - All future phases reading Zustand instrumentRoles for UI display

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "10fps analysis gate: performance.now() delta check in rAF loop (not setInterval)"
    - "Role change bridge: onRoleChange callback from CanvasRenderer to Zustand via VisualizerCanvas"
    - "Zero-allocation tick: all typed arrays pre-allocated in initAnalysisState, reused each tick"
    - "Circular buffer read-back: (head - 1 - i + 100) % 100 for most-recent-first access"

key-files:
  created:
    - src/audio/CrossCorrelationTracker.ts
    - src/audio/AnalysisTick.ts
  modified:
    - src/audio/AudioEngine.ts
    - src/canvas/CanvasRenderer.ts
    - src/App.tsx
    - src/components/VisualizerCanvas.tsx
    - src/store/useAppStore.ts

key-decisions:
  - "CORR_WINDOW=20 (2 seconds at 10fps) — enough window to detect groove lock-in but short enough to track dynamic role shifts"
  - "Edge suppression threshold 0.3 — preserves sign (positive=co-activating, negative=alternating) while suppressing noise"
  - "rawTimeData allocation fixed to fftSize (not fftSize/2) — getByteTimeDomainData fills fftSize bytes"
  - "Lineup hardcoded as jazz quartet for Phase 2 — Phase 7 adds BandSetupPanel UI"
  - "Role changes push to Zustand ONLY when role actually changes — not every tick — minimizes re-renders"

patterns-established:
  - "Analysis tick: guard all required state fields before entering; return early if missing"
  - "10fps gate: performance.now() in rAF, update lastAnalysisMs before calling tick function"
  - "Zustand bridge: useAppStore.getState() (not hook) from within rAF callback — safe for non-React contexts"

# Metrics
duration: 3m 4s
completed: 2026-03-11
---

# Phase 2 Plan 04: Analysis Coordinator Summary

**Pearson r cross-correlation tracker, 10fps AnalysisTick orchestrator, and full end-to-end Phase 2 pipeline wiring from FFT data to Zustand role labels**

## Performance

- **Duration:** 3m 4s
- **Started:** 2026-03-11T01:30:53Z
- **Completed:** 2026-03-11T01:33:57Z
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- CrossCorrelationTracker with Pearson r over 2-second circular buffer window (INST-06, INST-07)
- AnalysisTick orchestrator running all four Phase 2 modules in correct order at 10fps
- Full pipeline wired: file load → calibration → analysis init → rAF loop → FFT → activity scores → roles → disambiguation → cross-correlation → Zustand UI
- rawTimeData buffer size bug fixed in AudioEngine.ts (was fftSize/2, now correctly fftSize)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CrossCorrelationTracker** - `a5725d9` (feat)
2. **Task 2: Wire Phase 2 analysis pipeline end-to-end** - `ac13bfa` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/audio/CrossCorrelationTracker.ts` — Pearson r with 2-second sliding window, edge suppression below 0.3
- `src/audio/AnalysisTick.ts` — 10fps orchestrator: FFT pull → scoring → roles → disambiguation → cross-correlation
- `src/audio/AudioEngine.ts` — Fixed rawTimeData allocation from fftSize/2 to fftSize
- `src/canvas/CanvasRenderer.ts` — Added 10fps analysis gate, setOnRoleChange setter, RoleLabel import
- `src/App.tsx` — Added analysis state initialization in runCalibrationPass .then() chain
- `src/components/VisualizerCanvas.tsx` — Wired setOnRoleChange callback to Zustand store
- `src/store/useAppStore.ts` — Added instrumentRoles map and setInstrumentRole action

## Decisions Made

- **D-02-04-1:** CORR_WINDOW=20 (2 seconds at 10fps) — long enough to detect groove patterns, short enough to track dynamic changes within solos
- **D-02-04-2:** rawTimeData fix classified as Rule 1 bug — getByteTimeDomainData truncated to half the expected buffer, causing KbGuitarDisambiguator to receive incomplete time-domain data
- **D-02-04-3:** Lineup hardcoded as jazz quartet ['bass', 'drums', 'keyboard', 'guitar'] for Phase 2 — Phase 7 will add BandSetupPanel UI for configuring lineup before load
- **D-02-04-4:** Role changes push to Zustand only on actual change (not every 10fps tick) — prevents continuous Zustand mutations and unnecessary React re-renders during steady-state playback

## Deviations from Plan

The rawTimeData buffer fix was specified in the plan itself (not discovered during execution), so there were no unplanned deviations. The plan explicitly called out the buffer size bug and instructed the fix as part of Task 2.

None - plan executed exactly as written (the rawTimeData fix was pre-documented in the plan).

## Issues Encountered

None — TypeScript check passed with zero errors on first attempt for both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 2 requirements INST-01 through INST-09 are satisfied:
- INST-01: activity scores per instrument at 10fps
- INST-02: role classification with hysteresis
- INST-03: keyboard/guitar disambiguation via ZCR and spectral flux
- INST-04: band assignment including INST-05 fallback for single mid-range instrument
- INST-05: fallback band coverage when only one of keyboard/guitar is in lineup
- INST-06: cross-correlation Pearson r with 2-second window
- INST-07: edge suppression below 0.3
- INST-08: 10-second rolling history (100 slots at 10fps)
- INST-09: cumulative time-in-role tracking

Phase 3 (chord detection) can consume:
- `audioStateRef.current.analysis.instruments[n].role` for role context
- `audioStateRef.current.analysis.edgeWeights` for instrument interaction graph
- `useAppStore.getState().instrumentRoles` for current role labels in UI

Blocker for Phase 7: lineup is hardcoded as quartet. BandSetupPanel UI (Phase 7) must call `initAnalysisState` with user-configured lineup before playback.

---
*Phase: 02-instrument-activity-analysis*
*Completed: 2026-03-11*
