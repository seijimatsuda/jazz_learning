---
phase: 05-canvas-node-graph
plan: 01
subsystem: ui
tags: [canvas, animation, node-graph, delta-time, typescript, rAF]

# Dependency graph
requires:
  - phase: 04-beat-detection-bpm-pocket-score
    provides: BeatState on audioStateRef.current.beat — beat timestamps read by 05-03/05-04
  - phase: 01-audio-pipeline-foundation
    provides: CanvasRenderer rAF loop, glowLayer offscreen compositing, AudioStateRef pattern
provides:
  - NodeLayout.ts with computeNodePositions(2|3|4) and INSTRUMENT_ORDER diamond mapping
  - NodeAnimState.ts with per-node animation state interface, factory, lerp/lerpExp, ripple utilities
  - CanvasRenderer refactored to delta-time rAF with 100ms cap and 4 diamond-layout instrument nodes
affects:
  - 05-02-PLAN.md (role-based node sizing — imports NodeAnimState, reads INSTRUMENT_ORDER)
  - 05-03-PLAN.md (bass animations — imports NodeAnimState, RippleState, drawAndUpdateRipple)
  - 05-04-PLAN.md (drum animations — imports NodeAnimState, RippleState, drawAndUpdateRipple)
  - 05-05-PLAN.md (background pulse — reads bgPulseProgress, uses lerpExp)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Delta-time rAF: rawDelta = timestamp - prevTimestamp, capped at Math.min(rawDelta, 100) to prevent tab-resume jump
    - Per-node animation state: plain objects (not classes) with mutable scalars, no per-frame allocations
    - Frame-rate-independent lerp: lerpExp uses 1 - Math.pow(1 - factor, deltaMs / 16.667) as t value
    - Ripple array management: iterate backward and splice expired entries to avoid index shifting errors

key-files:
  created:
    - src/canvas/nodes/NodeLayout.ts
    - src/canvas/nodes/NodeAnimState.ts
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-05-01-1: INSTRUMENT_ORDER is [guitar, drums, keyboard, bass] — bass(bottom) and drums(left) adjacent for Phase 6 pocket line"
  - "D-05-01-2: Initial baseRadius=28 for all nodes in holding state — role-based sizing deferred to 05-02"
  - "D-05-01-3: Ripple utilities in NodeAnimState.ts (not drawGlow.ts) — enables 05-03 and 05-04 to run in parallel as Wave 1 imports"
  - "D-05-01-4: bgPulseProgress added to CanvasRenderer now (unused) — placeholder for VIZ-11 wired in 05-05 to avoid later architectural change"

patterns-established:
  - "Pattern 1: Delta-time loop — all animation driven by deltaMs (capped), never raw timestamp diff"
  - "Pattern 2: Fractional positions — NodePosition.x/y in [0,1], multiply by w/h in render loop"
  - "Pattern 3: Per-node glowCanvas — created in createNodeAnimState, never recreated unless color changes"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 5 Plan 01: Canvas Node Graph Foundation Summary

**Delta-time rAF loop with 100ms tab-resume cap, NodeLayout diamond positions, and per-node NodeAnimState objects replacing the placeholder 6-band arc layout in CanvasRenderer**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T05:44:20Z
- **Completed:** 2026-03-11T05:47:20Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 refactored)

## Accomplishments

- Created `NodeLayout.ts` with `computeNodePositions(2|3|4)` returning fractional positions and `INSTRUMENT_ORDER` diamond mapping (guitar-top, drums-left, keyboard-right, bass-bottom)
- Created `NodeAnimState.ts` with full interface, `createNodeAnimState` factory, `lerp`/`lerpExp` frame-rate-independent utilities, and `drawAndUpdateRipple`/`updateRipples` ripple helpers
- Refactored `CanvasRenderer.ts` from placeholder 6-band arc layout to delta-time rAF loop with 4 labeled instrument nodes in diamond layout

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NodeLayout.ts and NodeAnimState.ts** - `b61abf7` (feat)
2. **Task 2: Refactor CanvasRenderer to delta-time rAF with instrument nodes** - `acfac7a` (feat)

## Files Created/Modified

- `src/canvas/nodes/NodeLayout.ts` — `NodePosition` interface, `computeNodePositions(2|3|4)`, `INSTRUMENT_ORDER` constant
- `src/canvas/nodes/NodeAnimState.ts` — `RippleState`/`NodeAnimState` interfaces, `createNodeAnimState` factory, `lerp`, `lerpExp`, `drawAndUpdateRipple`, `updateRipples`
- `src/canvas/CanvasRenderer.ts` — Delta-time rAF with 100ms cap, 4 diamond-layout instrument nodes, removed old `NODE_CONFIGS`/`getBandEnergy` band-arc system

## Decisions Made

- **D-05-01-1:** `INSTRUMENT_ORDER` is `['guitar', 'drums', 'keyboard', 'bass']` — bass (bottom) and drums (left) are adjacent in the diamond, enabling the Phase 6 pocket line to connect them for the rhythm-section relationship
- **D-05-01-2:** Initial `baseRadius=28` for all nodes in holding state — role-based sizing with different radii per instrument role deferred to 05-02
- **D-05-01-3:** Ripple utilities placed in `NodeAnimState.ts` (not `drawGlow.ts`) — 05-03 (bass) and 05-04 (drums) both need ripple import; placing here enables both to be Wave 2 plans running in parallel
- **D-05-01-4:** `bgPulseProgress` added to `CanvasRenderer` now as placeholder — VIZ-11 background beat pulse wired in 05-05 so the field exists without an architectural change mid-phase

## Deviations from Plan

None — plan executed exactly as written. Pre-existing `tsc -b` build errors (AnalysisTick.ts, CalibrationPass.ts, SwingAnalyzer.ts, TensionMeter.ts Uint8Array generic mismatch) were confirmed pre-existing and not introduced by this plan. `npx tsc --noEmit` passes cleanly.

## Issues Encountered

None. TypeScript compiled cleanly after both tasks. All existing callbacks (role, chord, tension, beat) preserved in refactored CanvasRenderer.

## Next Phase Readiness

- **05-02** (role-based node sizing/color): Ready — `NodeAnimState` interface has `baseRadius`/`currentRadius`/`glowIntensity` fields ready for role-driven updates; `INSTRUMENT_ORDER` maps instruments to node indices
- **05-03** (bass animations): Ready — `RippleState`, `drawAndUpdateRipple`, `updateRipples` exported from `NodeAnimState.ts`; `lastSeenBassOnsetSec` field on state object
- **05-04** (drum animations): Ready — same ripple utilities; `lastSeenDrumOnsetSec` field on state object
- **05-05** (background pulse): Ready — `bgPulseProgress` instance variable present; `lerpExp` available for smooth pulse decay

---
*Phase: 05-canvas-node-graph*
*Completed: 2026-03-11*
