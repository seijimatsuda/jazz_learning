---
phase: 07-react-ui-panels-key-detection
plan: "05"
subsystem: audio
tags: [key-detection, music-theory, chord-analysis, typescript]

requires:
  - phase: 03-chord-detection
    provides: ChordDetector.ts with CHORD_TEMPLATES, chordLog, and confidenceGap

provides:
  - KeyDetector.ts with detectKey (KEY-01) and chordFunctionInKey (KEY-02)
  - NOTE_NAMES exported from ChordDetector.ts for cross-module reuse

affects:
  - 07-06 (ChordLog panel — consumes chordFunctionInKey to label each chord entry)
  - Any future UI panel displaying key context

tech-stack:
  added: []
  patterns:
    - "Pure function key detection — detectKey takes immutable chordLog slice, no side effects"
    - "Float32Array(12) pitch-class weight accumulation — matches zero-allocation convention for numeric accumulators"
    - "Semitone interval arithmetic with (+12)%12 guard for always-positive modulo"

key-files:
  created:
    - src/audio/KeyDetector.ts
  modified:
    - src/audio/ChordDetector.ts

key-decisions:
  - "NOTE_NAMES exported from ChordDetector (not duplicated in KeyDetector) — single source of truth for pitch class names"
  - "Mode detection uses majorW vs minorW weight split over same window — major/minor call based on which chord-type family accumulated more weight"
  - "confidenceGap as vote weight — high-confidence chords drive key detection; ambiguous chords contribute little"
  - "chordFunctionInKey returns plain string (not enum) — matches existing chordFunction convention in Zustand store (D-03-02-3)"

patterns-established:
  - "Key detection: 30s rolling window, pitch-class vote weighted by confidenceGap, mode from chord-type family split"
  - "chordFunctionInKey: interval = ((chordRootIdx - keyRootIdx) % 12 + 12) % 12, mapped via INTERVAL_TO_DEGREE dict"

duration: 1min
completed: 2026-03-11
---

# Phase 7 Plan 05: Key Detection Summary

**detectKey pure function with 30s weighted rolling window and chordFunctionInKey returning Roman-numeral labels like "G7 is the V chord in C major"**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-11T20:40:12Z
- **Completed:** 2026-03-11T20:41:12Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- NOTE_NAMES exported from ChordDetector.ts enabling cross-module reuse without duplication
- detectKey: accumulates confidenceGap-weighted votes per pitch class over 30s rolling window, returns key/mode/confidence
- chordFunctionInKey: maps semitone interval to Roman numeral degree (I through VII), formats "G7 is the V chord in C major"

## Task Commits

Each task was committed atomically:

1. **Task 1: Export NOTE_NAMES from ChordDetector.ts** - `733af87` (feat)
2. **Task 2: Create KeyDetector.ts with detectKey and chordFunctionInKey** - `bf086c4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/audio/ChordDetector.ts` - Added `export` keyword to NOTE_NAMES constant
- `src/audio/KeyDetector.ts` - New module: KeyDetectionResult interface, detectKey (KEY-01), chordFunctionInKey (KEY-02)

## Decisions Made
- [D-07-05-1]: NOTE_NAMES not duplicated in KeyDetector — imported from ChordDetector to maintain single source of truth for pitch class names
- [D-07-05-2]: Mode detection splits chord types into major-leaning (major, maj7, dom7) vs minor-leaning (all others) — mirrors assignChordFunction logic in ChordDetector
- [D-07-05-3]: confidenceGap used as vote weight in detectKey — high-confidence chord detections drive key inference more than ambiguous ones
- [D-07-05-4]: chordFunctionInKey returns plain string (not enum or object) — consistent with D-03-02-3 (chordFunction in Zustand is plain string)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- detectKey and chordFunctionInKey ready for consumption by ChordLog panel (Plan 07-06)
- NOTE_NAMES export available for any module needing pitch class names
- All KEY-01 and KEY-02 requirements satisfied; type-checks pass with `npx tsc --noEmit`

---
*Phase: 07-react-ui-panels-key-detection*
*Completed: 2026-03-11*
