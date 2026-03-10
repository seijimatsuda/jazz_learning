# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 1 — Audio Pipeline Foundation

## Current Position

Phase: 1 of 8 (Audio Pipeline Foundation)
Plan: 1 of 5 in current phase
Status: In progress
Last activity: 2026-03-10 — Completed 01-01-PLAN.md (Project Scaffold and Core Types)

Progress: [█░░░░░░░░░] 3% (1/40 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 2m 22s
- Total execution time: ~2 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 - Audio Pipeline Foundation | 1/5 | 2m 22s | 2m 22s |

**Recent Trend:**
- Last 5 plans: 01-01 (2m 22s)
- Trend: Baseline established

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

### Pending Todos

None.

### Blockers/Concerns

- [Phase 1 pre-work]: Verify Meyda.js 5.6.3 ScriptProcessorNode vs AudioWorklet default via Context7 before writing analysis code
- [Phase 2 pre-work]: Verify Meyda chroma internal sample rate handling empirically — test same file on iOS (48kHz) vs desktop Chrome (44.1kHz); if chroma vectors differ, custom chroma mapping required (~50 lines)
- [All phases]: iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option behavior unconfirmed — always read back `audioCtx.sampleRate` after creation
- [Note]: Requirements count discrepancy — REQUIREMENTS.md header says 83 but traceability table contains 96 entries across all categories. All 96 entries are mapped in the roadmap. Reconcile count before Phase 1 planning.

## Session Continuity

Last session: 2026-03-10 23:50:57Z
Stopped at: Completed 01-01-PLAN.md — scaffold, types, and store done. Ready for 01-02 (Audio Engine).
Resume file: None
