---
phase: 12-disambiguation-engine
plan: 01
subsystem: audio-analysis
tags: [typescript, disambiguation, raw-display-split, instrument-families]

dependency-graph:
  requires: []
  provides:
    - DisambiguationState interface and factory function
    - rawActivityScore/displayActivityScore split on InstrumentAnalysis
    - instrumentFamilies.ts constants and pair detection helpers
    - disambiguation field on AudioStateRef (null, ready for Wave 2 initialization)
  affects:
    - 12-02: SpectralFeatures.ts can be used with rawActivityScore gating
    - 12-03 and later disambiguators: DisambiguationState is the storage target
    - Canvas and Zustand: should read displayActivityScore in Phase 13+

tech-stack:
  added: []
  patterns:
    - raw/display score split — pre/post-disambiguation activity scores on each instrument
    - pre-allocated state factory — DisambiguationState uses Float32Array ring buffers, zero post-init allocations
    - pure helpers module — instrumentFamilies.ts has no side effects or imports

key-files:
  created:
    - src/audio/instrumentFamilies.ts
  modified:
    - src/audio/types.ts
    - src/audio/InstrumentActivityScorer.ts
    - src/audio/AnalysisTick.ts

decisions:
  - decision: Keep activityScore field on InstrumentAnalysis unchanged
    rationale: Removing it would cause immediate compile errors across canvas, Zustand bridge, and role classifier. Phase-out incrementally in later plans.
  - decision: displayActivityScore defaults to activityScore (post-kb/guitar-disambiguation)
    rationale: Preserves existing kb/guitar weight adjustments in the display score while Wave 2/3 disambiguators are not yet wired in.
  - decision: Pitch detection gates on rawActivityScore not activityScore
    rationale: Pitch detection should not be suppressed by disambiguation — if an instrument has energy, pitch should be detected regardless of display weight.
  - decision: History buffer stores newScore (pre-disambiguation raw value)
    rationale: Cross-correlator needs raw correlation patterns, not post-disambiguation weights which would create circular feedback.

metrics:
  duration: 2m
  completed: 2026-03-12
  tasks-total: 3
  tasks-completed: 3
---

# Phase 12 Plan 01: Disambiguation Foundation — Summary

**One-liner:** Raw/display activity score split on InstrumentAnalysis with DisambiguationState ring buffer interface, instrumentFamilies.ts helpers, and backward-compatible AnalysisTick wiring.

## What Was Built

### Task 1: types.ts — Raw/Display Score Split + DisambiguationState

Added two new fields to `InstrumentAnalysis`:
- `rawActivityScore` — pre-disambiguation, stored before any weight adjustments
- `displayActivityScore` — post-disambiguation, what canvas and Zustand will read in Phase 13+

Added `DisambiguationState` interface with five pre-allocated `Float32Array` ring buffers:
- `tremoloRmsBuffer` (length 20, 2s at 10fps) — for vibes/keyboard tremolo detection
- `flatnessBuffer` (length 10, 1s at 10fps) — for spectral flatness tracking
- `onsetBuffer` (length 20) — for trombone/bass onset detection
- `tuttiFrameCount` + `isTutti` — for DISC-FND-04 tutti guard
- `confidence` record — keyed by pair name (e.g., `'trombone_bass'`)

Added `initDisambiguationState()` factory (zero post-init allocations).

Added `disambiguation: DisambiguationState | null` to `AudioStateRef`, initialized to `null`.

### Task 2: instrumentFamilies.ts — Constants and Pair Detection Helpers

New module with five pure exports:
- `INSTRUMENT_FAMILIES` — maps each of 8 instruments to sonic family (rhythm/keyboard/strings/woodwind/brass)
- `HORN_INSTRUMENTS` — Set of trombone/saxophone/trumpet for horn section disambiguation
- `hasInstrumentPair(instruments, a, b)` — checks if both instruments are in lineup
- `countHorns(instruments)` — counts horn instruments in lineup
- `isTuttiActive(instruments, threshold=0.6)` — tutti detection guard (DISC-FND-04)

### Task 3: AnalysisTick.ts + InstrumentActivityScorer.ts — Score Split Wiring

`InstrumentActivityScorer.ts`: `initAnalysisState` now initializes `rawActivityScore: 0` and `displayActivityScore: 0` for each instrument.

`AnalysisTick.ts`:
- After EMA scoring: `instr.rawActivityScore = newScore` (before disambiguation)
- After kb/guitar disambiguation block: `instr.displayActivityScore = instr.activityScore` for all instruments (default pass-through until Wave 2/3)
- Pitch detection gate changed from `activityScore > 0.15` to `rawActivityScore > 0.15`

## Verification Results

All 7 plan verification checks passed:
1. `npx tsc --noEmit` — zero errors
2. `rawActivityScore` field present in `InstrumentAnalysis`
3. `DisambiguationState` interface defined in types.ts
4. `initDisambiguationState` factory exported from types.ts
5. `disambiguation` field on `AudioStateRef`
6. `src/audio/instrumentFamilies.ts` exists
7. `displayActivityScore` wired in AnalysisTick.ts

## Commits

| Task | Commit  | Description                                                    |
| ---- | ------- | -------------------------------------------------------------- |
| 1    | 7fb49f7 | feat(12-01): add raw/display score split and DisambiguationState to types.ts |
| 2    | 6533fb2 | feat(12-01): create instrumentFamilies.ts with constants and pair detection helpers |
| 3    | 126dd75 | feat(12-01): wire raw/display score split into AnalysisTick and InstrumentActivityScorer |

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

Wave 1 foundation is complete. Wave 2 disambiguators (SpectralFeatures.ts already present from 12-02) can now:
- Read `rawActivityScore` for activity gating
- Write to `disambiguation.confidence[pairKey]`
- Set per-instrument weights that modify `activityScore` → `displayActivityScore`

The `activityScore` field still exists and is still written by the existing kb/guitar disambiguator. Phase 13 (visual) should continue reading `activityScore` until a later plan replaces it with `displayActivityScore`.
