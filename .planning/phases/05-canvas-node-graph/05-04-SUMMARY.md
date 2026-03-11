---
phase: 05-canvas-node-graph
plan: "04"
subsystem: ui
tags: [canvas, animation, drums, ripple, beat-nudge, orbit, rAF]

# Dependency graph
requires:
  - phase: 05-02
    provides: lerpExp, NodeAnimState, INSTRUMENT_ORDER, radiusNudge field, ripples array
  - phase: 05-01
    provides: NodeAnimState.ts with RippleState, updateRipples utility
  - phase: 04-04
    provides: beat.lastDrumOnsetSec, beat.lastDownbeatSec, beat.timingOffsetMs on audioStateRef
provides:
  - Drums node +6px beat nudge with lerpExp decay toward 0 (VIZ-06)
  - Crisp #e0f2fe ripple ring (300ms, maxRadius=60) on each drum beat (VIZ-07)
  - Double ripple on downbeats (500ms, maxRadius=90) (VIZ-08)
  - +/-3px orbit displacement when timingOffsetMs > 30ms (VIZ-09)
affects:
  - 05-05 (background pulse wiring — drums beat signals relevant)
  - future phase needing drums beat-sync visual feedback

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Timestamp comparison pattern for onset detection: lastDrumOnsetSec !== lastSeenDrumOnsetSec"
    - "BPM null guard: all beat-reactive visuals gated on beat.bpm !== null to suppress rubato noise"
    - "Sub-pixel snap: radiusNudge < 0.5 snapped to 0 to prevent float drift accumulation"
    - "Orbit reset: orbitAngle = 0 when threshold not exceeded — clean return to center"

key-files:
  created: []
  modified:
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-05-04-1: Downbeat double-ripple check placed inside the beat.bpm !== null guard — downbeat fires alongside regular beat onset on beat 1, ensuring both ripples are spawned"
  - "D-05-04-2: Ripple baseX/baseY uses unorbited (x, y) coordinates — ripples emanate from the node's logical position, not its orbited drawing position"
  - "D-05-04-3: Beat nudge set AFTER decay each frame — ensures fresh onset always snaps to full 6px regardless of decay state"

patterns-established:
  - "Drums section gated by instrument === 'drums' check in the shared node loop — keeps bass section clean for 05-03 parallel work"
  - "Draw order: drawNode (circle+label) then updateRipples — ripples render on top of node fill"

# Metrics
duration: 2min
completed: "2026-03-11"
---

# Phase 5 Plan 04: Drums Node Animations Summary

**Drums node gets beat-reactive animations: +6px nudge on each onset, crisp white-blue ripple rings (300ms), downbeat double-ripple (500ms/90px), and timing-offset orbit (+/-3px) — all frame-rate-independent via lerpExp and deltaMs**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T05:54:35Z
- **Completed:** 2026-03-11T05:55:53Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- VIZ-06: Beat nudge — +6px radiusNudge on drum onset, decays via lerpExp(factor=0.92) and snaps to 0 when below 0.5px
- VIZ-07: Crisp ripple ring — #e0f2fe, 300ms fade, maxRadius=60, spawned on each detected drum onset
- VIZ-08: Downbeat double ripple — second wider ring (500ms, maxRadius=90) spawned when lastDownbeatSec changes
- VIZ-09: Timing offset orbit — circular +/-3px displacement at ORBIT_SPEED=0.004 rad/ms when |timingOffsetMs| > 30ms; resets to center when below threshold
- BPM null guard prevents all onset/nudge/ripple events during rubato (beat.bpm === null)
- Onset detection uses audioCtx timestamp comparison (lastDrumOnsetSec) not beatCounter per D-04-04-2

## Task Commits

1. **Task 1: Add drums beat nudge, ripple, and orbit logic to CanvasRenderer** - `1304cf4` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/canvas/CanvasRenderer.ts` - Added ORBIT_THRESHOLD_MS/ORBIT_RADIUS_PX/ORBIT_SPEED constants and drums-specific animation block in the instrument render loop

## Decisions Made

- D-05-04-1: Downbeat double-ripple check inside bpm !== null guard — downbeat coincides with regular onset on beat 1, both ripples fire together
- D-05-04-2: Ripple baseX/baseY at unorbited position — ripples expand from the node's logical center, not the orbited offset position
- D-05-04-3: Nudge assigned after decay — `animState.radiusNudge = 6` runs after the lerpExp decay line, so fresh onsets always restore full 6px

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript passed cleanly on first attempt. The file had already received 05-03 imports (drawGlow, pocketToGlowColor, createGlowLayer) from parallel work — no conflicts since drums section is isolated by `instrument === 'drums'` gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Drums node animations complete: VIZ-06, VIZ-07, VIZ-08, VIZ-09 all implemented
- 05-03 (bass animations) and 05-04 (drums animations) can now be verified together
- 05-05 (background beat pulse, VIZ-11) is next — can use beat.lastDrumOnsetSec already on audioStateRef
- No blockers

---
*Phase: 05-canvas-node-graph*
*Completed: 2026-03-11*
