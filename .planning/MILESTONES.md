# Project Milestones: Jazz Communication Visualizer

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
