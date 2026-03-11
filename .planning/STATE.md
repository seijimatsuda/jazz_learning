# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Musically meaningful visualization — instrument roles, chords, tension arcs, and pocket scoring accurate enough that a jazz musician recognizes the music by watching
**Current focus:** Phase 2 — Instrument Activity Analysis

## Current Position

Phase: 2 of 8 (Instrument Activity Analysis)
Plan: 0 of 4 in current phase
Status: Ready to plan
Last activity: 2026-03-11 — Phase 1 complete and verified. Gaps fixed (iOS AudioContext, FFT read hoisting).

Progress: [█████░░░░░] 13% (5/40 total plans estimated)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: ~2m 24s
- Total execution time: ~12 minutes

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 - Audio Pipeline Foundation | 5/5 COMPLETE | ~12m | ~2m 24s |

**Recent Trend:**
- Last 5 plans: 01-01 (2m 22s), 01-02 (2m 12s), 01-03 (~3m), 01-04 (2m 12s), 01-05 (~3m)
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
- [D-01-04-1]: CalibrationPass receives setCalibrating as parameter — keeps audio module Zustand-free and testable
- [D-01-04-2]: Calibration source connected only to rawAnalyser (not destination) — silent pass, no audible noise
- [D-01-04-3]: AudioBufferSourceNode single-use — fresh source created on every play call
- [D-01-04-4]: Timeline 10fps setInterval polling — consistent with ref-based audio state pattern, off React hot-path
- [D-01-05-1]: HTMLCanvasElement (off-DOM) for glow layers instead of OffscreenCanvas — iOS 16 Safari OffscreenCanvas support is incomplete per RESEARCH.md
- [D-01-05-2]: Zero per-frame typed array allocations — getByteFrequencyData writes into pre-allocated audioStateRef.current.smoothedFreqData each rAF frame
- [D-01-05-3]: Tension heatmap uses spectral centroid variance as proxy — placeholder for Phase 3 chord-function tension (fast, offline-safe)
- [D-01-05-4]: File upload extended to accept m4a/aac/ogg/flac — Web Audio API decodeAudioData handles these natively; restriction was unnecessarily narrow for jazz recordings

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2 pre-work]: Verify Meyda chroma internal sample rate handling empirically — test same file on iOS (48kHz) vs desktop Chrome (44.1kHz); if chroma vectors differ, custom chroma normalization required (~50 lines)
- [All phases]: iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option behavior unconfirmed — always read back `audioCtx.sampleRate` after creation
- [All visual phases]: iOS Low Power Mode caps rAF at 30fps — documented known limitation; test with Low Power Mode OFF
- [Note]: Requirements count discrepancy — REQUIREMENTS.md header says 83 but traceability table contains 96 entries across all categories. All 96 entries are mapped in the roadmap. Reconcile count before Phase 2 planning.

## Session Continuity

Last session: 2026-03-11
Stopped at: Completed 01-05-PLAN.md — CanvasRenderer, offscreen glow, TensionHeatmap, full app layout. Phase 1 complete, human verification passed. Ready for Phase 2 (role classification).
Resume file: None
