---
phase: 07-react-ui-panels-key-detection
plan: 04
subsystem: ui
tags: [react, hooks, typescript, timeline, beat-grid, seek]

# Dependency graph
requires:
  - phase: 07-01
    provides: Timeline.tsx with tension heatmap and click-to-seek
  - phase: 04-beat-detection-bpm-pocket-score
    provides: BeatState with bpm/lastDownbeatSec on audioStateRef.current.beat

provides:
  - useSeek hook (src/hooks/useSeek.ts) with seekTo(timeSec) reusable across components
  - Timeline.tsx refactored to use useSeek instead of inline seek logic
  - Bar/beat grid overlay on Timeline when BPM is detected

affects:
  - 07-06 (chord log panel — uses useSeek for click-to-seek from chord entries)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useSeek pattern: seek logic extracted to custom hook, passed audioStateRef, returns seekTo callback
    - Beat grid rendering: inline IIFE inside JSX calculates tick positions from BPM + lastDownbeatSec

key-files:
  created:
    - src/hooks/useSeek.ts
  modified:
    - src/components/Timeline.tsx

key-decisions:
  - "D-07-04-1: useSeek takes MutableRefObject<AudioStateRef> as param (not individual transport fields) — consistent with Timeline pattern; hook reads full state to handle wasPlaying logic correctly"
  - "D-07-04-2: beatGrid polled inside existing 100ms setInterval — avoids second interval; identity comparison (bpm + lastDownbeatSec delta < 0.01) prevents unnecessary re-renders"
  - "D-07-04-3: Beat grid zIndex: 0 behind progress fill (zIndex: 1) — grid visible through semi-transparent progress overlay"

patterns-established:
  - "Audio ref hooks pattern: hooks accept MutableRefObject<AudioStateRef> and use useCallback — see useSeek, consistent with existing useAudioRef"
  - "Beat grid tick calculation: IIFE inside JSX with firstBeat alignment back to [0, beatInterval), isBarLine = beatsFromDownbeat % 4 === 0"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 7 Plan 04: useSeek Hook + Bar/Beat Grid Overlay Summary

**useSeek hook extracted from Timeline.tsx seek logic; bar/beat grid overlay added to Timeline with taller bar lines every 4 beats, hidden during rubato (bpm === null)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T20:44:44Z
- **Completed:** 2026-03-11T20:46:30Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `src/hooks/useSeek.ts` — reusable seekTo hook with stop/restart logic, ready for chord log panel (07-06)
- Refactored `Timeline.tsx` to use `useSeek` instead of inline seek logic; removed `connectSourceToGraph` import from Timeline
- Added bar/beat grid overlay: beat ticks at 30%-bottom height, bar ticks (every 4 beats) full-height and brighter; only renders when `beat.bpm !== null`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract useSeek hook from Timeline seek logic** - `5d87009` (feat)
2. **Task 2: Add bar/beat grid overlay to Timeline** - `5d87009` (feat, combined with Task 1)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/hooks/useSeek.ts` — useSeek hook: takes audioStateRef, returns seekTo(timeSec); handles stop-if-playing and restart from offset
- `src/components/Timeline.tsx` — refactored to use useSeek; added beatGrid state + polling; bar/beat grid overlay in scrubber JSX

## Decisions Made
- D-07-04-1: `useSeek` takes full `MutableRefObject<AudioStateRef>` — hook reads wasPlaying, smoothedAnalyser, rawAnalyser; can't be split to primitive props
- D-07-04-2: beatGrid polled inside existing 100ms interval — avoids second timer; identity check prevents spurious re-renders
- D-07-04-3: Beat grid at `zIndex: 0` behind progress fill (`zIndex: 1`) — grid visible through semi-transparent indigo fill

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `useSeek` is ready for import in 07-06 (chord log click-to-seek)
- Beat grid renders correctly when `audioStateRef.current.beat.bpm` is non-null; hidden during rubato sections
- TypeScript passes with zero errors (`npx tsc --noEmit`)

---
*Phase: 07-react-ui-panels-key-detection*
*Completed: 2026-03-11*
