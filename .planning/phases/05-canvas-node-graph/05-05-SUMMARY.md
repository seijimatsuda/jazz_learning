---
phase: 05-canvas-node-graph
plan: "05"
subsystem: ui
tags: [canvas, animation, beat-sync, delta-time, rAF, visualization]

# Dependency graph
requires:
  - phase: 05-04
    provides: Drums beat nudge, ripples, orbit — beat state (lastDrumOnsetSec, lastDownbeatSec) on audioStateRef
  - phase: 05-03
    provides: Bass breathing glow, onset flash, pocket-score color shift
  - phase: 05-01
    provides: bgPulseProgress placeholder on CanvasRenderer, diamond layout, deltaMs infrastructure

provides:
  - All-node beat pulse: shared beatPulse scalar +2px/+4px applied to every node radius on drum onset/downbeat
  - Background breath: bgPulseProgress drives #0a0a0f→#0d0d18 interpolation over 200ms per beat
  - Complete Phase 5 rendering pipeline: bass glow+ripple, drums nudge+ripple+orbit, all-node pulse, background breath, tension meter

affects: [06-pocket-tension-line, 07-band-setup-panel, Phase 6 canvas extensions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single global onset detection at top of render loop — one lastSeenGlobalDrumOnset check before per-node loop, no per-node duplication"
    - "Shared animation scalar pattern — beatPulse is one instance variable applied to all N nodes vs N separate variables"
    - "Linear decay for fast 200ms effects (bgPulseProgress), lerpExp for snappy radius transitions (beatPulse)"

key-files:
  created: []
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-05-05-1: Single onset detection before per-node loop — beatPulse and bgPulseProgress set once at top of frame, not rechecked per instrument"
  - "D-05-05-2: Downbeat check after drum onset check — downbeat sets beatPulse=4 overriding beat's 2px; bgPulseProgress already set by drum onset (downbeat is coincident)"
  - "D-05-05-3: Linear decay for bgPulseProgress (Math.max subtract deltaMs/200) vs lerpExp for beatPulse — linear gives exact 200ms window, lerpExp gives organic snap for radius"

patterns-established:
  - "Global-then-local pattern: detect shared events once at top of render, then per-node details inside the loop"
  - "Snap-to-zero pattern: lerpExp scalar < threshold → set to 0 to prevent float accumulation over thousands of frames"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 5 Plan 05: All-Node Beat Pulse and Background Breath Summary

**Shared beatPulse scalar (+2px/+4px) pulsing all nodes on drum onset/downbeat, with 200ms background RGB interpolation from #0a0a0f to #0d0d18 completing the Phase 5 beat-responsive canvas pipeline**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T05:59:53Z
- **Completed:** 2026-03-11T06:03:00Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify — awaiting user approval)
- **Files modified:** 1

## Accomplishments

- VIZ-10: All four nodes (guitar, drums, keyboard, bass) pulse together +2px on each drum beat, +4px on downbeats, via single shared `beatPulse` instance variable applied in per-node radius lerpExp target
- VIZ-11: Background shifts from #0a0a0f to #0d0d18 on each drum onset, decaying linearly over 200ms via `bgPulseProgress`
- Null guard wraps all global onset detection — beat and bpm must both be non-null before touching `lastSeenGlobalDrumOnset` or `lastSeenGlobalDownbeat`
- Draw order verified: background fill (breath) → per node: glow behind, circle, ripples on top → tension meter topmost
- `npx tsc --noEmit` passes with zero errors

## Task Commits

1. **Task 1: Add all-node beat pulse and background breath** - `69fe84f` (feat)

## Files Created/Modified

- `src/canvas/CanvasRenderer.ts` — Added `beatPulse`, `lastSeenGlobalDrumOnset`, `lastSeenGlobalDownbeat` instance vars; global onset detection block at top of render loop; beatPulse decay + bgPulseProgress linear decay; RGB background interpolation; beatPulse added to per-node radius target

## Decisions Made

- Single global onset detection at top of render frame, before per-node loop — avoids checking the same beat timestamp N times per frame (Rule: single source of truth for shared state)
- `beatPulse = 4` on downbeat overrides the `beatPulse = 2` set by the coincident drum onset in the same frame — downbeat check runs after drum onset check, natural priority
- `bgPulseProgress` uses `Math.max(0, progress - deltaMs/200)` linear decay (exact 200ms window) rather than lerpExp — ensures consistent visual duration independent of frame rate variations

## Deviations from Plan

None - plan executed exactly as written. The one structural note: `const state = this.audioStateRef.current` was moved above the onset detection block (it was already being referenced before declaration in an initial draft). No behavioral change — resolved during implementation before commit.

## Issues Encountered

None. TypeScript passed clean on first attempt.

## Next Phase Readiness

- Phase 5 is functionally complete pending human-verify checkpoint approval
- Phase 6 (pocket/tension line) can add to CanvasRenderer's render loop using the same deltaMs infrastructure and draw order conventions
- All beat state reads (`lastDrumOnsetSec`, `lastDownbeatSec`, `bpm`) patterns established across 05-04 and 05-05 serve as templates for Phase 6 onset-triggered animations

---
*Phase: 05-canvas-node-graph*
*Completed: 2026-03-11*
