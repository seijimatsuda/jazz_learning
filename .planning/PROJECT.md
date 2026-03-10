# Jazz Communication Visualizer

## What This Is

A browser-based React application that analyzes uploaded jazz audio recordings and visualizes real-time instrument communication as an animated node graph, alongside a live harmonic tension meter, chord detection system, and rhythmic pocket visualization. Users specify the band lineup (keyboard, bass, drums, guitar) and the tool maps instrument activity, roles, interactions, harmonic tension, and rhythmic relationships dynamically as the audio plays. Built for jazz students, musicians, and educators who want to SEE what they're hearing in ensemble communication.

## Core Value

The visualization must be musically meaningful — instrument role detection, chord identification, tension arcs, and pocket scoring need to be accurate enough that a jazz musician would recognize what's happening in the music by watching the visualization alone.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Audio upload and Web Audio API pipeline (MP3/WAV → AnalyserNode → FFT)
- [ ] Frequency band splitting per instrument type with 3-second calibration pass
- [ ] Per-instrument activity scoring (0.0–1.0) and role classification (soloing/comping/holding/silent)
- [ ] Keyboard vs guitar disambiguation via ZCR + spectral flux
- [ ] Cross-correlation communication edge detection between instrument pairs
- [ ] Chroma vector extraction and chord template matching (maj, min, maj7, m7, dom7, dim7, m7b5, alt)
- [ ] Chord function assignment (tonic/subdominant/dominant/altered) with plain English labels
- [ ] Harmonic tension scoring (0.0–1.0) with smoothing and confidence display
- [ ] Dual-stream beat detection (drum transient + bass onset) with BPM derivation
- [ ] Pocket score measurement (bass ↔ drums sync within ±80ms window)
- [ ] Canvas-based node graph with dynamic layout (2–4 instruments)
- [ ] Bass node as gravitational center with deep amber breathing glow
- [ ] Drums node as conversationalist with crisp ripples and orbit effect
- [ ] Role-based node visual states (size, color, glow animations)
- [ ] Beat-responsive canvas (all nodes pulse, background breathes)
- [ ] Bass ↔ drums pocket line (always visible, animated, floating label)
- [ ] Tension-tinted edges (amber/orange/red shift at high tension)
- [ ] Vertical tension meter with continuous color gradient
- [ ] Chord label display with plain English function and confidence badge
- [ ] Timeline scrubber with pre-computed tension heatmap
- [ ] Chord log (expandable drawer, timestamped, clickable to jump)
- [ ] Left panel: band setup (pre-playback) and node detail (on click)
- [ ] Node detail: activity sparkline, role breakdown pie chart, sync partner
- [ ] BPM display (♩ = 124 or ♩ = — for rubato)
- [ ] Role legend
- [ ] Pitch detection (YIN/autocorrelation) for melody analysis
- [ ] Call-and-response detection (keyboard → guitar within 2–4s window)
- [ ] Conversation log panel (timestamped call/response moments)
- [ ] Key detection with chord function relative to detected key
- [ ] Bar/beat grid overlay on timeline
- [ ] User annotation on timeline
- [ ] Export session as JSON or image
- [ ] Pre-loaded example tracks with expert annotations
- [ ] iOS Safari compatible from day one (Web Audio API, Canvas rendering)

### Out of Scope

- Backend/server — all processing in-browser
- Stem separation / source isolation — works on mixed-down stereo recordings
- MIDI input or real-time microphone capture
- Native mobile app — web only, iOS Safari compatible

## Context

- The app works on mixed-down stereo jazz recordings, not isolated stems. Instrument detection relies on frequency band splitting and spectral feature analysis, which means accuracy is inherently limited by frequency overlap between instruments.
- Meyda.js provides audio feature extraction (RMS, spectral centroid, chroma vectors, ZCR). Web Audio API AnalyserNode with FFT size 4096 provides raw frequency data.
- The bass ↔ drums relationship is the visual spine of the entire app. The pocket score drives a dedicated always-visible edge with special rendering. This relationship should feel like the heartbeat of the visualization.
- Chord detection uses chroma → template matching with cosine similarity. Confidence = gap between best and second-best match. Smoothing over 300ms window prevents flicker.
- Beat detection uses two parallel streams: spectral flux for drum transients (ride cymbal 6–10kHz, snare 200–800Hz) and RMS energy delta for bass onsets (20–250Hz).
- Canvas rendering downsampled to ~10fps for role classification. Visualization runs at full requestAnimationFrame rate.
- The spec defines exact hex colors, animation timings, threshold values, and layout geometry. These should be treated as the design system.

## Constraints

- **Tech stack**: React (Vite) + Web Audio API + Canvas API + Meyda.js + Tailwind CSS — no backend
- **Browser**: Must work on iOS Safari and desktop Chrome. Web Audio API has iOS-specific quirks (user gesture required to start AudioContext)
- **Performance**: All audio analysis runs in-browser. Canvas animations must stay smooth at 60fps while running FFT analysis
- **Port**: Dev server on port 5555

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Canvas API over D3.js | Need precise control over per-pixel animation, glow effects, ripples. Canvas gives lower-level control needed for the visual language described in spec | — Pending |
| Meyda.js for feature extraction | Provides chroma vectors, RMS, ZCR, spectral features out of the box. Avoids reimplementing DSP primitives | — Pending |
| Frequency band splitting (not stem separation) | No backend, browser-only. Stem separation requires ML models too heavy for client-side. Frequency bands are a pragmatic tradeoff | — Pending |
| Musically meaningful accuracy target | Audience includes jazz musicians and educators. Wrong role assignments would undermine trust and educational value | — Pending |
| iOS compatible from day one | Avoids costly rebuild later. Desktop-primary usage but architecture decisions (AudioContext, Canvas) must account for iOS Safari from the start | — Pending |
| Full spec (v1 + v1.5 + v2) in single milestone | User wants the complete vision built. Spec is detailed enough to support this scope | — Pending |

---
*Last updated: 2026-03-10 after initialization*
