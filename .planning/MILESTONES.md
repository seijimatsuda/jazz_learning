# Project Milestones: Jazz Communication Visualizer

## v1.2 Instrument Disambiguation (Shipped: 2026-03-12)

**Delivered:** Disambiguation engine for overlapping instrument pairs (trombone/bass, vibes/keyboard, sax/keyboard, multi-horn) using spectral features, instrument family visual identity (color-coded ring strokes, spatial clustering, typed edge animations), and v1.1 tech debt closure.

**Phases completed:** 12-14 (9 plans total)

**Key accomplishments:**

- 4 instrument pair disambiguators using spectral flatness, chroma entropy, tremolo detection, and spectral centroid hierarchy
- Raw/display activity score split with pre-allocated Float32Array ring buffers for zero per-tick allocation
- Instrument family color coding via ring stroke on canvas nodes with family-sorted spatial clustering
- Per-type edge animations: rhythmic beat-pulse, melodic gradient flow, support opacity breathe
- Disambiguation confidence indicator (globalAlpha dimming) showing analysis uncertainty
- Tech debt cleanup: dead fallback removed, pair key crash guard added, lineup reading made reactive

**Stats:**

- 42 files modified
- 9,795 lines of TypeScript
- 3 phases, 9 plans
- 1 day from start to ship

**Git range:** `7fb49f7` → `b641408`

**What's next:** TBD — planning next milestone

---

## v1.1 Flexible Lineup (Shipped: 2026-03-12)

**Delivered:** Expanded jazz combo support from 4 fixed instruments to any combination of 2-8 instruments (adding saxophone, trumpet, trombone, vibes) with adaptive circular canvas layout, toggle-based band setup UI, edge batching for iOS performance, and v1.0 gap closures (iOS loadExample fix, dead code removal, hot-path cleanup).

**Phases completed:** 9-11 (9 plans total)

**Key accomplishments:**

- Expanded type system and frequency band definitions to 8 instruments with 28 edge pair classifications
- Generic scorer/calibration pipeline handles any 2-8 instrument lineup without instrument-specific code
- Bass-center circular layout with aspect-corrected ellipse adapting to 2-8 instruments
- Toggle-based band setup UI with family grouping, count validation, and vibes/keyboard conflict prevention
- Edge batching with zero per-frame heap allocations and dynamic hide threshold for large ensembles
- iOS AudioContext gesture fix, InstrumentRoleOverlay dead code removal, hot-path console.log cleanup

**Stats:**

- 43 files modified
- 8,532 lines of TypeScript
- 3 phases, 9 plans
- 1 day from start to ship

**Git range:** `285306a` → `88f38c8`

**What's next:** v1.2 — instrument disambiguation (sax/keyboard, vibes/keyboard, trombone/bass, multi-horn), instrument family color coding and spatial grouping

---

## v1.0 MVP (Shipped: 2026-03-11)

**Delivered:** Browser-based jazz recording analyzer with real-time animated node graph visualization showing instrument roles, chord detection, harmonic tension, beat tracking, pocket scoring, and melodic call-and-response — all running client-side with iOS Safari compatibility.

**Phases completed:** 1-8 (38 plans total)

**Key accomplishments:**

- iOS-safe audio pipeline with dual AnalyserNode, 3-second calibration, and sample-rate-aware FFT
- Per-instrument activity scoring and role classification (soloing/comping/holding/silent) with keyboard vs guitar disambiguation
- 8-chord template matching with confidence display, chord function labels, and pre-computed tension heatmap
- Dual-stream beat detection with BPM, swing ratio handling, rubato suppression, and bass↔drums pocket scoring
- Animated Canvas node graph with role-based visuals, beat-synchronized pulse, glow compositing, and edge visualization
- Full React UI: band setup, node detail panels, chord log, tension meter, key detection, annotations, and export

**Stats:**

- 46 files created/modified
- 8,503 lines of TypeScript
- 8 phases, 38 plans, 138 commits
- 2 days from start to ship

**Git range:** Initial commit → `8a46900`

**What's next:** v1.1 — flexible instrument selection (any combination), gap closures from v1.0 audit (iOS loadExample fix, dynamic node layout, dead code cleanup)

---
