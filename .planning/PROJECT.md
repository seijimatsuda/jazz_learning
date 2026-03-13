# Jazz Communication Visualizer

## What This Is

A browser-based React application that analyzes uploaded jazz audio recordings and visualizes real-time instrument communication as an animated node graph, alongside a live harmonic tension meter, chord detection system, and rhythmic pocket visualization. Users specify any combination of 2-8 jazz instruments (piano, bass, drums, guitar, saxophone, trumpet, trombone, vibes) and the tool maps instrument activity, roles, interactions, harmonic tension, and rhythmic relationships dynamically as the audio plays. Overlapping instrument pairs are disambiguated using spectral analysis, and instrument families are visually distinguished through color-coded ring strokes, spatial clustering, and typed edge animations. Built for jazz students, musicians, and educators who want to SEE what they're hearing in ensemble communication.

## Core Value

The visualization must be musically meaningful — instrument role detection, chord identification, tension arcs, and pocket scoring need to be accurate enough that a jazz musician would recognize what's happening in the music by watching the visualization alone.

## Current State

**Shipped:** v1.2 Instrument Disambiguation (2026-03-12)
**Codebase:** 9,795 LOC TypeScript
**Tech stack:** React (Vite) + Web Audio API + Canvas API + Meyda.js + Tailwind CSS + Zustand

All core features implemented including flexible 2-8 instrument support, instrument pair disambiguation (trombone/bass, vibes/keyboard, sax/keyboard, multi-horn), instrument family visual identity, and per-type edge animations. Supports 8 instrument types: keyboard, bass, drums, guitar, saxophone, trumpet, trombone, vibraphone.

**Known limitations:**
- Disambiguation thresholds (chroma entropy, spectral flatness cutoffs) are estimates — require empirical calibration on real jazz recordings (grep CALIBRATION_NEEDED)
- Visual layout at 320px width with 8 instruments needs iOS device confirmation
- DisambiguationState not re-initialized on post-calibration lineup change (2-second stale data window)

## Requirements

### Validated

- ✓ Audio upload and Web Audio API pipeline (MP3/WAV → AnalyserNode → FFT) — v1.0
- ✓ Frequency band splitting per instrument type with 3-second calibration pass — v1.0
- ✓ Per-instrument activity scoring (0.0–1.0) and role classification (soloing/comping/holding/silent) — v1.0
- ✓ Keyboard vs guitar disambiguation via ZCR + spectral flux — v1.0
- ✓ Cross-correlation communication edge detection between instrument pairs — v1.0
- ✓ Chroma vector extraction and chord template matching (8 chord types) — v1.0
- ✓ Chord function assignment with plain English labels — v1.0
- ✓ Harmonic tension scoring (0.0–1.0) with smoothing and confidence display — v1.0
- ✓ Dual-stream beat detection with BPM derivation — v1.0
- ✓ Pocket score measurement (bass ↔ drums sync within ±80ms window) — v1.0
- ✓ Canvas-based node graph with role-based visual states — v1.0
- ✓ Bass node as gravitational center with amber breathing glow — v1.0
- ✓ Drums node with crisp ripples and orbit effect — v1.0
- ✓ Beat-responsive canvas (all nodes pulse, background breathes) — v1.0
- ✓ Bass ↔ drums pocket line (always visible, animated, floating label) — v1.0
- ✓ Tension-tinted edges with resolution flash — v1.0
- ✓ Vertical tension meter with continuous color gradient — v1.0
- ✓ Timeline scrubber with tension heatmap and bar/beat grid — v1.0
- ✓ Chord log (expandable drawer, timestamped, clickable to jump) — v1.0
- ✓ Band setup panel and node detail panel — v1.0
- ✓ BPM display and role legend — v1.0
- ✓ Pitch detection and call-and-response detection — v1.0
- ✓ Key detection with chord function relative to detected key — v1.0
- ✓ User annotations on timeline — v1.0
- ✓ Export session as JSON or image — v1.0
- ✓ iOS Safari compatible from day one — v1.0
- ✓ Support 8 jazz instruments: keyboard, bass, drums, guitar, saxophone, trumpet, trombone, vibes — v1.1
- ✓ Band setup panel with toggle selection for any 2-8 instrument combination — v1.1
- ✓ Circular canvas layout adapting to 2-8 instruments with bass at center — v1.1
- ✓ Edge batching and dynamic hide threshold for iOS performance at high instrument counts — v1.1
- ✓ Pocket line gracefully handles lineups without bass or drums — v1.1
- ✓ Trombone vs bass disambiguation via onset timing and spectral flatness — v1.2
- ✓ Vibraphone vs keyboard disambiguation via tremolo modulation detection — v1.2
- ✓ Horn section disambiguation (sax vs trumpet vs trombone when 3+ horns present) — v1.2
- ✓ Saxophone and keyboard disambiguation via chroma entropy when both present — v1.2
- ✓ Instrument family color coding in node graph — v1.2
- ✓ Instrument family spatial grouping (horns cluster, rhythm section clusters) — v1.2
- ✓ Edge animation style varies by communication type (rhythmic, harmonic, melodic) — v1.2
- ✓ Remove edge fallback operator that never triggers — v1.2
- ✓ Add crash guard for malformed pair keys — v1.2
- ✓ Address single-read lineup pattern brittleness — v1.2

