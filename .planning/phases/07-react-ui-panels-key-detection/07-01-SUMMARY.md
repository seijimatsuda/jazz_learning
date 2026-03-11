---
phase: 07-react-ui-panels-key-detection
plan: 01
subsystem: ui
tags: [react, zustand, band-setup, lineup, instrument-roles]

# Dependency graph
requires:
  - phase: 05-canvas-node-graph
    provides: InstrumentName type and initAnalysisState lineup parameter
  - phase: 06-edge-visualization
    provides: Completed canvas rendering pipeline this panel controls

provides:
  - BandSetupPanel component with add/remove instrument UI and locked state
  - Zustand store extended with lineup, selectedInstrument, detectedKey, detectedKeyMode fields
  - App.tsx reads lineup from Zustand instead of hardcoded array
  - InstrumentRoleOverlay removed from render tree

affects:
  - 07-02 through 07-06: all Phase 7 plans consume selectedInstrument, detectedKey, detectedKeyMode from store

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Panel lock pattern: isFileLoaded disables add/remove, shows Locked badge"
    - "Zustand getState() in async callback: useAppStore.getState().lineup in .then() (not render)"

key-files:
  created:
    - src/components/BandSetupPanel.tsx
  modified:
    - src/store/useAppStore.ts
    - src/App.tsx

key-decisions:
  - "lineup default is ['bass', 'drums', 'keyboard', 'guitar'] matching prior hardcoded array"
  - "useAppStore.getState().lineup in then() callback — safe non-render access at async boundary"
  - "BandSetupPanel renders outside isFileLoaded guard — visible at all times, locked after load"
  - "InstrumentRoleOverlay removed entirely from App.tsx render tree (Phase 5 canvas node graph is the replacement)"

patterns-established:
  - "Panel lock: read isFileLoaded from Zustand, disable inputs and show badge"
  - "Dropdown resets to placeholder after selection via controlled selectValue state"

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 7 Plan 01: Band Setup Panel and Zustand Extension Summary

**BandSetupPanel with dropdown add/remove and locked-after-load state, Zustand extended with all Phase 7 UI fields (lineup, selectedInstrument, detectedKey, detectedKeyMode)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T20:40:30Z
- **Completed:** 2026-03-11T20:43:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Zustand store extended with all Phase 7 state fields and actions (lineup, selectedInstrument, detectedKey, detectedKeyMode with setters and reset)
- BandSetupPanel created: dropdown to add instruments not yet in lineup, rows with icon/name/frequency band label/remove button, Locked badge after file load
- App.tsx updated: reads lineup from Zustand for analysis init, renders BandSetupPanel above FileUpload, InstrumentRoleOverlay fully removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Zustand store with Phase 7 state fields** - `ab5456d` (feat)
2. **Task 2: Create BandSetupPanel and integrate into App.tsx** - `7112575` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified
- `src/store/useAppStore.ts` - Added Phase 7 fields: lineup, selectedInstrument, detectedKey, detectedKeyMode with setters and reset
- `src/components/BandSetupPanel.tsx` - Band lineup configuration panel with add/remove and locked state
- `src/App.tsx` - Reads lineup from Zustand, renders BandSetupPanel, InstrumentRoleOverlay removed

## Decisions Made
- `useAppStore.getState().lineup` called inside a `.then()` async callback (not during render) — safe and follows existing pattern for non-reactive audio state access
- BandSetupPanel rendered unconditionally (not behind isFileLoaded guard) so it's visible before file load for lineup configuration
- Optimization note shown only when lineup.length !== 4 and !isFileLoaded — avoids cluttering locked state

## Deviations from Plan

None - plan executed exactly as written. Task 1 was already committed prior to this execution session (ab5456d); Task 2 completed the plan.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BandSetupPanel visible and functional; locks after file load
- All Phase 7 Zustand fields available for Plans 02-06 (selectedInstrument for detail panel, detectedKey/detectedKeyMode for key detection display)
- InstrumentRoleOverlay removed; canvas node graph from Phase 5 is the active instrument visualization

---
*Phase: 07-react-ui-panels-key-detection*
*Completed: 2026-03-11*
