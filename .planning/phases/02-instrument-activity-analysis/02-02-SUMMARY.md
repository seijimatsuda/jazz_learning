---
phase: 02-instrument-activity-analysis
plan: "02"
subsystem: audio
tags: [typescript, role-classification, state-machine, hysteresis, jazz-visualization]

# Dependency graph
requires:
  - phase: 02-01
    provides: RoleLabel type in types.ts, InstrumentAnalysis.timeInRole field
  - phase: 01-audio-pipeline-foundation
    provides: CalibrationPass thresholds (0.75/0.40/0.10 * peak) that RoleClassifier mirrors
provides:
  - classifyRole() — pure function state machine mapping activityScore + currentRole → RoleLabel
  - updateTimeInRole() — in-place accumulator for cumulative seconds per role
affects:
  - 02-03 (InstrumentActivityCoordinator will call classifyRole/updateTimeInRole each 10fps tick)
  - 02-04 (integration wiring uses RoleClassifier as part of analysis pipeline)
  - Phase 5+ (node colors/sizes driven by RoleLabel output)
  - Phase 7 (time-in-role pie charts use timeInRole accumulations)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hysteresis state machine: downward transitions require score to drop below threshold - hysteresis; upward transitions are immediate"
    - "Pure function module: no side effects, no allocations, imports only from types.ts"
    - "In-place mutation for hot-path accumulators: updateTimeInRole mutates Record<RoleLabel, number> directly"

key-files:
  created:
    - src/audio/RoleClassifier.ts
  modified: []

key-decisions:
  - "D-02-02-1: Upward role transitions have no hysteresis barrier — an instrument can always enter a higher role immediately when score crosses threshold; only downward transitions are gated"
  - "D-02-02-2: Hysteresis check for 'holding' edge case (score=0.05, T_HOLD-hysteresis=0.05) uses strict less-than (<) — score exactly equal to dead-band boundary stays in current role, matching expected behavior"

patterns-established:
  - "Role state machine: always check upward transitions first (score >= T_SOLO), then handle downward from currentRole context — makes upward paths fast and downward paths sticky"

# Metrics
duration: 1min
completed: 2026-03-11
---

# Phase 2 Plan 02: RoleClassifier Summary

**Pure-function role classification state machine with configurable hysteresis dead-band (0.75/0.40/0.10 thresholds) and in-place time-in-role accumulator**

## Performance

- **Duration:** 1 min 2s
- **Started:** 2026-03-11T01:27:07Z
- **Completed:** 2026-03-11T01:28:09Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- classifyRole() implements a sticky state machine — upward transitions are immediate, downward transitions require score to cross threshold by more than the hysteresis amount (INST-03)
- updateTimeInRole() accumulates cumulative seconds per role with zero allocations, mutating the Record<RoleLabel, number> in place at 10fps (INST-09)
- All five hysteresis edge cases from the plan verified: upward (0.80/'comping'→'soloing'), dead-band hold (0.73/'soloing'), dead-band break (0.69/'soloing'→'comping'), boundary hold (0.05/'holding'), boundary break (0.04/'holding'→'silent')

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RoleClassifier with hysteresis state machine** - `fdaf750` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/audio/RoleClassifier.ts` — Role classification state machine; exports classifyRole and updateTimeInRole

## Decisions Made

**D-02-02-1: Upward transitions have no hysteresis barrier**
- Rationale: Musical intuition — when a musician starts soloing, the visualization should respond immediately. Delay on entry would feel unresponsive. Only exit (downward) needs stabilization to prevent flicker.

**D-02-02-2: Boundary edge case uses strict less-than**
- Rationale: The plan specifies `classifyRole(0.05, 'holding')` → `'holding'` (stays). T_HOLD - hysteresis = 0.05. Using `< 0.05` (strict) means score exactly at 0.05 stays in holding, matching the expected behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RoleClassifier (INST-03, INST-09) complete and TypeScript-verified
- Ready for 02-03: InstrumentActivityCoordinator will import classifyRole and updateTimeInRole and call them each 10fps tick
- No blockers

---
*Phase: 02-instrument-activity-analysis*
*Completed: 2026-03-11*
