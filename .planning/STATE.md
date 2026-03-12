# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 11 — Final Polish

## Current Position

Phase: 10 of 11 in v1.1 (Band Setup UI and Canvas Layout)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-03-12 — Completed 10-03-PLAN.md (edge batching and dynamic hide threshold)

Progress: [█████████░] ~94% (v1.0 complete, Phase 9 complete, Phase 10 complete, Phase 11 not started)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 38
- Total phases: 8
- Total execution time: 2 days

**By Phase (v1.1):**

| Phase | Plans | Status |
|-------|-------|--------|
| 9 | 4/4 | Complete |
| 10 | 3/3 | Complete |
| 11 | 0/2 | Not started |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full v1.0 decision log: milestones/v1.0-ROADMAP.md and PROJECT.md.

Recent decisions affecting v1.1:
- Phase 9: Circular layout chosen over d3-force (deterministic, O(n), same visual result for uniform-weight graphs)
- Phase 9: InstrumentName kept as strict TypeScript union (not loosened to string) — preserves compile-time safety
- Phase 9: Disambiguation logic (sax/keyboard, vibes/keyboard, multi-horn) deferred to v1.2 — requires empirical calibration on real recordings
- Phase 9: INST-08 (saxophone/keyboard disambiguation) reclassified as DISC-05 in v1.2 requirements
- Phase 9: EDGE_TYPE fallback operator removed — all 28 pairs defined, no silent defaults
- Phase 10: Vibes + keyboard simultaneous selection policy RESOLVED — prevented in UI with tooltip (shared 250-2000 Hz band, acoustically indistinguishable via FFT in v1.2 scope)

Phase 10 plan 03 decisions:
- D-10-03-1: Non-animated edges use rgba() in strokeStyle instead of globalAlpha — enables single-pass batch without save/restore per edge
- D-10-03-2: Animated (dashed) edges still isolated with save/restore — iOS Safari requires this for setLineDash correctness
- D-10-03-3: Dynamic threshold breakpoint at instrumentCount > 5 (threshold 0.45 at 6-8 instruments keeps 28-edge graph readable)
- D-10-03-4: getTintedColor() replaced with inline lerp in collect pass — eliminates string allocation per visible edge per frame
- D-10-03-5: Pre-allocated edgeRenderBuf at module level (28 slots) — zero per-frame heap allocations in hot render path

Phase 10 plan 02 decisions:
- D-10-02-1: position[0] convention — always canvas center regardless of instrument count
- D-10-02-2: count=2 special case — center + one peer offset right (no ring semantics)
- D-10-02-3: rx=0.34, ry=0.17 for visual circularity on 2:1 canvas (272px horizontal, 136px visual vertical)
- D-10-02-4: Ring starts at -PI/2 (12 o'clock) so first non-bass instrument is at top
- D-10-02-5: When bass absent, no reordering — position[0] becomes non-bass center anchor

Phase 9 decisions:
- D-09-01-1: INSTRUMENT_BAND_MAP vibes entry covers both mid and mid_high as default
- D-09-01-2: MID_RANGE_INSTRUMENTS exported as named export for calibration code
- D-09-02-1: All scorer/calibration functions confirmed generic for 2-8 instruments — zero code changes needed
- D-09-02-2: CalibrationPass calibrates per-frequency-band (not per-instrument), inherently lineup-agnostic
- D-09-03-1: Pre-computed grid/cluster positions used for counts 5-8 (deterministic, tuned for 2:1 aspect ratio)
- D-09-03-2: PairTuple type exported from NodeLayout.ts
- D-09-03-3: INSTRUMENT_ORDER kept in NodeLayout.ts with deprecation note
- D-09-04-1: Drums excluded from pitch detection at init time (ACF2+ on transients is spurious)
- D-09-04-2: Call-response detection stays keyboard+guitar only; guarded when either absent
- D-09-04-3: Bass included in pitch detection — bass pitch tracking via ACF2+ is valid

### Pending Todos

None.

### Blockers/Concerns

- [Phase 11]: iOS canvas performance at 8 instruments (28 edges) — CANV-03/CANV-04 batch rendering implemented in 10-03; empirical device test on iOS Safari should be done early in Phase 11 to validate improvements

## Session Continuity

Last session: 2026-03-12T00:00:00Z
Stopped at: Completed 10-03-PLAN.md (edge batching and dynamic hide threshold — Phase 10 complete)
Resume file: None
