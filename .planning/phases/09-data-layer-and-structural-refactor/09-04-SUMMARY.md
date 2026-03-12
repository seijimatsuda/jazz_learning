---
phase: 09-data-layer-and-structural-refactor
plan: 04
subsystem: audio
tags: [typescript, pitch-detection, acf2, call-response, dynamic-lineup]

# Dependency graph
requires:
  - phase: 09-01
    provides: PitchAnalysisState changed to { instruments: Record<string, InstrumentPitchState> }
provides:
  - AnalysisTick.ts iterates PitchAnalysisState.instruments record dynamically for all melodic instruments
  - App.tsx initializes pitch state for all non-drums instruments in lineup
  - Call-response detection guarded on keyboard+guitar presence (no crash when absent)
  - Zero TypeScript errors across entire codebase
  - Clean production Vite build
affects: ["10-interaction-and-performance", "11-export-and-polish"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic instrument record iteration: Object.entries(state.pitch.instruments) — not hardcoded name list"
    - "Drums exclusion from pitch: filter at initialization, not at tick time"
    - "Guard pattern for optional keyboard+guitar pair: check presence before call-response"

key-files:
  created: []
  modified:
    - src/audio/AnalysisTick.ts
    - src/App.tsx

key-decisions:
  - "D-09-04-1: Drums excluded from pitch detection at init time in App.tsx (ACF2+ on transients is spurious) — not at tick time"
  - "D-09-04-2: Call-response detection scope stays keyboard+guitar only; guarded silently when either absent"
  - "D-09-04-3: Bass included in pitch detection — bass pitch tracking via ACF2+ is valid and musically meaningful"

patterns-established:
  - "Pitch record is a dynamic Record<string, InstrumentPitchState> — never iterate by hardcoded name"

# Metrics
duration: 2min
completed: 2026-03-12
---

# Phase 9 Plan 04: Dynamic Pitch Wiring Summary

**Dynamic PitchAnalysisState wired end-to-end: AnalysisTick iterates instruments record, App.tsx initializes all non-drums instruments, zero TypeScript errors across codebase**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-12T05:15:24Z
- **Completed:** 2026-03-12T05:17:06Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- AnalysisTick.ts pitch section replaces hardcoded keyboard/guitar blocks with `Object.entries(state.pitch.instruments)` loop
- App.tsx initializes pitch state for all melodic instruments (all except drums) dynamically from lineup
- Call-response detection still fires correctly when keyboard+guitar both present; silently skips otherwise
- `npx tsc --noEmit` produces zero errors — Phase 9 fully closes the TypeScript debt introduced by 09-01
- `npx vite build` produces clean production build (283 KB JS, 17 KB CSS)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update AnalysisTick.ts pitch section for dynamic PitchAnalysisState** - `e33444c` (feat)
2. **Task 2: Update App.tsx pitch initialization for dynamic lineup** - `c880c98` (feat)

**Plan metadata:** (docs: complete plan)

## Files Created/Modified
- `src/audio/AnalysisTick.ts` - Pitch section now iterates `state.pitch.instruments` record; call-response guarded by presence check
- `src/App.tsx` - Pitch state initialized for all melodic instruments; drums excluded; call-response gated on keyboard+guitar

## Decisions Made
- **D-09-04-1:** Drums excluded at initialization in App.tsx rather than at tick time — cleaner and zero per-tick overhead
- **D-09-04-2:** Call-response detection kept keyboard+guitar scoped as originally designed; guarded silently when either is absent
- **D-09-04-3:** Bass included in pitch detection — unlike drums, bass produces stable tonal content that ACF2+ can track meaningfully

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — both files had clean, localized changes. TypeScript errors were exactly as described in the plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 complete: entire codebase compiles with zero TypeScript errors
- Dynamic lineup pipeline is end-to-end: 2-8 instruments through scoring, rendering, and pitch detection
- Phase 10 (interaction and performance) can begin: canvas handles any lineup, all 28 edge pairs defined
- Concerns from STATE.md still apply: iOS canvas performance at 8 instruments needs empirical device test early in Phase 10

---
*Phase: 09-data-layer-and-structural-refactor*
*Completed: 2026-03-12*
