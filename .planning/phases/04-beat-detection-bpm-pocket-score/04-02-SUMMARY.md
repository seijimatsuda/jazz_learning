---
phase: 04-beat-detection-bpm-pocket-score
plan: 02
subsystem: audio
tags: [autocorrelation, bpm, onset-detection, beat-tracking, spectral-flux, typescript]

# Dependency graph
requires:
  - phase: 04-01
    provides: BeatState interface with all pre-allocated buffers; DrumTransientDetector with adaptiveThreshold, ossBuffer population
  - phase: 01-audio-pipeline-foundation
    provides: FrequencyBand type and pre-allocated Uint8Array rawFreqData

provides:
  - BpmTracker.ts with autocorrelation BPM derivation over 6-second OSS ring buffer
  - runAutocorrelation writing into pre-allocated acBuffer (length 30)
  - extractBpm with lag search 3-12 (50-200 BPM) and swing double-tempo check (BEAT-06)
  - updateBpm called per-tick, running AC every 20 ticks with 3-slot median smoothing
  - computeBassRmsDelta half-wave rectified RMS delta over bass band (BEAT-03)
  - detectBassOnset with 80ms debounce and kick bleed suppression

affects:
  - 04-03-rubato-suppression (reads beat.bpm, beat.ioiCV)
  - 04-04-pocket-score (reads beat.lastBassOnsetSec, beat.bpm for scoring)
  - AnalysisTick (calls updateBpm, detectBassOnset per tick)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "bassAdaptiveThreshold: local variant of adaptiveThreshold operating on bassFluxBuffer rather than drumFluxBuffer"
    - "Ring buffer linearization: (head - samples + CAP*2) % CAP for correct autocorrelation start index"
    - "Swing check: AC[2*lag] > 0.6 * AC[lag] indicates sub-beat candidate; use 2*lag as true period"
    - "Kick bleed suppression via drum mean flux gate (drumFlux > mean*0.8*MULTIPLIER)"

key-files:
  created:
    - src/audio/BpmTracker.ts
  modified: []

key-decisions:
  - "D-04-02-1: bassAdaptiveThreshold is a local helper in BpmTracker.ts (not exported from DrumTransientDetector) — DrumTransientDetector.adaptiveThreshold reads from beat.drumFluxBuffer specifically; bass needs separate buffer traversal"
  - "D-04-02-2: Kick bleed suppression uses drum mean flux * 0.8 * MULTIPLIER rather than importing adaptiveThreshold — avoids cross-module coupling and keeps kick gate tunable independently"
  - "D-04-02-3: vals[] (3-element sort array) created every 2 seconds in updateBpm — explicitly accepted per 04-RESEARCH.md per-frame allocation guidance; 2s cadence is negligible GC"

patterns-established:
  - "BPM derivation: autocorrelation over OSS ring buffer, updated every 2 seconds (not per-tick)"
  - "Swing check pattern: if AC at 2x lag is >= 60% of best, use 2x lag as true period"
  - "Bass onset uses separate flux buffer with same counter cadence as drum flux"

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 4 Plan 02: BpmTracker Summary

**Autocorrelation BPM derivation over 6-second OSS ring buffer with BEAT-06 swing check, bass RMS onset detection (BEAT-03), 80ms debounce, and 3-slot median smoothing (BEAT-04)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T04:59:24Z
- **Completed:** 2026-03-11T05:02:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- BpmTracker.ts created with all 5 required exports and zero TypeScript errors
- Autocorrelation (runAutocorrelation) writes into pre-allocated acBuffer, no allocations
- BPM gated to null for first 2 seconds (MIN_OSS_SAMPLES=20), updated only every 20 ticks (BEAT-04)
- Swing double-tempo check prevents 2x BPM false-positive in jazz (BEAT-06)
- Bass onset detection with half-wave rectified RMS delta and 80ms debounce (BEAT-03)
- Local bassAdaptiveThreshold avoids coupling to DrumTransientDetector's BeatState-bound signature

## Task Commits

1. **Task 1: Create BpmTracker with autocorrelation, swing check, bass onset, BPM smoothing** - `87357d2` (feat)

## Files Created/Modified

- `src/audio/BpmTracker.ts` - All BPM derivation: runAutocorrelation, extractBpm, updateBpm, computeBassRmsDelta, detectBassOnset

## Decisions Made

- **D-04-02-1:** `adaptiveThreshold` in DrumTransientDetector.ts takes a full `BeatState` object and reads `beat.drumFluxBuffer` internally. The plan's `detectBassOnset` code called it with `(beat.bassFluxBuffer, beat.drumFluxSamples)` which would fail TypeScript. Wrote a local `bassAdaptiveThreshold` helper that takes the buffer and sample count explicitly, matching the same mean + 1.5*stddev formula.

- **D-04-02-2:** Kick bleed suppression in `detectBassOnset` uses inline drum mean computation rather than importing `adaptiveThreshold` — preserves allocation-free constraint and avoids cross-module coupling where DrumTransientDetector's threshold would only see drum data anyway.

- **D-04-02-3:** The 3-element `vals[]` sort array in `updateBpm` is explicitly accepted (created every 2 seconds, not per-tick). This matches the plan's own note and 04-RESEARCH.md guidance on median smoothing approach.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected adaptiveThreshold call signature in detectBassOnset**

- **Found during:** Task 1 (BpmTracker creation)
- **Issue:** Plan's `detectBassOnset` code called `adaptiveThreshold(beat.bassFluxBuffer, beat.drumFluxSamples)` but the actual DrumTransientDetector export takes a single `BeatState` argument and reads `beat.drumFluxBuffer` internally — incompatible signatures that would fail TypeScript
- **Fix:** Wrote local `bassAdaptiveThreshold(bassFluxBuffer, drumFluxSamples)` with identical math (mean + 1.5*stddev) operating on the correct `bassFluxBuffer`
- **Files modified:** src/audio/BpmTracker.ts
- **Verification:** `npx tsc --noEmit` — zero errors
- **Committed in:** 87357d2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix essential for TypeScript correctness; no functional scope change. Bass adaptive threshold uses identical math, just operating on the correct buffer.

## Issues Encountered

None beyond the API signature mismatch handled above.

## Next Phase Readiness

- `beat.bpm` will be non-null after first 4 seconds (2s OSS warmup + 2s first AC update), ready for rubato suppression gate in 04-03
- `beat.lastBassOnsetSec` populated by detectBassOnset, ready for pocket score timing delta in 04-04
- `updateBpm` and `detectBassOnset` ready to be called from AnalysisTick (04-03 will wire these in)
- No blockers for 04-03

---
*Phase: 04-beat-detection-bpm-pocket-score*
*Completed: 2026-03-10*
