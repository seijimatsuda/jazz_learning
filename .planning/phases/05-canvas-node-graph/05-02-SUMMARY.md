---
phase: 05-canvas-node-graph
plan: 02
subsystem: ui
tags: [canvas, animation, typescript, nodes, lerpExp, role-based-rendering]

# Dependency graph
requires:
  - phase: 05-01
    provides: NodeAnimState.ts (lerpExp, radiusNudge), NodeLayout.ts (INSTRUMENT_ORDER, positions), CanvasRenderer delta-time rAF refactor
provides:
  - drawNode.ts module with ROLE_BASE_RADIUS, ROLE_FILL_COLOR, getRoleRadius, getRoleFillColor, drawNode function
  - CanvasRenderer reads role per instrument from analysis.instruments each frame
  - Smooth role-based radius transitions via lerpExp (factor=0.15, ~200ms)
  - Capitalized instrument labels below each node
affects:
  - 05-03 (bass animation — role color context for glow)
  - 05-04 (drums animation — uses same drawNode call path)
  - 05-05 (breathe/orbit — layered on top of drawNode base circle)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role lookup: instruments?.find(ia => ia.instrument === name)?.role ?? 'silent' — safe fallback to silent when analysis not yet active"
    - "lerpExp(current, target + nudge, 0.15, deltaMs) — frame-rate-independent radius smoothing composing baseRadius + radiusNudge"
    - "drawNode: no ctx.save()/restore() in basic fill path — callers wrap for glow compositing"
    - "Label capitalization inline: instrument.charAt(0).toUpperCase() + instrument.slice(1)"

key-files:
  created:
    - src/canvas/nodes/drawNode.ts
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-05-02-1: Initial glowCanvas color set to ROLE_FILL_COLOR['holding'] for all nodes — glow color re-creation gated by pocketScore threshold in 05-03; avoids per-frame HTMLCanvasElement allocation"
  - "D-05-02-2: INSTRUMENT_COLORS lookup removed from CanvasRenderer — all color authority delegated to ROLE_FILL_COLOR in drawNode.ts for single source of truth"
  - "D-05-02-3: lerpExp factor=0.15 per 16.667ms frame — produces ~200ms transition time matching plan spec; consistent with future nudge/pulse animations in 05-03/04"

patterns-established:
  - "Role-based rendering: getRoleRadius/getRoleFillColor called per-frame, animState.baseRadius updated to match — enables instantaneous role detection with smooth visual transition"
  - "Silent fallback: role defaults to 'silent' when analysis not yet active — prevents undefined reads and gives visually meaningful quiet state before calibration"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 5 Plan 02: Role-Based Node Drawing Summary

**Role-based canvas node rendering: soloing=52px amber, comping=36px teal, holding=28px slate, silent=18px dark — lerpExp transitions and monospace labels below each node**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T05:50:11Z
- **Completed:** 2026-03-11T05:54:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `drawNode.ts` exporting ROLE_BASE_RADIUS, ROLE_FILL_COLOR, getRoleRadius, getRoleFillColor, and the drawNode function
- CanvasRenderer now reads `state.analysis?.instruments` each frame to look up per-instrument role
- Smooth radius transitions via `lerpExp(current, target + nudge, 0.15, deltaMs)` — ~200ms role change animation
- Removed per-instrument INSTRUMENT_COLORS map; all color authority consolidated in ROLE_FILL_COLOR
- Labels capitalized and rendered 6px below each node in 12px monospace white

## Task Commits

Each task was committed atomically:

1. **Task 1: Create drawNode.ts with role-based rendering** - `ff61533` (feat)
2. **Task 2: Wire role-based drawing into CanvasRenderer render loop** - `de82a71` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/canvas/nodes/drawNode.ts` - ROLE_BASE_RADIUS, ROLE_FILL_COLOR constants, getRoleRadius, getRoleFillColor getters, drawNode function
- `src/canvas/CanvasRenderer.ts` - Imports drawNode + lerpExp; node loop reads role from analysis state, smooths radius, calls drawNode with capitalized label

## Decisions Made
- D-05-02-1: Initial glowCanvas color set to `ROLE_FILL_COLOR['holding']` for all nodes — glow color re-creation is gated in 05-03 (pocketScore threshold), avoids per-frame HTMLCanvasElement allocation during initialization
- D-05-02-2: INSTRUMENT_COLORS lookup removed from CanvasRenderer — all color authority delegated to ROLE_FILL_COLOR in drawNode.ts for a single source of truth
- D-05-02-3: lerpExp factor=0.15 per 16.667ms frame — ~200ms transition time matching plan spec; consistent with future nudge/pulse animations in 05-03/04

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- drawNode.ts is the stable base for 05-03 (bass glow + pocket color) and 05-04 (drum ripples) — both import drawNode and layer effects on top
- lerpExp is already in scope in CanvasRenderer for 05-03/04 radius nudge animations
- animState.radiusNudge is already composed into the radius target — 05-03/04 just write to radiusNudge and the lerp handles the rest
- No blockers

---
*Phase: 05-canvas-node-graph*
*Completed: 2026-03-11*
