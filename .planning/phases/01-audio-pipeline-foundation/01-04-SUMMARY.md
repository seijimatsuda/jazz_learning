---
phase: 01-audio-pipeline-foundation
plan: "04"
subsystem: audio
tags: [web-audio-api, calibration, transport, playback, zustand, react, tailwind]

requires:
  - phase: 01-audio-pipeline-foundation/01-03
    provides: dual AnalyserNodes (smoothed + raw), pre-allocated typed arrays, FrequencyBandSplitter with getBandEnergy

provides:
  - runCalibrationPass: silent 3s calibration computing solo/comping/holding thresholds per frequency band
  - getCurrentPosition: playback position helper for UI/timeline use
  - TransportControls: play/pause with full AudioBufferSourceNode lifecycle management
  - Timeline: 10fps scrubber, MM:SS display, click-to-seek
  - App.tsx orchestration: auto-run calibration after file load, show controls only post-calibration

affects:
  - 02-role-classification: CalibrationThresholds[] stored in audioStateRef.calibration are the input to Phase 2 threshold-based role detection
  - All phases: TransportState.isPlaying and getCurrentPosition form the core playback state consumed by all analyzers

tech-stack:
  added: []
  patterns:
    - "Silent calibration tap: connect source ONLY to rawAnalyser, never to destination — no user-audible output during calibration"
    - "AudioBufferSourceNode is single-use — create fresh source on every play call"
    - "AudioStateRef as single truth: transport.pauseOffset, startTime, isPlaying live on the ref, Zustand holds only UI-displayable copies at 10fps"
    - "Click-to-seek: stop/disconnect old source, update pauseOffset, conditionally recreate and start new source"

key-files:
  created:
    - src/audio/CalibrationPass.ts
    - src/components/TransportControls.tsx
    - src/components/Timeline.tsx
  modified:
    - src/audio/AudioEngine.ts
    - src/App.tsx

key-decisions:
  - "D-01-04-1: CalibrationPass receives setCalibrating as parameter (not Zustand import inside module) — keeps audio module testable and Zustand-free"
  - "D-01-04-2: Calibration source disconnected and not connected to destination — prevents double-volume and avoids audible calibration noise"
  - "D-01-04-3: TransportControls reads isCalibrated from audioStateRef.current directly on render — Timeline 10fps setInterval drives sufficient re-renders for button state"
  - "D-01-04-4: Timeline 10fps polling pattern via setInterval in useEffect — mirrors animation loop approach, keeps hot-path off React state"

patterns-established:
  - "AudioBufferSourceNode lifecycle: create fresh → connect → start → (ended handler) → stop/disconnect — never reuse"
  - "Seek pattern: stop existing source → update pauseOffset → if wasPlaying recreate and start from new offset"

duration: 2m 12s
completed: "2026-03-11"
---

# Phase 1 Plan 4: Calibration Pass and Transport Controls Summary

**Silent 3-second frequency calibration computing per-band solo/comping/holding thresholds, plus play/pause/seek transport controls and a 10fps timeline scrubber, wired into App.tsx as a post-load auto-calibrate → unlock controls flow.**

## Performance

- **Duration:** 2m 12s
- **Started:** 2026-03-11T00:02:01Z
- **Completed:** 2026-03-11T00:04:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- CalibrationPass samples per-band energy every 50ms for up to 3s using rawAnalyser as a silent tap, then computes peak/average/solo/comping/holding per band and stores on audioStateRef
- AudioEngine.ts gains getCurrentPosition() using the pauseOffset + elapsed-since-startTime pattern, clamped to track duration
- TransportControls manages full AudioBufferSourceNode lifecycle: fresh source per play, offset tracking, natural-end cleanup
- Timeline scrubber shows position at 10fps with MM:SS readout, progress fill, playhead dot, and click-to-seek that handles both playing and paused states
- App.tsx orchestrates the complete load → calibrate → play flow: file upload triggers calibration, "Calibrating..." shown during pass, controls unlock after calibration completes

## Task Commits

1. **Task 1: Create CalibrationPass module** - `ad1a16e` (feat)
2. **Task 2: TransportControls, Timeline, AudioEngine.getCurrentPosition, App.tsx wiring** - `93c4db9` (feat)

## Files Created/Modified

- `src/audio/CalibrationPass.ts` — runCalibrationPass: silent source→rawAnalyser tap, 50ms sample loop, threshold computation
- `src/audio/AudioEngine.ts` — added getCurrentPosition() helper
- `src/components/TransportControls.tsx` — Play/Pause buttons with source lifecycle management
- `src/components/Timeline.tsx` — 10fps scrubber with click-to-seek, MM:SS display, progress bar
- `src/App.tsx` — auto-calibration trigger on file load, conditional transport/timeline display

## Decisions Made

- **D-01-04-1:** CalibrationPass receives `setCalibrating` as a parameter rather than importing Zustand inside the audio module. Keeps audio layer pure and testable.
- **D-01-04-2:** Calibration source connected only to rawAnalyser (not destination). Silent pass — user hears nothing during calibration.
- **D-01-04-3:** TransportControls reads `isCalibrated` from `audioStateRef.current` directly on render. Timeline's 10fps setInterval re-renders provide sufficient refresh rate for button state to update after calibration completes.
- **D-01-04-4:** Timeline uses 10fps setInterval in useEffect — consistent with the animation loop approach established for the ref-based audio state pattern.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 1 plans 01 through 04 complete. One plan remains in Phase 1 (01-05, likely analysis loop).
- CalibrationThresholds[] are fully populated in audioStateRef.calibration after file load — Phase 2 role classification can begin threshold comparisons immediately.
- Transport state (pauseOffset, startTime, isPlaying) on audioStateRef is the authoritative position source for any analysis loop that needs sync'd timing.
- No blockers for Phase 2.

---
*Phase: 01-audio-pipeline-foundation*
*Completed: 2026-03-11*
