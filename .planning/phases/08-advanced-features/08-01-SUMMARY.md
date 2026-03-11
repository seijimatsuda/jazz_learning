---
phase: 08-advanced-features
plan: 01
subsystem: audio
tags: [pitch-detection, autocorrelation, acf2plus, web-audio, zustand, typescript]

# Dependency graph
requires:
  - phase: 04-beat-detection-bpm-pocket-score
    provides: AnalysisTick pattern, AudioStateRef pre-allocated buffer pattern, BeatState model
  - phase: 02-instrument-activity-analysis
    provides: rawTimeDataFloat on AnalysisState, activityScore per instrument, InstrumentAnalysis lineup
provides:
  - PitchDetector.ts with ACF2+ autocorrelation pitch detection and 3-frame melodic stability window
  - InstrumentPitchState and PitchAnalysisState interfaces on AudioStateRef
  - Pitch detection integrated as step 12 in AnalysisTick for keyboard and guitar
  - kbIsMelodic / gtIsMelodic booleans in Zustand store for UI and call-response detection
affects:
  - 08-02: Call-and-response detection reads isMelodic from PitchAnalysisState each tick
  - 08-03: ConversationLogPanel reads kbIsMelodic/gtIsMelodic from Zustand for visual indicators

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ACF2+ autocorrelation on pre-allocated Float32Array correlation buffer (zero per-tick allocation)
    - 3-frame pitch stability window to distinguish melodic from energetic/transient activity
    - Activity-score gate (> 0.15) before pitch detection to reject silent instruments
    - onMelodyUpdate callback chain: AnalysisTick -> CanvasRenderer -> VisualizerCanvas -> Zustand

key-files:
  created:
    - src/audio/PitchDetector.ts
  modified:
    - src/audio/types.ts
    - src/audio/AnalysisTick.ts
    - src/store/useAppStore.ts
    - src/App.tsx
    - src/canvas/CanvasRenderer.ts
    - src/components/VisualizerCanvas.tsx

key-decisions:
  - "D-08-01-1: correlationBuffer pre-allocated as Float32Array(fftSize=4096) on InstrumentPitchState — not per-tick; matches zero-allocation policy in AnalysisTick"
  - "D-08-01-2: Full-spectrum rawTimeDataFloat used for pitch detection, gated by activityScore > 0.15 — band filtering not applied; ACF2+ on mix is acceptable for binary melodic/energetic distinction"
  - "D-08-01-3: stablePitchHz added to InstrumentPitchState (not in original plan spec) — needed by Phase 8-02 call-response detector to track pitch at time of melodic onset; zero cost addition"
  - "D-08-01-4: Pitch state initialization guarded to keyboard+guitar both in lineup — state.pitch = null when either is absent, skips Phase 8 block in AnalysisTick entirely"
  - "D-08-01-5: onMelodyUpdate fires every tick when state.pitch is non-null (not only on change) — call-response detector in 08-02 needs continuous signal, not edge-triggered"

patterns-established:
  - "Pattern: initInstrumentPitchState(fftSize) factory — mirrors initBeatState(), initChordState() conventions"
  - "Pattern: setOnMelodyUpdate method on CanvasRenderer — mirrors setOnBeatUpdate, setOnRoleChange, setOnChordChange pattern"

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 8 Plan 01: Pitch Detection Foundation Summary

**ACF2+ autocorrelation pitch detector with pre-allocated correlation buffer, 3-frame melodic stability window, and Zustand kbIsMelodic/gtIsMelodic booleans bridged through AnalysisTick → CanvasRenderer callback chain**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T22:57:34Z
- **Completed:** 2026-03-11T23:01:27Z
- **Tasks:** 2
- **Files modified:** 6 (+ 1 created)

## Accomplishments
- Created PitchDetector.ts with ACF2+ algorithm: RMS gate, autocorrelation into pre-allocated buffer, first-dip-then-peak search, parabolic interpolation
- Extended AudioStateRef with InstrumentPitchState and PitchAnalysisState; pitch field initialized null and set in App.tsx when keyboard+guitar are both in lineup
- Integrated pitch detection as step 12 in AnalysisTick, gated by activityScore > 0.15 per instrument; uses rawTimeDataFloat already populated each tick (zero extra allocation)
- Wired onMelodyUpdate callback through CanvasRenderer.setOnMelodyUpdate → VisualizerCanvas → Zustand setMelodyState; kbIsMelodic and gtIsMelodic now live in Zustand for UI consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PitchDetector module and extend types** - `d7365b5` (feat)
2. **Task 2: Integrate pitch detection into AnalysisTick and Zustand** - `1368f05` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/audio/PitchDetector.ts` — ACF2+ pitch detection: detectPitch, pitchesMatch, initInstrumentPitchState, updatePitchState
- `src/audio/types.ts` — Added InstrumentPitchState, PitchAnalysisState interfaces; pitch field on AudioStateRef; pitch: null in factory
- `src/audio/AnalysisTick.ts` — Import updatePitchState; onMelodyUpdate as 5th optional param; Phase 8 block as step 12; updated JSDoc
- `src/store/useAppStore.ts` — kbIsMelodic, gtIsMelodic state fields; setMelodyState action; reset() updates
- `src/App.tsx` — Import initInstrumentPitchState; initialize pitch state after beat state; lineup-guarded conditional
- `src/canvas/CanvasRenderer.ts` — onMelodyUpdate private field; setOnMelodyUpdate method; pass to runAnalysisTick
- `src/components/VisualizerCanvas.tsx` — Wire setOnMelodyUpdate → store.setMelodyState

## Decisions Made
- **D-08-01-1:** correlationBuffer pre-allocated as Float32Array(fftSize=4096) on InstrumentPitchState. Follows zero-allocation policy established in D-01-05-2 and enforced throughout AnalysisTick.
- **D-08-01-2:** Full-spectrum rawTimeDataFloat used for pitch detection, gated by activityScore > 0.15. Band-filtering the signal would require additional pre-allocated band extraction buffers and wasn't needed — the 3-frame stability window handles transient bleed rejection.
- **D-08-01-3:** stablePitchHz added as an additional field beyond the plan spec. The plan listed pitchHz, prevPitchHz, pitchFrameCount, isMelodic — stablePitchHz stores the last confirmed melodic pitch for use in 08-02 call-response detection.
- **D-08-01-4:** Pitch state initialized conditionally (keyboard AND guitar both in lineup). When either is absent, state.pitch stays null and the Phase 8 block in AnalysisTick is skipped entirely.
- **D-08-01-5:** onMelodyUpdate fires every tick (not edge-triggered). The call-response detector in 08-02 needs continuous presence information, not just change events.

## Deviations from Plan

None — plan executed as written with one minor additive extension (stablePitchHz field added to InstrumentPitchState as it was referenced in Phase 8 research and needed for 08-02).

## Issues Encountered
None. Pre-existing Vite build warnings (Uint8Array ArrayBufferLike, unused imports in other files) confirmed pre-existing before these changes; `npx tsc --noEmit` passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- state.pitch on AudioStateRef is initialized when keyboard+guitar in lineup; 08-02 CallResponseDetector can read state.pitch.keyboard.isMelodic and state.pitch.guitar.isMelodic directly
- onMelodyUpdate callback chain is fully wired; Zustand kbIsMelodic/gtIsMelodic ready for ConversationLogPanel (08-03)
- No blockers for 08-02

---
*Phase: 08-advanced-features*
*Completed: 2026-03-11*
