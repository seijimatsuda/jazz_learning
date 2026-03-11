# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 1 — Audio Pipeline Foundation

## Current Position

Phase: 1 of 8 (Audio Pipeline Foundation)
Plan: 3 of 5 in current phase
Status: In progress
Last activity: 2026-03-10 — Completed 01-03-PLAN.md (Dual AnalyserNode + FrequencyBandSplitter)

Progress: [███░░░░░░░] 7.5% (3/40 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: ~2m 20s
- Total execution time: ~7 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 - Audio Pipeline Foundation | 3/5 | ~7m | ~2m 20s |

**Recent Trend:**
- Last 5 plans: 01-01 (2m 22s), 01-02 (2m 12s), 01-03 (~3m)
- Trend: Consistent sub-3min per plan

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Canvas API over D3.js — precise per-pixel control needed for glow/ripple animations
- [Init]: Meyda.js for feature extraction — chroma, RMS, ZCR, spectral flux out of the box
- [Init]: Frequency band splitting (not stem separation) — browser-only, no backend
- [Init]: iOS compatible from day one — AudioContext, Canvas, offscreen glow compositing required from Phase 1
- [D-01-01-1]: Tailwind 4 CSS-first via @tailwindcss/vite — no tailwind.config.js needed
- [D-01-01-2]: AudioStateRef in useRef only — Web Audio objects non-serializable, animation loop reads ref at 60fps
- [D-01-01-3]: fftSize=4096 fixed — 2048 frequency bins, ~21.5Hz resolution per bin at 44.1kHz
- [D-01-02-1]: AudioContext created synchronously in click handler before any await — iOS user gesture requirement
- [D-01-02-2]: sampleRate always read from audioCtx.sampleRate after creation — iOS may return 48000 despite requesting 44100
- [D-01-02-3]: Previous AudioContext closed before creating new one — prevents resource leaks on file re-load
- [D-01-03-1]: raw AnalyserNode NOT connected to destination — silent measurement tap only (connecting would double volume)
- [D-01-03-2]: connectSourceToGraph deferred to play time (01-04) — source nodes created fresh on each play
- [D-01-03-3]: 6 overlapping frequency bands including drums_low/drums_high — overlapping lets beat detection use dedicated bands

### Pending Todos

None.

### Blockers/Concerns

- [Phase 1 pre-work]: Verify Meyda.js 5.6.3 ScriptProcessorNode vs AudioWorklet default via Context7 before writing analysis code
- [Phase 2 pre-work]: Verify Meyda chroma internal sample rate handling empirically — test same file on iOS (48kHz) vs desktop Chrome (44.1kHz); if chroma vectors differ, custom chroma mapping required (~50 lines)
- [All phases]: iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option behavior unconfirmed — always read back `audioCtx.sampleRate` after creation
- [Note]: Requirements count discrepancy — REQUIREMENTS.md header says 83 but traceability table contains 96 entries across all categories. All 96 entries are mapped in the roadmap. Reconcile count before Phase 1 planning.

## Session Continuity

Last session: 2026-03-10T00:00:00Z
Stopped at: Completed 01-03-PLAN.md — FrequencyBandSplitter, dual AnalyserNodes, pre-allocated typed arrays. Ready for 01-04 (transport / play-pause).
Resume file: None
