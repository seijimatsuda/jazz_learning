---
phase: 08-advanced-features
plan: "04"
subsystem: ui
tags: [react, zustand, typescript, timeline, annotations]

# Dependency graph
requires:
  - phase: 07-ui-panels
    provides: Timeline.tsx with click-to-seek via useSeek hook
  - phase: 08-01
    provides: Phase 8 store shape and pattern (kbIsMelodic, gtIsMelodic)
provides:
  - Annotation type exported from useAppStore.ts
  - annotations array, addAnnotation, removeAnnotation in Zustand store
  - Timeline Shift+click annotation mode
  - Text input overlay at click position, Enter to submit, Escape to cancel
  - Amber 3px vertical annotation markers on timeline bar with hover tooltips
  - "Shift+click to annotate" hint below timeline
affects:
  - 08-05 (any future timeline feature needing annotation awareness)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Annotation input overlay placed outside overflow-hidden container to avoid clipping"
    - "crypto.randomUUID() for annotation IDs (no external UUID library)"
    - "Shift key guard in click handler for dual-mode behavior"

key-files:
  created: []
  modified:
    - src/store/useAppStore.ts
    - src/components/Timeline.tsx

key-decisions:
  - "D-08-04-1: Annotation interface defined in useAppStore.ts (not types.ts) — annotations are UI-only, not audio hot-path"
  - "D-08-04-2: Annotation input overlay rendered outside overflow-hidden scrubber bar (in wrapper div) — overflow:hidden clips absolute children with negative top offset"
  - "D-08-04-3: Annotation markers at zIndex:2 (above progress fill at zIndex:1) — markers always visible regardless of playback position"

patterns-established:
  - "Dual-mode click: shiftKey check before seek logic, early return prevents seek on annotation clicks"
  - "Overflow-hidden scrubber bar wrapped in relative div for overlay positioning"

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 8 Plan 04: Timeline Annotation System Summary

**Shift+click annotation system on the timeline — amber markers with hover tooltips, text input overlay, session-persistent Zustand storage**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T~
- **Completed:** 2026-03-11
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Exported `Annotation` interface `{ id, timeSec, text }` from useAppStore.ts
- Zustand store extended with `annotations[]`, `addAnnotation` (crypto.randomUUID), `removeAnnotation`, and reset support
- Timeline Shift+click opens positioned text input overlay above the click point
- Enter submits, Escape cancels annotation; overlay auto-focuses input
- Amber (3px) vertical markers rendered at timestamp positions with `title` tooltip
- Regular click-to-seek behavior fully preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Annotation type and store actions** - `f603988` (feat)
2. **Task 2: Add annotation mode and markers to Timeline** - `12b7718` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/store/useAppStore.ts` - Annotation interface, annotations array, addAnnotation/removeAnnotation actions, reset includes annotations:[]
- `src/components/Timeline.tsx` - Shift+click handler, annotation input overlay, amber markers, hint text

## Decisions Made
- **D-08-04-1:** Annotation interface defined in useAppStore.ts, not types.ts — annotations are UI state only, not audio domain types; follows pattern of co-locating UI-only types with their store
- **D-08-04-2:** Annotation input overlay rendered outside the `overflow-hidden` scrubber bar, in a wrapper `relative` div — the bar uses `overflow:hidden` for tension heatmap and progress fill; an overlay with negative top offset would be clipped inside it
- **D-08-04-3:** Annotation markers rendered at zIndex:2 inside the bar — sits above progress fill (zIndex:1) and beat grid (zIndex:0) so markers are always visible during playback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Annotation input overlay clipped by overflow:hidden scrubber bar**
- **Found during:** Task 2 (annotation overlay implementation)
- **Issue:** Plan specified `top: '-44px'` on overlay inside the `overflow-hidden` bar container, which would clip the overlay entirely
- **Fix:** Moved overlay rendering outside the scrubber bar into a new wrapper `<div className="relative w-full">`. Overlay uses `bottom: '100%'` relative to the wrapper instead of negative top inside bar
- **Files modified:** src/components/Timeline.tsx
- **Verification:** tsc --noEmit passes; overlay now appears above bar
- **Committed in:** 12b7718 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — overflow clipping)
**Impact on plan:** Fix required for overlay to be visible at all. No scope creep.

## Issues Encountered
None beyond the overflow-hidden deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- USER-01 (user annotations on timeline) fully implemented
- annotations array in Zustand is session-persistent (survives play/pause, clears on page refresh as expected)
- removeAnnotation action available if future UI needs annotation deletion
- Ready for 08-05

---
*Phase: 08-advanced-features*
*Completed: 2026-03-11*
