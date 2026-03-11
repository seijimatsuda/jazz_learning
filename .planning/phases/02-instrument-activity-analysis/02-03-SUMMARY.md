---
phase: 02-instrument-activity-analysis
plan: 03
subsystem: audio
tags: [meyda, typescript, spectral-flux, zcr, disambiguation, frequency-analysis]

# Dependency graph
requires:
  - phase: 02-01
    provides: AnalysisState with pre-allocated rawTimeDataFloat and prevRawFreqData buffers; InstrumentAnalysis types
  - phase: 01-audio-pipeline-foundation
    provides: fftSize=4096 fixed, AnalyserNode frequency data as Uint8Array

provides:
  - KbGuitarDisambiguator.ts with computeSpectralFlux (hand-rolled), computeZcr (Meyda), and disambiguate()
  - Weight pair (keyboardWeight, guitarWeight) clamped to [0.15, 0.85] for safe per-instrument scaling

affects:
  - 02-04-PLAN (role classification will use disambiguate() to weight mid-range instrument activity)
  - Any future phase that reads per-instrument activity scores for keyboard or guitar

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled feature extraction when library implementation is known-broken"
    - "Pre-allocated buffer threading — pass AnalysisState buffers through; never allocate in hot path"
    - "Clamped weight pairs — sum is ~1.0 but clamped to [min, max] to prevent full suppression"

key-files:
  created:
    - src/audio/KbGuitarDisambiguator.ts
  modified: []

key-decisions:
  - "D-02-03-1: computeSpectralFlux is hand-rolled (Meyda 5.6.3 spectralFlux extractor has negative index bug, returns 0/NaN)"
  - "D-02-03-2: Flux normalization constant 5000 is empirical starting value — flagged for tuning in later phase"
  - "D-02-03-3: Weight clamping to [0.15, 0.85] applied separately to each weight (not enforced to sum to 1.0 exactly) — safety margin takes priority over mathematical purity"

patterns-established:
  - "Meyda ZCR pattern: always set Meyda.bufferSize and Meyda.sampleRate before calling Meyda.extract('zcr', ...)"
  - "Half-wave rectified spectral flux: only positive diffs (energy increases) counted — aligns with onset detection literature"

# Metrics
duration: 1min
completed: 2026-03-11
---

# Phase 2 Plan 03: KbGuitarDisambiguator Summary

**Hand-rolled spectral flux + Meyda ZCR disambiguation module producing [0.15, 0.85]-clamped keyboard/guitar weight pair, avoiding Meyda 5.6.3 spectralFlux bug entirely**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-11T01:27:13Z
- **Completed:** 2026-03-11T01:28:21Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `KbGuitarDisambiguator.ts` with `computeSpectralFlux` (hand-rolled half-wave rectified), `computeZcr` (Meyda-based), and `disambiguate()` returning clamped weight pair
- Zero typed array allocations — all buffers are pre-allocated AnalysisState refs threaded through the call chain
- File header prominently documents the Meyda 5.6.3 spectralFlux bug as a WARNING so future developers don't accidentally re-introduce it

## Task Commits

Each task was committed atomically:

1. **Task 1: Create KbGuitarDisambiguator with hand-rolled spectral flux and Meyda ZCR** - `528f1bb` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified

- `src/audio/KbGuitarDisambiguator.ts` - Keyboard vs guitar disambiguation: hand-rolled spectralFlux, Meyda ZCR, clamped weight pair

## Decisions Made

- **D-02-03-1:** `computeSpectralFlux` is hand-rolled rather than using `Meyda.extract('spectralFlux')` because Meyda 5.6.3 has a confirmed negative index bug that returns 0 or NaN. This deviation from Meyda's API is intentional and documented with a WARNING comment.
- **D-02-03-2:** Flux normalization constant `5000` is used as the empirical starting value per the research open question #1. This will require tuning against real jazz recordings in a later phase.
- **D-02-03-3:** Clamping to `[0.15, 0.85]` is applied independently to each weight (not enforced to sum to exactly 1.0). At extreme disambiguation signals, the sum may be slightly above 1.0 (e.g., 0.85 + 0.15 = 1.0 exactly at the boundary, but 0.85 + max(0.15, 0.05) = 1.0 too). Safety margin takes priority over mathematical purity — this is documented in the function JSDoc.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `disambiguate()` is ready for use in 02-04 (RoleClassifier) to weight mid-range instrument activity between keyboard and guitar
- Caller must convert `rawTimeData` (Uint8Array) into `AnalysisState.rawTimeDataFloat` (Float32Array, values in [-1, 1]) before calling `computeZcr` or `disambiguate` — this is a caller responsibility documented in JSDoc
- Flux normalization constant (5000) flagged for empirical tuning — safe to defer to a post-Phase-2 calibration pass

---
*Phase: 02-instrument-activity-analysis*
*Completed: 2026-03-11*
