---
phase: 04-beat-detection-bpm-pocket-score
plan: 03
subsystem: audio
tags: [typescript, beat-detection, rubato, pocket-score, ioi, ring-buffer, zero-allocation]

# Dependency graph
requires:
  - phase: 04-01
    provides: BeatState interface with pre-allocated ioiBuffer, pocketBuffer, drumOnsetTimes ring buffer
  - phase: 04-02
    provides: BpmTracker with updateBpm, detectBassOnset, lastDrumOnsetSec, lastBassOnsetSec

provides:
  - SwingAnalyzer.ts — IOI coefficient of variation computation and rubato gate (BEAT-05, BEAT-10)
  - PocketScorer.ts — bass-drums pocket scoring with +-80ms sync window, rolling 8-beat average (BEAT-08, BEAT-09)

affects:
  - 04-04 (AnalysisTick wiring — calls applyRubatoGate after updateBpm, then updatePocketScore)
  - Phase 5+ (Canvas renderer reads pocketScore and timingOffsetMs for edge styling)
  - Zustand bridge (reads bpm, pocketScore, ioiCV, timingOffsetMs for UI display)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-allocated ring buffer reuse: ioiBuffer and pocketBuffer read/written in-place, zero per-tick allocations"
    - "Rubato gate pattern: SwingAnalyzer computes CV then sets bpm=null; PocketScorer checks bpm===null to suppress output"
    - "Staleness + pair-gap guard: double-check on onset timestamps prevents stale pairs from contaminating rolling average"

key-files:
  created:
    - src/audio/SwingAnalyzer.ts
    - src/audio/PocketScorer.ts
  modified: []

key-decisions:
  - "D-04-03-1: RUBATO_CV_THRESHOLD=0.3 is empirical — not from MIR literature. Flagged as tunable constant in comments and 04-RESEARCH.md."
  - "D-04-03-2: computeIoiCV returns 1.0 on count<4 and ioiCount<3 — conservative default assumes rubato until enough data"
  - "D-04-03-3: pairGap > 200ms short-circuits updatePocketScore — prevents counting non-paired onsets as a sync event"
  - "D-04-03-4: applyRubatoGate sets bpm=null (not ioiCV=1.0) — downstream consumers check bpm===null for suppression, not CV"

patterns-established:
  - "Gate-then-suppress pattern: rubato gate sets bpm=null; pocket scorer checks bpm===null to zero its output"
  - "Pre-allocated IOI computation: ioiBuffer written sequentially within computeIoiCV, no temp arrays"

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 4 Plan 03: SwingAnalyzer + PocketScorer Summary

**IOI-based rubato gate (CV > 0.3 → bpm = null) and bass-drums pocket scoring within +-80ms window with rolling 8-beat average, both zero per-tick allocation**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T05:03:21Z
- **Completed:** 2026-03-11T05:06:30Z
- **Tasks:** 2
- **Files modified:** 2 created

## Accomplishments

- SwingAnalyzer computes IOI coefficient of variation from drum onset ring buffer using pre-allocated ioiBuffer, with rubato gate that sets bpm=null when CV > 0.3 (BEAT-05, BEAT-10)
- PocketScorer computes bass-drums sync score within +-80ms window using formula `1 - (|offsetMs| / 80)`, with rolling 8-beat average in pre-allocated pocketBuffer (BEAT-08)
- Timing offset stored as `timingOffsetMs = (drumOnsetSec - bassOnsetSec) * 1000` with positive = drums ahead convention (BEAT-09)
- Pocket score suppressed to 0 during rubato (bpm === null), staleness gate at 500ms, pair gap guard at 200ms
- Zero per-tick typed array allocations in both modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SwingAnalyzer with IOI CV computation and rubato gate** - `41d9efe` (feat)
2. **Task 2: Create PocketScorer with sync scoring, rolling average, timing offset** - `4965c5f` (feat)

## Files Created/Modified

- `src/audio/SwingAnalyzer.ts` — IOI CV computation from drum onset ring buffer, rubato gate setting bpm=null when CV > RUBATO_CV_THRESHOLD (0.3)
- `src/audio/PocketScorer.ts` — Bass-drums sync scoring within +-80ms, rolling 8-beat average in pre-allocated pocketBuffer, rubato suppression

## Decisions Made

- **D-04-03-1:** RUBATO_CV_THRESHOLD=0.3 is empirical, not from MIR literature — flagged as tunable in comments to signal it needs calibration against real jazz recordings
- **D-04-03-2:** computeIoiCV returns 1.0 conservatively on count<4 and ioiCount<3 — defaults to assuming rubato until sufficient onset data accumulates
- **D-04-03-3:** pairGap guard at 200ms in updatePocketScore prevents onsets that don't form a musical pair from producing a sync score
- **D-04-03-4:** applyRubatoGate sets bpm=null (not a rubato flag or high ioiCV) — downstream pocket scorer and UI check bpm===null as the single suppression signal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SwingAnalyzer and PocketScorer ready to be wired into AnalysisTick (04-04)
- Call order in AnalysisTick: updateBpm → applyRubatoGate → updatePocketScore (bpm=null must be set before pocket score runs)
- pocketScore, timingOffsetMs, ioiCV, bpm all ready for Zustand bridge read in 04-04
- Phase 5+ Canvas renderer can read timingOffsetMs for edge color intensity on bass-drums connection

---
*Phase: 04-beat-detection-bpm-pocket-score*
*Completed: 2026-03-10*
