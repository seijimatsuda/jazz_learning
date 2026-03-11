---
phase: 08-advanced-features
plan: 02
subsystem: audio-analysis
tags: [call-response, pitch-detection, canvas, edge-animation, zustand, typescript]

# Dependency graph
requires:
  - phase: 08-01
    provides: PitchDetector module and InstrumentPitchState.isMelodic field; onMelodyUpdate callback; stablePitchHz on InstrumentPitchState

provides:
  - CallResponseDetector.ts with sliding 2-4s window detection and debounce
  - CallResponseEntry and CallResponseState types in types.ts
  - callResponse field on AudioStateRef
  - callResponseFlashIntensity + callResponseGlowCanvas on EdgeAnimState (MEL-04)
  - Purple (#a855f7) edge flash on guitar_keyboard when call-response fires
  - callResponseLog: CallResponseEntry[] in Zustand (capped at 200, reset-safe)
  - AnalysisTick step 13 wired to updateCallResponse

affects: [08-03, 08-04, 08-05, ConversationLogPanel-consumption, guitar_keyboard-edge-visualizations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "boundHandleMelodyUpdate intercept pattern — CanvasRenderer wraps callback to inject flash trigger before forwarding to Zustand bridge"
    - "Lazy callResponse init inside AnalysisTick (fallback guard) + explicit App.tsx init — dual-init safety net"
    - "Per-edge flash intensity scalar + pre-created glow canvas at factory time (no per-frame allocations)"

key-files:
  created:
    - src/audio/CallResponseDetector.ts
  modified:
    - src/audio/types.ts
    - src/audio/AnalysisTick.ts
    - src/canvas/edges/EdgeAnimState.ts
    - src/canvas/edges/drawCommunicationEdges.ts
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx
    - src/App.tsx
    - src/store/useAppStore.ts

key-decisions:
  - "D-08-02-1: boundHandleMelodyUpdate pattern — CanvasRenderer creates bound handler that intercepts callResponse!=null to set flash=1.0, then forwards to external onMelodyUpdate. Avoids polling, preserves existing callback chain."
  - "D-08-02-2: Lazy callResponse init inside AnalysisTick (state.callResponse = initCallResponseState() on first tick) as safety net alongside App.tsx explicit init — handles edge case where tick fires before calibration completes."
  - "D-08-02-3: callResponseFlashIntensity decayed only in CanvasRenderer (not in drawCommunicationEdges) — decay belongs to the entity that owns the trigger, consistent with resolutionFlashIntensity pattern."
  - "D-08-02-4: drawCommunicationEdges renders purple glow with ctx.globalAlpha = intensity*0.8 then resets savedAlpha — avoids ctx.save()/restore() overhead for a simple alpha set; glow draw call uses 1.0 as its own alpha param."

patterns-established:
  - "Call-response detection: sliding window (2-4s gap), debounce via lastDetectedResponseSec, 4s expiry via gap>4.0 check"
  - "Edge flash: pre-created glow canvas at factory, intensity scalar decayed per frame in CanvasRenderer, drawn in drawCommunicationEdges when intensity>0.01"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 8 Plan 02: Call-and-Response Detection Summary

**Sliding window keyboard-to-guitar call-response detector (MEL-03) with animated purple edge flash on guitar_keyboard (MEL-04), debounced detection, and Zustand log capped at 200 entries**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T23:04:52Z
- **Completed:** 2026-03-11T23:08:46Z
- **Tasks:** 2
- **Files modified:** 8 (1 created)

## Accomplishments

- CallResponseDetector.ts implements MEL-03: detects keyboard→guitar melodic exchange within 2-4 second window with debounce and 4-second expiry
- Purple (#a855f7) glow flash on guitar_keyboard edge via callResponseFlashIntensity with ~2s decay (MEL-04)
- CallResponseEntry objects pushed to Zustand callResponseLog (capped at 200) for ConversationLogPanel consumption in later plans
- onMelodyUpdate callback signature updated to carry CallResponseEntry | null — zero extra overhead on non-event ticks

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CallResponseDetector and extend types/store** - `1857695` (feat)
2. **Task 2: Integrate into AnalysisTick, add purple edge flash, and wire CanvasRenderer trigger** - `d892e44` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/audio/CallResponseDetector.ts` — NEW: sliding window call-response detection with initCallResponseState() and updateCallResponse()
- `src/audio/types.ts` — Added CallResponseEntry, CallResponseState interfaces; callResponse field on AudioStateRef
- `src/audio/AnalysisTick.ts` — Step 13 added: updateCallResponse after pitch detection; onMelodyUpdate signature updated
- `src/canvas/edges/EdgeAnimState.ts` — Added callResponseFlashIntensity field and callResponseGlowCanvas (#a855f7)
- `src/canvas/edges/drawCommunicationEdges.ts` — Step 9: render purple glow when callResponseFlashIntensity > 0.01
- `src/canvas/CanvasRenderer.ts` — boundHandleMelodyUpdate for flash trigger; per-frame decay of callResponseFlashIntensity
- `src/components/VisualizerCanvas.tsx` — Updated setOnMelodyUpdate to push CallResponseEntry to Zustand
- `src/App.tsx` — Initialize callResponse state alongside pitch state; import initCallResponseState
- `src/store/useAppStore.ts` — Added callResponseLog: CallResponseEntry[]; addCallResponseEntry action; reset support

## Decisions Made

- **D-08-02-1:** `boundHandleMelodyUpdate` intercept pattern in CanvasRenderer — creates a bound handler at constructor time that fires flash trigger before forwarding to the external Zustand bridge callback. Keeps the signal path: AnalysisTick → CanvasRenderer (flash trigger) → VisualizerCanvas (Zustand bridge). No polling required.
- **D-08-02-2:** Dual initialization of callResponse state — explicit in App.tsx (alongside pitch state) plus lazy guard in AnalysisTick (`if (!state.callResponse)`) as safety net. Belt-and-suspenders approach prevents null pointer on first tick.
- **D-08-02-3:** callResponseFlashIntensity decay owned by CanvasRenderer (not drawCommunicationEdges) — the entity that triggers (intensity=1.0) also decays, parallel to how resolutionFlashIntensity is triggered in CanvasRenderer. Only the draw call is in drawCommunicationEdges.
- **D-08-02-4:** Purple glow rendered with `ctx.globalAlpha = intensity * 0.8` followed by `drawGlow(..., 1.0)` then globalAlpha restored — avoids full ctx.save()/restore() for a simple alpha set.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The useAppStore.ts had been updated since the plan was written (annotations feature added in a prior session), but the additions were additive and required no conflict resolution.

## Next Phase Readiness

- MEL-03 (call-response detection) and MEL-04 (animated purple edge) fully implemented
- callResponseLog in Zustand ready for ConversationLogPanel consumption (08-03 or later)
- The guitar_keyboard edge now has three flash states: sync (white), resolution (blue), call-response (purple) — fully composable
- No blockers for 08-03 through 08-05

---
*Phase: 08-advanced-features*
*Completed: 2026-03-11*
