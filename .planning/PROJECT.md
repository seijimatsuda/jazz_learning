# Jazz Communication Visualizer

## What This Is

A browser-based React application that analyzes uploaded jazz audio recordings and visualizes real-time instrument communication as an animated node graph, alongside a live harmonic tension meter, chord detection system, and rhythmic pocket visualization. Users specify any combination of 2-8 jazz instruments (piano, bass, drums, guitar, saxophone, trumpet, trombone, vibes) and the tool maps instrument activity, roles, interactions, harmonic tension, and rhythmic relationships dynamically as the audio plays. Built for jazz students, musicians, and educators who want to SEE what they're hearing in ensemble communication.

## Core Value

The visualization must be musically meaningful — instrument role detection, chord identification, tension arcs, and pocket scoring need to be accurate enough that a jazz musician would recognize what's happening in the music by watching the visualization alone.

## Current State

**Shipped:** v1.1 Flexible Lineup (2026-03-12)
**Codebase:** 8,532 LOC TypeScript across 46 files
**Tech stack:** React (Vite) + Web Audio API + Canvas API + Meyda.js + Tailwind CSS + Zustand

All core features implemented plus flexible 2-8 instrument support with adaptive circular layout. Supports 8 instrument types: keyboard, bass, drums, guitar, saxophone, trumpet, trombone, vibraphone.

**Known limitations:**
- Instruments sharing frequency bands (sax/keyboard, vibes/keyboard, trombone/bass) are not disambiguated — analysis accuracy degrades when these pairs are selected together
- Horn section (3+ horns) frequency overlap makes individual instrument tracking unreliable
- Visual layout at 320px width with 8 instruments needs iOS device confirmation

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

### Active

(Requirements for next milestone defined via `/gsd:new-milestone`)

### Out of Scope

- Backend/server — all processing in-browser
- Stem separation / source isolation — works on mixed-down stereo recordings
- MIDI input or real-time microphone capture
- Native mobile app — web only, iOS Safari compatible
- Roman numeral notation — jazz musicians read chord names
- "Solo/mute" buttons per instrument — implies stem isolation
- Big band support (15+ instruments) — edge count and frequency overlap make analysis unreliable beyond ~8
- Mid-playback lineup changes — requires re-calibration and state reset

## Context

- The app works on mixed-down stereo jazz recordings, not isolated stems. Instrument detection relies on frequency band splitting and spectral feature analysis, which means accuracy is inherently limited by frequency overlap between instruments.
- Meyda.js provides audio feature extraction (RMS, spectral centroid, chroma vectors, ZCR). Web Audio API AnalyserNode with FFT size 4096 provides raw frequency data.
- The bass ↔ drums relationship is the visual spine of the entire app. The pocket score drives a dedicated always-visible edge with special rendering.
- Canvas rendering downsampled to ~10fps for role classification. Visualization runs at full requestAnimationFrame rate.
- v1.0 shipped in 2 days with 138 commits across 8 phases and 38 plans.
- v1.1 shipped in 1 day with 9 plans across 3 phases. Expanded from 4 to 8 instruments with adaptive layout.

## Constraints

- **Tech stack**: React (Vite) + Web Audio API + Canvas API + Meyda.js + Tailwind CSS — no backend
- **Browser**: Must work on iOS Safari and desktop Chrome
- **Performance**: All audio analysis runs in-browser. Canvas animations must stay smooth at 60fps while running FFT analysis
- **Port**: Dev server on port 5555

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Canvas API over D3.js | Need precise control over per-pixel animation, glow effects, ripples | ✓ Good — full control over visual language |
| Meyda.js for feature extraction | Provides chroma vectors, RMS, ZCR, spectral features out of the box | ✓ Good — note: spectralFlux has negative index bug, hand-rolled replacement |
| Frequency band splitting (not stem separation) | No backend, browser-only. Stem separation requires ML models too heavy for client-side | ✓ Good — pragmatic tradeoff |
| iOS compatible from day one | Avoids costly rebuild later | ✓ Good — architecture decisions correct, iOS gaps closed in v1.1 |
| HTMLCanvasElement for glow (not OffscreenCanvas) | iOS 16 OffscreenCanvas support incomplete | ✓ Good — works across all targets |
| audioStateRef pattern (not Zustand for hot path) | Web Audio objects non-serializable, rAF reads at 60fps | ✓ Good — clean separation of 60fps canvas vs React re-renders |
| Circular layout over d3-force | Deterministic, O(n), same visual result for uniform-weight graphs | ✓ Good — v1.1 |
| Strict TypeScript union for InstrumentName | Preserves compile-time safety, prevents typo bugs | ✓ Good — v1.1 |
| Vibes/keyboard conflict prevention in UI | Acoustically indistinguishable via FFT; defer to v1.2 with tremolo detection | ✓ Good — v1.1 |
| Pre-allocated edge render buffer | Zero per-frame heap allocations in 60fps render path | ✓ Good — v1.1 |
| Disambiguation deferred to v1.2 | Requires empirical calibration on real recordings, not safe to ship untested | ✓ Good — v1.1 |

---
*Last updated: 2026-03-12 after v1.1 milestone completed*