### Active

(No active requirements — planning next milestone)

### Out of Scope

- Backend/server — all processing in-browser
- Stem separation / source isolation — works on mixed-down stereo recordings
- MIDI input or real-time microphone capture
- Native mobile app — web only, iOS Safari compatible
- Roman numeral notation — jazz musicians read chord names
- "Solo/mute" buttons per instrument — implies stem isolation
- Big band support (15+ instruments) — edge count and frequency overlap make analysis unreliable beyond ~8
- Mid-playback lineup changes — requires re-calibration and state reset
- >80% accuracy claims on mixed stereo — physically unachievable without stem separation
- ML-based instrument classification — too heavy for browser (TF.js, ONNX)

## Context

- The app works on mixed-down stereo jazz recordings, not isolated stems. Instrument detection relies on frequency band splitting and spectral feature analysis, which means accuracy is inherently limited by frequency overlap between instruments.
- Meyda.js provides audio feature extraction (RMS, spectral centroid, chroma vectors, ZCR). Web Audio API AnalyserNode with FFT size 4096 provides raw frequency data. Note: Meyda spectralFlatness has Math.log(0) bug — hand-rolled replacement in SpectralFeatures.ts.
- The bass ↔ drums relationship is the visual spine of the entire app. The pocket score drives a dedicated always-visible edge with special rendering.
- Canvas rendering downsampled to ~10fps for role classification. Visualization runs at full requestAnimationFrame rate.
- v1.0 shipped in 2 days with 138 commits across 8 phases and 38 plans.
- v1.1 shipped in 1 day with 9 plans across 3 phases. Expanded from 4 to 8 instruments with adaptive layout.
- v1.2 shipped in 1 day with 9 plans across 3 phases. Added disambiguation, visual identity, and tech debt cleanup.

## Constraints

- **Tech stack**: React (Vite) + Web Audio API + Canvas API + Meyda.js + Tailwind CSS — no backend
- **Browser**: Must work on iOS Safari and desktop Chrome
- **Performance**: All audio analysis runs in-browser. Canvas animations must stay smooth at 60fps while running FFT analysis
- **Port**: Dev server on port 5555

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Canvas API over D3.js | Need precise control over per-pixel animation, glow effects, ripples | ✓ Good — full control over visual language |
| Meyda.js for feature extraction | Provides chroma vectors, RMS, ZCR, spectral features out of the box | ✓ Good — note: spectralFlux has negative index bug, spectralFlatness has Math.log(0) bug, both hand-rolled |
| Frequency band splitting (not stem separation) | No backend, browser-only. Stem separation requires ML models too heavy for client-side | ✓ Good — pragmatic tradeoff |
| iOS compatible from day one | Avoids costly rebuild later | ✓ Good — architecture decisions correct, iOS gaps closed in v1.1 |
| HTMLCanvasElement for glow (not OffscreenCanvas) | iOS 16 OffscreenCanvas support incomplete | ✓ Good — works across all targets |
| audioStateRef pattern (not Zustand for hot path) | Web Audio objects non-serializable, rAF reads at 60fps | ✓ Good — clean separation of 60fps canvas vs React re-renders |
| Circular layout over d3-force | Deterministic, O(n), same visual result for uniform-weight graphs | ✓ Good — v1.1 |
| Strict TypeScript union for InstrumentName | Preserves compile-time safety, prevents typo bugs | ✓ Good — v1.1 |
| Pre-allocated edge render buffer | Zero per-frame heap allocations in 60fps render path | ✓ Good — v1.1 |
| Raw/display activity score split | Preserves pre-disambiguation scores for pitch detection and history buffers | ✓ Good — v1.2 |
| Hand-rolled spectral extractors | Meyda spectralFlatness has Math.log(0) bug; chroma entropy and band centroid not in Meyda | ✓ Good — v1.2 |
| Pre-allocated Float32Array ring buffers | Zero per-tick allocation in disambiguation hot path | ✓ Good — v1.2 |
| VibesKeyboard confidence cap at 0.5 | Nyquist honesty bound — can't exceed 50% confidence at audio sample rates | ✓ Good — v1.2 |
| Family ring stroke outside fill (radius+1.5) | Ring sits outside fill circle with gap, no visual overlap | ✓ Good — v1.2 |
| CALIBRATION_NEEDED marker pattern | All empirical thresholds annotated for future calibration grep | ✓ Good — v1.2 |

---
*Last updated: 2026-03-12 after v1.2 milestone complete*
