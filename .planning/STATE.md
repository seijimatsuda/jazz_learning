# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** v1.2 Instrument Disambiguation — Phase 12 (Disambiguation Engine)

## Current Position

Phase: 12 of 14 (Disambiguation Engine)
Plan: 2 of 5 in current phase
Status: In progress
Last activity: 2026-03-12 — Completed 12-02-PLAN.md (SpectralFeatures.ts)

Progress: [█░░░░░░░░░] ~10% (Phase 12 Plan 2 of 5 complete)

## Performance Metrics

**Velocity:**
- v1.0: 8 phases, 38 plans, 2 days
- v1.1: 3 phases, 9 plans, 1 day

## Accumulated Context

### Decisions

Full decision logs archived in milestones/v1.0-ROADMAP.md and milestones/v1.1-ROADMAP.md.

Recent decisions affecting current work:
- v1.2 roadmap: Phase 13 (visual) is independent of Phase 12 (disambiguation) — could run in parallel
- v1.2 roadmap: Raw/display score split must land in Wave 1 before any disambiguator code
- 12-02: computeSpectralFlatness skips zero bins (not clamp to epsilon) — more accurate geometric mean over audible signal
- 12-02: chromaEntropy returns raw entropy [0, log2(12)], not normalized — callers normalize as needed
- 12-02: computeBandCentroid returns 0 on silence (not NaN) — safe default for threshold comparisons

### Pending Todos

None.

### Blockers/Concerns

- Disambiguation thresholds (chroma entropy 0.3/0.5, spectral flatness cutoffs) are estimates — require empirical calibration on real jazz recordings
- Vibes/keyboard is the hardest pair — tremolo detection at 10fps is marginal, motor-off vibes are indistinguishable
- Phase 12 needs `/gsd:research-phase` during planning for threshold and window sizing investigation

## Session Continuity

Last session: 2026-03-12T22:53:45Z
Stopped at: Completed 12-02-PLAN.md (SpectralFeatures.ts)
Resume file: None
