---
phase: 09
plan: 01
title: "Expand type foundation to 8 instruments (InstrumentName, INSTRUMENT_BAND_MAP, PitchAnalysisState, EDGE_TYPE)"
subsystem: "audio-types"
tags: [typescript, types, instruments, edge-classification]

dependency-graph:
  requires: []
  provides:
    - "InstrumentName union with 8 members"
    - "INSTRUMENT_BAND_MAP with 8 entries"
    - "MID_RANGE_INSTRUMENTS set (exported)"
    - "resolveBandsForInstrument generalized for any single mid-range instrument"
    - "PitchAnalysisState with dynamic Record-based instruments field"
    - "EDGE_TYPE with 28 pairs covering all C(8,2) instrument combinations"
  affects:
    - "Plan 02: calibration code uses MID_RANGE_INSTRUMENTS"
    - "Plan 03: canvas crash sites (computeNodePositions, drawCommunicationEdges) use EDGE_TYPE"
    - "Plan 04: AnalysisTick.ts and App.tsx consumer updates use new PitchAnalysisState shape"

tech-stack:
  added: []
  patterns:
    - "Set<InstrumentName> for mid-range instrument membership checks (O(1) vs array includes)"
    - "Record<string, InstrumentPitchState> for dynamic per-instrument pitch state (replaces fixed fields)"

key-files:
  created: []
  modified:
    - src/audio/InstrumentActivityScorer.ts
    - src/audio/types.ts
    - src/canvas/edges/edgeTypes.ts

decisions:
  - id: D-09-01-1
    what: "INSTRUMENT_BAND_MAP entry for vibes covers both mid and mid_high as default"
    why: "Vibes covers both mallet mid-range and upper harmonic range simultaneously; not a single-band instrument like sax or trombone"
  - id: D-09-01-2
    what: "MID_RANGE_INSTRUMENTS exported as named export from InstrumentActivityScorer"
    why: "Calibration code (Plan 02) needs the set to determine which instruments get the INST-05 full-spectrum fallback"

metrics:
  duration: "~3 minutes"
  completed: "2026-03-11"
  tasks-completed: 2
  tasks-total: 2
---

# Phase 9 Plan 01: Type Foundation Expansion Summary

**One-liner:** InstrumentName expanded to 8 members with generalized mid-range band resolution via MID_RANGE_INSTRUMENTS Set, PitchAnalysisState changed to Record-based instruments field, and EDGE_TYPE expanded to all 28 C(8,2) instrument pair classifications.

## What Was Built

This plan establishes the type foundation for the v1.1 8-instrument expansion. All downstream code (scorer, analysis tick, canvas renderer, UI) depends on these types and data maps being correct before any consumer is updated.

### Task 1: Expand InstrumentName, INSTRUMENT_BAND_MAP, resolveBandsForInstrument

**File:** `src/audio/InstrumentActivityScorer.ts`

- `InstrumentName` union expanded from 4 to 8: added `saxophone`, `trumpet`, `trombone`, `vibes`
- `INSTRUMENT_BAND_MAP` extended with correct frequency band assignments for the 4 new instruments
- `resolveBandsForInstrument` generalized: replaced the `hasBoth` keyboard/guitar hardcode with a `MID_RANGE_INSTRUMENTS = new Set(...)` check — any single mid-range instrument now claims the full mid spectrum
- `MID_RANGE_INSTRUMENTS` exported as named export for calibration code

### Task 2: Restructure PitchAnalysisState and expand EDGE_TYPE

**Files:** `src/audio/types.ts`, `src/canvas/edges/edgeTypes.ts`

- `PitchAnalysisState` changed from `{ keyboard: InstrumentPitchState; guitar: InstrumentPitchState }` to `{ instruments: Record<string, InstrumentPitchState> }` — now supports any melodic instrument in the lineup
- `EDGE_TYPE` expanded from 6 entries to 28 entries, covering all C(8,2) = 28 instrument pair combinations for 8 instruments

## Verification Results

1. No TypeScript errors in the 3 modified files themselves
2. `hasBoth` logic removed from InstrumentActivityScorer.ts (confirmed via grep)
3. EDGE_TYPE has exactly 28 key-value pairs (confirmed via grep count)
4. InstrumentName union has exactly 8 members
5. Consumer errors in AnalysisTick.ts and App.tsx are expected and intentional — they reference the old `pitch.keyboard` / `pitch.guitar` shape and will be fixed in Plan 04

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

- Plan 02 (Calibration) can proceed: `MID_RANGE_INSTRUMENTS` is exported and ready
- Plan 03 (Canvas crash fixes) can proceed: `EDGE_TYPE` has all 28 pairs needed for `drawCommunicationEdges`
- Plan 04 (Consumer updates) has clear error locations: AnalysisTick.ts lines 315-351 and App.tsx line 76
