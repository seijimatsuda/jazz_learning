# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 9 — Data Layer and Structural Refactor (v1.1 start)

## Current Position

Phase: 9 of 11 in v1.1 (Data Layer and Structural Refactor)
Plan: 4 of 4 in current phase
Status: Phase complete
Last activity: 2026-03-12 — Completed 09-04-PLAN.md (dynamic pitch wiring, zero TS errors)

Progress: [█████████░] ~88% (v1.0 complete, Phase 9 fully complete)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 38
- Total phases: 8
- Total execution time: 2 days

**By Phase (v1.0):**

| Phase | Plans | Status |
|-------|-------|--------|
| 1-8 | 38 | Complete |
| 9 | 4/4 | Complete |
| 10-11 | 0/5 | Not started |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full v1.0 decision log: milestones/v1.0-ROADMAP.md and PROJECT.md.

Recent decisions affecting v1.1:
- Phase 9: Circular layout chosen over d3-force (deterministic, O(n), same visual result for uniform-weight graphs)
- Phase 9: InstrumentName kept as strict TypeScript union (not loosened to string) — preserves compile-time safety
- Phase 9: Disambiguation logic (sax/keyboard, vibes/keyboard, multi-horn) deferred to v1.2 — requires empirical calibration on real recordings
- Phase 10: Vibes + keyboard simultaneous selection policy must be decided before Phase 10 ships (product decision: allow with transparency, or prevent in UI)

09-01 decisions:
- D-09-01-1: INSTRUMENT_BAND_MAP vibes entry covers both mid and mid_high as default (vibes spans both ranges simultaneously)
- D-09-01-2: MID_RANGE_INSTRUMENTS exported as named export for calibration code (Plan 02) to use

09-02 decisions:
- D-09-02-1: All scorer/calibration functions confirmed generic for 2-8 instruments — zero code changes needed in InstrumentActivityScorer.ts, RoleClassifier.ts, or CalibrationPass.ts
- D-09-02-2: CalibrationPass calibrates per-frequency-band (not per-instrument), inherently lineup-agnostic

09-03 decisions:
- D-09-03-1: Pre-computed grid/cluster positions used for counts 5-8 (not circular math) — deterministic, visually tuned for 2:1 aspect ratio canvas
- D-09-03-2: PairTuple type exported from NodeLayout.ts (describes graph structure, not edge animation behavior)
- D-09-03-3: INSTRUMENT_ORDER kept in NodeLayout.ts with deprecation note — removing requires larger sweep outside this plan's scope

09-04 decisions:
- D-09-04-1: Drums excluded from pitch detection at init time in App.tsx (ACF2+ on transients is spurious) — not at tick time
- D-09-04-2: Call-response detection scope stays keyboard+guitar only; guarded silently when either absent
- D-09-04-3: Bass included in pitch detection — bass pitch tracking via ACF2+ is valid and musically meaningful

### Pending Todos

None.

### Blockers/Concerns

- [Phase 10]: iOS canvas performance at 8 instruments (28 edges, quadratic growth) needs empirical device test early in execution — do not defer to end of phase
- [Phase 10]: Layout geometry for 5-8 nodes must be validated against 800x400 canvas constraints (tension meter right edge, BPM display bottom-left) — pre-computed positions in NodeLayout.ts are starting point

## Session Continuity

Last session: 2026-03-12
Stopped at: Completed 09-04-PLAN.md — dynamic pitch wiring, zero TypeScript errors, Phase 9 fully complete
Resume file: None
