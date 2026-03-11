---
phase: 06-edge-visualization
plan: 03
subsystem: ui
tags: [canvas, animation, tension, color-lerp, edge-visualization]

# Dependency graph
requires:
  - phase: 06-edge-visualization/06-01
    provides: EdgeAnimState with tintFactor and resolutionFlashIntensity fields, drawPocketLine foundation
  - phase: 06-edge-visualization/06-02
    provides: drawCommunicationEdges for all 5 non-pocket pairs, edgeTypes with TENSION_AMBER_RGB/TENSION_RED_RGB
  - phase: 03-chord-detection-harmonic-analysis
    provides: TensionState.currentTension on AudioStateRef for live tension value

provides:
  - getTintedColor() utility in edgeTypes.ts for zero-alloc tension-driven color lerp
  - EDGE-09: All visible edges shift base color toward amber/orange above tension 0.6, red above 0.8
  - EDGE-10: All visible edges flash cool blue-white (resolutionGlowCanvas) when tension drops below 0.3
  - Smooth tintFactor via lerpExp (not snapping) on all edges each frame
  - Resolution flash threshold detection in CanvasRenderer using prevTension crossing guard
  - Phase 6 Edge Visualization complete — all 10 EDGE requirements satisfied

affects:
  - 07-band-setup-panel (reads canvas output visually)
  - 08-performance-polish (may tune tension thresholds)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tension tinting via lerpExp(tintFactor) per frame — smooth color shift with no snapping
    - prevTension crossing guard pattern for one-shot event detection in render loop
    - getTintedColor accepts pre-parsed RGB channels (not CSS strings) for zero-alloc lerp
    - resolutionFlashIntensity=1.0 set on tension resolution, decays via lerpExp per frame

key-files:
  created: []
  modified:
    - src/canvas/edges/edgeTypes.ts
    - src/canvas/edges/drawPocketLine.ts
    - src/canvas/edges/drawCommunicationEdges.ts
    - src/canvas/CanvasRenderer.ts

key-decisions:
  - "D-06-03-1: getTintedColor placed in edgeTypes.ts not a separate util — colocation with TENSION_AMBER_RGB and TENSION_RED_RGB constants it depends on; drawGlow.ts pattern (colocation) followed"
  - "D-06-03-2: tintFactor threshold >0.01 guard before getTintedColor call — skips string allocation when tint is perceptually invisible, returns original static string literal instead"
  - "D-06-03-3: Resolution flash triggers on ALL visible edges (weight >= 0.3) plus bass_drums — harmonic resolution should illuminate the whole graph, not just the most active pair"
  - "D-06-03-4: prevTension crossing check uses > 0.3 (previous) and <= 0.3 (current) — fires exactly once per resolution event, not continuously while tension stays below threshold"

patterns-established:
  - "Crossing-guard pattern: prevValue / currentValue fields in renderer for one-shot event detection without callbacks"
  - "Tint factor smoothing: lerpExp(tintFactor, targetTint, 0.1, deltaMs) — same decay curve used for all tension-responsive color shifts across edges"

# Metrics
duration: ~4min
completed: 2026-03-11
---

# Phase 6 Plan 03: Edge Tension Tinting and Resolution Flash Summary

**Harmonic tension drives all edges warm (amber above 0.6 tension, red above 0.8) with smooth lerpExp tinting, and resolves into cool blue-white glow flash across the full graph when tension drops below 0.3 — completing Phase 6.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11
- **Completed:** 2026-03-11
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added `getTintedColor()` to `edgeTypes.ts` — zero-alloc color lerp using pre-parsed TENSION_AMBER_RGB/TENSION_RED_RGB constants, tension selects amber vs red target
- EDGE-09 complete: All edges (pocket line + 5 communication edges) shift base color toward amber/orange above tension 0.6, red above 0.8, via smooth per-frame lerpExp tintFactor
- EDGE-10 complete: Resolution flash triggers on all visible edges when tension crosses below 0.3, rendering cool blue-white glow (resolutionGlowCanvas) that decays over ~300ms
- CanvasRenderer adds `prevTension` field for crossing-guard detection — one-shot flash per resolution event

## Task Commits

Each task was committed atomically:

1. **Task 1: Tension tinting helper and pocket line update** - `0f99c39` (feat)
2. **Task 2: Communication edge tension tinting and resolution flash trigger** - `b4a3fd9` (feat)

## Files Created/Modified

- `src/canvas/edges/edgeTypes.ts` — Added `lerp` import and `getTintedColor()` utility function
- `src/canvas/edges/drawPocketLine.ts` — Added `currentTension` param, tintFactor logic, resolution flash block
- `src/canvas/edges/drawCommunicationEdges.ts` — Added `currentTension` param, per-edge tint and resolution flash, `drawGlow` import
- `src/canvas/CanvasRenderer.ts` — Added `prevTension` field, resolution flash detection, updated both draw call signatures

## Decisions Made

- [D-06-03-1]: `getTintedColor` placed in `edgeTypes.ts` not a separate util — colocation with `TENSION_AMBER_RGB` and `TENSION_RED_RGB` constants it depends on; follows `drawGlow.ts` pattern (utility collocated with constants)
- [D-06-03-2]: `tintFactor > 0.01` guard before `getTintedColor` call — skips string allocation when tint is perceptually invisible, returns original static string literal instead
- [D-06-03-3]: Resolution flash triggers on ALL visible edges (weight >= 0.3) plus `bass_drums` — harmonic resolution illuminates the whole graph, not just the most active pair
- [D-06-03-4]: Crossing check uses `prevTension > 0.3 && currentTension <= 0.3` — fires exactly once per resolution event, not continuously while tension stays below threshold

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors exist in `AnalysisTick.ts`, `CalibrationPass.ts`, `SwingAnalyzer.ts`, and `TensionMeter.ts` (Uint8Array generic type mismatch and unused variables). These were present before this plan and are not caused by any changes in 06-03. No new errors introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 6 Edge Visualization is fully complete. All 10 EDGE requirements (EDGE-01 through EDGE-10) are satisfied:
- EDGE-01 through EDGE-06: Pocket line visual states (06-01)
- EDGE-07 through EDGE-08: Communication edge appearance/color (06-02)
- EDGE-09 through EDGE-10: Tension tinting and resolution flash (06-03)

Ready for Phase 7 (Band Setup Panel) or Phase 8 (Performance Polish). The pre-existing TypeScript errors in audio files should be investigated before shipping.

---
*Phase: 06-edge-visualization*
*Completed: 2026-03-11*
