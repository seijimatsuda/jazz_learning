---
phase: 02-instrument-activity-analysis
plan: 01
subsystem: audio
tags: [typescript, web-audio, float32array, ring-buffer, ema-smoothing, frequency-analysis, instrument-classification]

# Dependency graph
requires:
  - phase: 01-audio-pipeline-foundation
    provides: FrequencyBand types, getBandEnergy(), CalibrationThresholds, AudioStateRef, pre-allocated typed array patterns
provides:
  - RoleLabel type ('soloing' | 'comping' | 'holding' | 'silent')
  - InstrumentAnalysis interface with activityScore, role, ring buffer history, timeInRole
  - AnalysisState interface with instruments[], edgeWeights, prevRawFreqData, rawTimeDataFloat
  - analysis: AnalysisState | null field on AudioStateRef
  - InstrumentActivityScorer module: band mapping, INST-05 fallback, EMA-smoothed scoring, ring buffer, init factory
affects:
  - 02-02 (RoleClassifier reads InstrumentAnalysis and AnalysisState)
  - 02-03 (KbGuitarDisambiguator reads prevRawFreqData, rawTimeDataFloat from AnalysisState)
  - 02-04 (CrossCorrelationTracker reads historyBuffer, historyHead, historySamples from InstrumentAnalysis)
  - 03 (chord/tension analysis reads analysis.instruments[].role)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All AnalysisState typed arrays pre-allocated in initAnalysisState — zero allocations per tick"
    - "INST-05 fallback: single mid-range instrument claims both 'mid' and 'mid_high' bands"
    - "EMA smoothing alpha=0.7 on activity scores — snappy response at 10fps"
    - "Circular ring buffer for 10s history (100 slots at 10fps) using Float32Array"

key-files:
  created:
    - src/audio/InstrumentActivityScorer.ts
  modified:
    - src/audio/types.ts

key-decisions:
  - "D-02-01-1: RoleLabel union type in types.ts (not enum) — matches existing type convention in codebase"
  - "D-02-01-2: prevRawFreqData and rawTimeDataFloat on AnalysisState (not separate fields on AudioStateRef) — keeps analysis state cohesive"
  - "D-02-01-3: smoothingAlpha=0.7 as default — snappy 10fps response; callers can override"

patterns-established:
  - "Band resolution: resolveBandsForInstrument() abstracts INST-05 fallback, lineup-aware, pure function"
  - "initAnalysisState: single factory creates entire analysis state with all pre-allocated buffers"
  - "pushHistory: O(1) circular buffer write — no array shifting or reallocation"

# Metrics
duration: 2m 7s
completed: 2026-03-11
---

# Phase 2 Plan 01: Instrument Activity Analysis Types and Scorer Summary

**Per-instrument activity scoring foundation: RoleLabel/InstrumentAnalysis/AnalysisState types in types.ts, InstrumentActivityScorer with INST-05 band fallback, EMA-smoothed scoring normalized by calibration peaks, circular ring buffer history, and pre-allocated init factory (zero per-tick allocations)**

## Performance

- **Duration:** 2m 7s
- **Started:** 2026-03-11T01:22:53Z
- **Completed:** 2026-03-11T01:25:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended types.ts with RoleLabel, InstrumentAnalysis, AnalysisState — defining the data shape all Phase 2 modules (RoleClassifier, KbGuitarDisambiguator, CrossCorrelationTracker) will read/write
- Created InstrumentActivityScorer with INST-05 single-instrument fallback (keyboard or guitar alone claims full mid-range ['mid','mid_high'])
- Pre-allocated all Float32Array and Uint8Array buffers in initAnalysisState() — zero allocations during the 10fps analysis tick

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types.ts with Phase 2 analysis types** - `c7e5feb` (feat)
2. **Task 2: Create InstrumentActivityScorer with band mapping, scoring, history, and init** - `1b4000d` (feat)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified
- `src/audio/types.ts` - Added RoleLabel, InstrumentAnalysis, AnalysisState types; added analysis: AnalysisState | null to AudioStateRef; initialized analysis: null in createInitialAudioState()
- `src/audio/InstrumentActivityScorer.ts` - InstrumentName type, INSTRUMENT_BAND_MAP, resolveBandsForInstrument (INST-05), computeActivityScore (EMA + calibration normalization), pushHistory (ring buffer), initAnalysisState (pre-allocated factory)

## Decisions Made
- **D-02-01-1:** RoleLabel as union type (not enum) — matches existing type conventions in types.ts
- **D-02-01-2:** prevRawFreqData and rawTimeDataFloat placed on AnalysisState (not as separate top-level AudioStateRef fields) — keeps analysis-related state cohesive under one nullable object
- **D-02-01-3:** smoothingAlpha=0.7 as default parameter — provides snappy 10fps response while allowing callers to override for smoother behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AnalysisState type shape defined — RoleClassifier (02-02), KbGuitarDisambiguator (02-03), and CrossCorrelationTracker (02-04) can all proceed
- initAnalysisState() ready to wire into AudioEngine or CanvasRenderer after file load
- resolveBandsForInstrument() handles both quartet and trio lineups correctly
- All typed arrays pre-allocated — no GC pressure risk during playback

---
*Phase: 02-instrument-activity-analysis*
*Completed: 2026-03-11*
