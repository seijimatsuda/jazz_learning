---
phase: 10-band-setup-ui-and-canvas-layout
plan: "01"
subsystem: ui
tags: [react, toggle-buttons, band-setup, instrument-families, frequency-conflict]

# Dependency graph
requires:
  - phase: 09-data-layer-and-structural-refactor
    provides: useAppStore lineup/setLineup/isFileLoaded state, AVAILABLE_INSTRUMENTS constants
provides:
  - Toggle-based BandSetupPanel with 3 family groups (Rhythm, Chords/Melody, Front Line)
  - Count badge showing current / max instrument count
  - 2-instrument minimum / 8-instrument maximum enforcement
  - Vibes + keyboard simultaneous selection conflict prevention with tooltip
affects:
  - 10-02 (canvas layout — BandSetupPanel is rendered in main UI)
  - 10-03 (any further UI polish building on toggle grid)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Family grouping constant (INSTRUMENT_FAMILIES) defines ordered groups for rendering toggle rows"
    - "isDisabled computed per-toggle from 4 independent flags: isFileLoaded, wouldViolateMin, wouldViolateMax, conflict"
    - "isVibesKeyboardConflict() encapsulates acoustic-overlap business rule as a named function"

key-files:
  created: []
  modified:
    - src/components/BandSetupPanel.tsx

key-decisions:
  - "D-10-01-1: Vibes+keyboard conflict prevented in UI (not allowed simultaneously) — they share 250-2000 Hz band and are acoustically indistinguishable via FFT in v1.2 scope"
  - "D-10-01-2: useState import removed entirely — panel is now pure store-driven with no local state"
  - "D-10-01-3: AVAILABLE_INSTRUMENTS and BAND_LABELS constants preserved for future reference even though display uses INSTRUMENT_FAMILIES for rendering order"

patterns-established:
  - "Toggle state: per-toggle isDisabled computation separates file-lock, min/max, and conflict concerns clearly"
  - "Conflict tooltip: title prop carries explanation string; button disabled attribute blocks interaction"

# Metrics
duration: 1min
completed: 2026-03-12
---

# Phase 10 Plan 01: Band Setup Toggle UI Summary

**Replaced dropdown add/remove UI with 8 toggle buttons organized into 3 instrument family groups, with count badge, 2-8 count enforcement, and vibes+keyboard frequency conflict prevention.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-12T06:08:28Z
- **Completed:** 2026-03-12T06:09:30Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- All 8 instruments now render as toggle buttons in 3 labeled family groups: Rhythm (bass, drums), Chords / Melody (keyboard, guitar, vibes), Front Line (saxophone, trumpet, trombone)
- Count badge "N / 8" added to header row; minimum 2 enforced (last 2 selected toggles cannot be unchecked)
- Vibes and keyboard mutually exclusive: selecting one disables the other with a tooltip explaining the 250-2000 Hz frequency overlap
- Locked state preserved with cursor:not-allowed and "Locked" badge when isFileLoaded is true
- Removed dropdown select, instrument remove-button rows, useState import, and "optimized for 4 instruments" note

## Task Commits

1. **Task 1: Replace dropdown with toggle buttons and family grouping** — `a921ca6` (feat)

## Files Created/Modified

- `src/components/BandSetupPanel.tsx` — Complete rewrite: toggle grid with INSTRUMENT_FAMILIES grouping, handleToggle, isVibesKeyboardConflict, count badge, isDisabled per-toggle logic

## Decisions Made

- **D-10-01-1:** Vibes + keyboard conflict is prevented in UI — they share the 250-2000 Hz band and FFT cannot disambiguate them in v1.2 scope (tremolo detection deferred)
- **D-10-01-2:** useState removed entirely; panel is now pure Zustand store-driven with no local state
- **D-10-01-3:** AVAILABLE_INSTRUMENTS and BAND_LABELS constants kept for potential future use; rendering order now driven by INSTRUMENT_FAMILIES

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- BandSetupPanel toggle UI is complete and build-verified; ready for Phase 10 plans 02 and 03 (canvas layout)
- No blockers

---
*Phase: 10-band-setup-ui-and-canvas-layout*
*Completed: 2026-03-12*
