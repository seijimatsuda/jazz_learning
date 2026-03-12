# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** v1.2 Instrument Disambiguation — Phase 12 complete, ready for Phase 13 (Visual)

## Current Position

Phase: 12 of 14 (Disambiguation Engine) — COMPLETE
Plan: 5 of 5 in current phase (12-01, 12-02, 12-03, 12-04, 12-05 complete)
Status: Phase complete
Last activity: 2026-03-12 — Completed 12-05-PLAN.md (DisambiguationEngine integration, Zustand, canvas confidence indicator)

Progress: [█████░░░░░] ~45% (Phase 12 all 5 plans complete — next: Phase 13 Visual)

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
- 12-01: activityScore kept on InstrumentAnalysis (not removed) — phase out incrementally to avoid breaking canvas/Zustand
- 12-01: displayActivityScore defaults to activityScore post-kb/guitar-disambiguation — preserves existing behavior until Wave 2/3
- 12-01: pitch detection gates on rawActivityScore — not suppressed by disambiguation weights
- 12-01: history buffer stores newScore (raw, pre-disambiguation) — cross-correlator needs raw correlation patterns
- 12-02: computeSpectralFlatness skips zero bins (not clamp to epsilon) — more accurate geometric mean over audible signal
- 12-02: chromaEntropy returns raw entropy [0, log2(12)], not normalized — callers normalize as needed
- 12-02: computeBandCentroid returns 0 on silence (not NaN) — safe default for threshold comparisons
- 12-03: 'sub' band (20–80 Hz) not in default bands — TromboneBassDisambiguator falls back to low quarter of 'bass' band bins
- 12-03: disambiguateSaxKeyboard is stateless (no DisambiguationState param) — caller writes confidence['sax_keyboard'] at integration time in 12-04
- 12-04: VibesKeyboardDisambiguator confidence capped at 0.5 (MAX_CONFIDENCE) — principled Nyquist honesty bound, not a bug
- 12-04: HornSectionDisambiguator returns empty weights (not equal) at confidence 0 when < 3 horns — caller skips weight application in that case
- 12-04: All empirical thresholds annotated CALIBRATION_NEEDED — future calibration pass should grep for this marker
- 12-05: Confidence indicator uses ctx.globalAlpha on entire drawNode call (circle + label), not label-only — drawNode does not expose separate label rendering path
- 12-05: onDisambiguationUpdate fires every tick (not change-gated) — confidence values are continuous
- 12-05: SaxKeyboard disambiguation skips ticks when chroma is null (no chord state) — graceful degradation

### Pending Todos

None.

### Blockers/Concerns

- Disambiguation thresholds (chroma entropy 0.3/0.5, spectral flatness cutoffs) are estimates — require empirical calibration on real jazz recordings
- Calibration pass needed: grep CALIBRATION_NEEDED across all four disambiguators before production use

## Session Continuity

Last session: 2026-03-12T23:07:10Z
Stopped at: Completed 12-05-PLAN.md (DisambiguationEngine integration)
Resume file: None
