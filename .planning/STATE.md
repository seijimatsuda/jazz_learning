# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** v1.2 Instrument Disambiguation — COMPLETE (all 3 phases shipped)

## Current Position

Phase: 14 of 14 (Tech Debt and Polish) — COMPLETE ✓ (verified)
Plan: 1 of 1 in current phase (all complete)
Status: Phase complete — goal verified 3/3
Last activity: 2026-03-12 — Phase 14 verified, all success criteria met

Progress: [██████████] 100% (v1.2 milestone complete — all 14 phases shipped)

## Performance Metrics

**Velocity:**
- v1.0: 8 phases, 38 plans, 2 days
- v1.1: 3 phases, 9 plans, 1 day
- v1.2: 3 phases, 9 plans, 1 day

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
- 12-06: Second-pass classifyRole guards on displayActivityScore !== activityScore — avoids redundant calls when disambiguation had no effect
- 12-06: Second pass passes instr.role (from first pass) as currentRole — hysteresis preserved across both passes
- 12-06: onRoleChange fires only when disambiguated role differs from first-pass role — Zustand not over-triggered
- 13-01: Ring drawn at radius+1.5 (not radius) — ring sits outside fill circle with 1.5px gap, no overlap
- 13-01: strings sort value 2 adjacent to keyboard value 1 — guitar and keyboard cluster for jazz comping/chordal role affinity
- 13-01: ringColor inherits ctx.globalAlpha — Phase 12 confidence dimming applies equally to ring and fill (correct behavior)
- 13-01: FAMILY_SORT_ORDER as module-level constant — preferred over constructor-scoped for readability
- 13-02: beatPulseIntensity added as last parameter to drawCommunicationEdges — preserves argument ordering, this.beatPulse/4 normalizes [0,4] to [0,1]
- 13-02: edgeType stored in EdgeRenderData during Pass 1 collect — avoids repeated EDGE_TYPE[key] lookup in Pass 3 render loop
- 13-02: supportBreathePhase advances at deltaMs * 0.0025 giving ~2513ms full cycle — distinctly slower than BPM-driven animations
- 14-01: KEY_PATTERN validates both format (lowercase_lowercase) and presence in EDGE_TYPE — two-condition guard before Record lookup
- 14-01: guard placed at Step 6 (just before EDGE_TYPE lookup), not top of loop — coordinate math and weight smoothing still run; only render buffer write skipped for invalid keys
- 14-01: lineup reactive selector placed at component level (not inside useEffect) — React rules of hooks prohibits hooks inside effects

### Pending Todos

None.

### Blockers/Concerns

- Disambiguation thresholds (chroma entropy 0.3/0.5, spectral flatness cutoffs) are estimates — require empirical calibration on real jazz recordings
- Calibration pass needed: grep CALIBRATION_NEEDED across all four disambiguators before production use

## Session Continuity

Last session: 2026-03-12
Stopped at: v1.2 milestone complete — all phases shipped
Resume file: None
