# Project Research Summary

**Project:** Jazz Communication Visualizer — v1.1 Milestone (Flexible Instrument Lineup + Dynamic Canvas Layout)
**Domain:** Browser-based jazz audio analysis + Canvas node-graph visualization
**Researched:** 2026-03-11 (v1.1 update; v1.0 research 2026-03-10)
**Confidence:** HIGH for structural changes (direct source audit); MEDIUM for acoustic accuracy

---

## Executive Summary

v1.1 is a structural milestone, not an accuracy milestone. The core task is replacing the hardcoded 4-instrument assumption throughout the codebase with a data-driven approach that supports any 2–8 instrument lineup. Research across all four domains converges on a single organizing principle: everything that currently uses `INSTRUMENT_ORDER` as a module-level constant must instead receive the active lineup as a constructor parameter or function argument. This is not a large surface area, but it is a precise one — there are 13 confirmed hardcoded change sites, and four of them (the `PAIRS` IIFE in `drawCommunicationEdges.ts`, the `computeNodePositions` type signature, the `CanvasRenderer` constructor, and the pocket line index lookup) are zero-tolerance: any one left unfixed causes a crash or completely silent failure with no console error.

The recommended stack remains unchanged from v1.0 — no new npm dependencies are needed. The circular layout algorithm replaces the `d3-force` alternative that was evaluated and explicitly rejected: for a fully-connected uniform-weight graph of 2–8 nodes, circular layout is O(n), deterministic, and produces the same result that force simulation converges to anyway — without runtime ticks or simulation state. New frequency band definitions for saxophone, trumpet, trombone, and vibraphone use physics-verified ranges from UNSW acoustics resources, but the analysis accuracy story is deliberately limited in v1.1. All four new instruments overlap heavily in the `mid` (250–2000 Hz) and `mid_high` (300–3000 Hz) bands — this is an inherent constraint of single-analyser stereo analysis. The correct approach is to ship correct band definitions first, validate on real recordings, and move disambiguation logic to v1.2.

The primary risk for v1.1 is sequencing: the architectural refactor must be complete before any feature code is layered on top. The 8-step build order in ARCHITECTURE.md (data types → UI → analysis loop → App init → layout engine → renderer → edges → wiring) reflects true TypeScript compilation dependencies and must be followed. Attempting to build the BandSetupPanel UI before fixing the `PAIRS` IIFE or the renderer constructor produces a working UI form that drives broken analysis and a blank or crashing canvas.

---

## Key Findings

### Recommended Stack

The existing stack (React 19.2.0, TypeScript 5.9.3, Vite 7.3.1, Web Audio API, Meyda.js 5.6.3, Canvas 2D, Tailwind 4.2.1, Zustand 5.0.11) requires zero changes for v1.1. The only new production code is: extending `FrequencyBandSplitter.ts` with three new band definitions (`brass_low 80–500 Hz`, `brass_high 1000–6000 Hz`, `vibes_band 130–2100 Hz`), extending `InstrumentActivityScorer.ts` with 4 new `INSTRUMENT_BAND_MAP` entries, and replacing the switch-case in `NodeLayout.ts` with a circular polygon formula. `BrassWindDisambiguator.ts` for chroma-entropy-based sax-vs-keyboard disambiguation is designed and documented but is considered Phase 3 (v1.2 scope) pending threshold calibration on real recordings.

**Core technologies — unchanged from v1.0:**
- **Meyda.js 5.6.3:** `chroma`, `spectralCentroid`, `spectralRolloff`, `spectralFlatness`, `rms`, `ZCR` all confirmed correct. Do NOT call `Meyda.extract('spectralFlux', ...)` — confirmed broken (negative-index bug); use the hand-rolled `computeSpectralFlux()` in `KbGuitarDisambiguator.ts` for all instruments.
- **Web Audio API + Canvas 2D:** No change. The 10fps analysis / 60fps render architecture is fully sufficient for 2–8 instruments.
- **TypeScript `InstrumentName` union:** Keep as a strict union (not loosened to `string`) — preserves compile-time safety for `INSTRUMENT_BAND_MAP` and `resolveBandsForInstrument`.

**What NOT to add:**
- `d3-force`: circular layout is correct for n ≤ 8; force-directed converges to the same result with runtime overhead and non-determinism
- `Essentia.js`: AGPL-3.0 license risk, 10 MB WASM bundle
- Any new npm package: all needed capabilities are present in the existing stack

### Expected Features

v1.1 is scoped to two deliverables: correct frequency band support for new instruments and a canvas layout that adapts gracefully to 2–8 nodes. Feature research confirms this scope boundary. Disambiguation accuracy belongs to v1.2.

**Must have (table stakes):**
- Instrument toggle UI in BandSetupPanel with all 8 instruments visible, grouped by family (Rhythm / Melodic / Horns), with 2–8 count validation — universal pattern for any multi-instrument tool
- Circular layout algorithm replacing hardcoded 4-node diamond; handles 2–8 gracefully and deterministically
- Canvas nodes, edges, and pocket line all guarded against absent instruments (lineup without bass or drums must not crash)
- Pocket score conditional display: show when bass + drums both active, show drums-only consistency when drums present but bass absent, hide otherwise
- Instrument family color coding on canvas nodes
- Node count confirmation badge in setup UI

**Should have (differentiators that ship with v1.1):**
- Semantic node ordering before angle assignment: rhythm section adjacent, front-line horns grouped
- Edge type classification for all 22 new instrument pairs (e.g., `saxophone_trumpet` as `melodic`, `bass_saxophone` as `support`)
- Dynamic edge weight threshold scaling with node count (`0.3 + (nodeCount - 4) * 0.05`) to prevent hairball rendering at 8 nodes
- Node radius and label font scaling inversely with instrument count to prevent overlap on mobile (iPhone SE 320px)

**Defer to v1.2+:**
- Horn disambiguation (sax vs. trumpet vs. trombone on mixed recordings) — requires calibration on real audio
- Sax vs. keyboard chroma entropy disambiguation — `BrassWindDisambiguator.ts` is designed; thresholds 0.3/0.5 are estimates, not validated
- Vibes vs. keyboard disambiguation — hardest pair; inharmonic partial detection not implemented
- Session preset templates (quartet, quintet, etc.)
- Per-instrument calibration windows

### Architecture Approach

The existing two-loop architecture (10fps analysis writes into `audioStateRef`; 60fps render reads from it) remains completely unchanged in v1.1. What changes is that `CanvasRenderer` must receive the active lineup at construction time and derive all dependent state from it. The lineup is finalized before `VisualizerCanvas` mounts (the component is gated behind `isFileLoaded` in App.tsx), so no dynamic lineup update mechanism is required — the renderer is constructed with the correct lineup on every mount.

**Files that must be modified (10 total — no new files required):**

| File | Change |
|------|--------|
| `src/audio/types.ts` | `PitchAnalysisState` from fixed `{keyboard, guitar}` to `{instruments: Record<string, InstrumentPitchState>}` |
| `src/audio/InstrumentActivityScorer.ts` | Expand `InstrumentName` union to 8; add 4 `INSTRUMENT_BAND_MAP` entries; generalize `resolveBandsForInstrument` with `MID_RANGE_INSTRUMENTS` set |
| `src/audio/AnalysisTick.ts` | Update pitch detection section to iterate `state.pitch.instruments` record; update call-response guard |
| `src/canvas/nodes/NodeLayout.ts` | Replace `count: 2 \| 3 \| 4` switch-case with circular polygon formula for 2–8 |
| `src/canvas/CanvasRenderer.ts` | Accept `lineup: string[]` in constructor; derive `instrumentOrder`, `nodePositions`, `nodeAnimStates`, `edgeAnimStates`, `pairs` from lineup; fix pocket line guard; update `resize()`; expand `getNodeLayout()` return type |
| `src/canvas/edges/drawCommunicationEdges.ts` | Remove module-level `PAIRS` IIFE; accept pairs array as parameter from `CanvasRenderer` |
| `src/canvas/edges/edgeTypes.ts` | Add 22 new pair entries to `EDGE_TYPE` |
| `src/components/BandSetupPanel.tsx` | Add 4 instruments to `AVAILABLE_INSTRUMENTS`, `INSTRUMENT_ICONS`, `BAND_LABELS` |
| `src/components/VisualizerCanvas.tsx` | Pass lineup to `CanvasRenderer` constructor; update click handler to use `instruments` from `getNodeLayout()` |
| `src/App.tsx` | Build `pitch.instruments` record dynamically for all melodic instruments in lineup (exclude drums) |

### Critical Pitfalls

Ranked by crash/silent-failure severity:

1. **Module-level `PAIRS` IIFE in `drawCommunicationEdges.ts`** (V1, zero-tolerance) — `PAIRS` is computed once at module import from the static `INSTRUMENT_ORDER` constant. New instrument edges are silently absent — no runtime error, just invisible edges. Fix: remove the IIFE; compute pairs from the lineup inside `CanvasRenderer` and pass as a function parameter.

2. **`computeNodePositions` only handles `count: 2 | 3 | 4`** (V2, zero-tolerance) — No `default` branch in the switch-case; calling with 5–8 returns `undefined`; canvas crashes on `undefined.x` in the rAF loop. TypeScript will raise a compile error at the call site — treat this as the detection, not a warning to suppress. Fix: replace with circular polygon formula `x = cx + rx * cos(2π * i / n)`.

3. **`CanvasRenderer` constructor hardcodes 4 nodes and 6 pairs** (V3, zero-tolerance) — Constructor has no lineup parameter; `nodeAnimStates` is always length 4; `resize()` also hardcodes `computeNodePositions(4)`. Fix: add `lineup: string[]` parameter; derive all state from it.

4. **Pocket line assumes bass and drums are always present** (V4, zero-tolerance) — `INSTRUMENT_ORDER.indexOf('bass')` returns `-1` for lineups without bass; `this.nodePositions[-1].x` throws. Fix: guard with `if (bassIdx >= 0 && drumsIdx >= 0)` before calling `drawPocketLine`.

5. **Sax and keyboard share the `mid` band** (V5, moderate) — Both assigned to `['mid']` produces nearly identical, highly correlated activity scores. When sax is playing, keyboard registers as active. Fix for v1.1: define dedicated `sax_body` band or add chroma polyphony score disambiguation; at minimum document as known limitation in the UI.

6. **Calibration peak set by loudest shared-band instrument** (V10, moderate) — In a 3-instrument mid-range lineup (sax + keyboard + guitar), calibration peak is set by whoever is loudest in the opening 3 seconds. Quieter instruments are permanently underscored. Fix: scale effective thresholds by number of instruments sharing the band (`peak / N`).

7. **Edge count scales quadratically to 28 at 8 instruments** (V9, moderate on older iOS) — 28 `ctx.save/restore` pairs per frame at 60fps. Fix: batch non-animated edges; apply opacity early-exit (`currentOpacity < 0.01`); apply dynamic edge threshold to prune low-weight edges.

---

## Implications for Roadmap

Based on the dependency graph in ARCHITECTURE.md and the severity ranking in PITFALLS.md, a 3-phase structure is recommended:

### Phase 1: Data Layer and Structural Refactor

**Rationale:** The four zero-tolerance pitfalls (V1–V4) are foundational architectural problems. No feature work is safe until they are fixed. This phase has no visible user-facing output — it is pure architecture. Build order within the phase follows TypeScript compilation dependencies: types first, then consumers.

**Delivers:** A codebase that compiles cleanly for 8 instruments, does not crash at any lineup count from 2–8, and correctly propagates the active lineup through the full analysis and render pipeline.

**Addresses:**
- Expand `InstrumentName` union to 8 instruments
- Add 4 `INSTRUMENT_BAND_MAP` entries (saxophone, trumpet, trombone, vibes)
- Add 3 new frequency bands to `FrequencyBandSplitter.ts` (`brass_low`, `brass_high`, `vibes_band`)
- Change `PitchAnalysisState` to dynamic `{instruments: Record<string, InstrumentPitchState>}`
- Generalize `resolveBandsForInstrument` with `MID_RANGE_INSTRUMENTS` set
- Update `AnalysisTick.ts` pitch section to iterate the dynamic record
- Update `App.tsx` pitch initialization to cover all melodic instruments (exclude drums)
- Add `lineup: string[]` to `CanvasRenderer` constructor; derive all state from it
- Remove `PAIRS` IIFE from `drawCommunicationEdges.ts`; accept pairs as parameter
- Replace `computeNodePositions(count: 2 | 3 | 4)` with circular polygon formula for 2–8
- Guard pocket line on `bassIdx >= 0 && drumsIdx >= 0`
- Add all 22 new pair entries to `EDGE_TYPE` in `edgeTypes.ts`
- Define canonical instrument name constants to eliminate fragile inline string matching (V13)

**Avoids:** V1 (IIFE), V2 (layout crash), V3 (renderer constructor), V4 (pocket crash), V13 (fragile string matching), V14 (edge type silent defaults)

**Research flag:** No additional research needed. All 13 change sites are explicitly identified in ARCHITECTURE.md with file paths and line numbers. TypeScript will surface any remaining compile errors as validation.

---

### Phase 2: UI and Canvas Feature Completion

**Rationale:** With Phase 1 structurally correct, Phase 2 adds the user-visible features and canvas polish that make v1.1 feel complete. Items within this phase are largely independent of each other and can be parallelized.

**Delivers:** A fully functional 2–8 instrument UI with correct visual behavior, family color coding, and iOS-safe canvas rendering.

**Addresses:**
- BandSetupPanel: add 4 new instruments with icons and frequency labels; group by family; add count badge; enforce 2–8 validation
- Wire `VisualizerCanvas.tsx` to read lineup from Zustand and pass to `CanvasRenderer`; update click handler to use `instruments` from `getNodeLayout()`
- Pocket score conditional display in UI (hide when bass or drums absent; adapt when only one present)
- Instrument family color coding on canvas nodes (horns / keyboard-melodic / rhythm)
- Dynamic edge weight threshold scaling with node count
- Node radius and label font scaling inversely with instrument count
- Abbreviated 3-letter node labels for 7–8 instruments (Sax, Tpt, Tbn, Vbs, Kbd, Gtr, Bss, Dms)
- Gate melody/call-response UI display on `lineup.includes('keyboard') && lineup.includes('guitar')` (V12)
- Batch non-animated edges to reduce `ctx.save/restore` overhead at 8 instruments (V9 mitigation)

**Avoids:** V9 (edge rendering performance), V11 (node overlap on mobile), V12 (misleading melody UI for horn-only lineups)

**Research flag:** iOS canvas resize with variable node count needs empirical testing on a physical device (iPhone SE 320px viewport, 8 instruments). No additional research needed before starting; test during execution with a real device before shipping.

---

### Phase 3: Disambiguation and Accuracy (v1.2 scope)

**Rationale:** Disambiguation of overlapping instrument pairs (sax/keyboard, vibes/keyboard, multi-horn) cannot be calibrated without real jazz recordings. Attempting this in v1.1 before frequency bands have been validated in production would be premature optimization. Ship Phase 1 + Phase 2 as v1.1, validate on real audio, then address accuracy in v1.2.

**Delivers (v1.2):**
- `BrassWindDisambiguator.ts`: chroma polyphony score (Shannon entropy) for sax-vs-keyboard disambiguation — thresholds 0.3/0.5 require empirical calibration on real recordings before use
- Spectral rolloff as secondary signal (keyboard ~2500–4000 Hz; sax ~1500–2500 Hz)
- `spectralFlatness` for vibes-vs-keyboard (vibes = sparse inharmonic peaks, lower flatness; keyboard polyphony = denser spectrum)
- Multi-horn disambiguation using spectral centroid hierarchy (trombone centroid ~600–1500 Hz < saxophone ~1000–2500 Hz < trumpet ~1500–4000 Hz)
- Calibration threshold scaling by number of shared-band instruments

**Avoids (v1.2):** V5 (sax/keyboard), V6 (trumpet/guitar), V7 (trombone/bass), V8 (vibes/keyboard), V10 (calibration)

**Research flag:** Phase 3 needs `/gsd:research-phase` during planning. Chroma entropy thresholds, spectral rolloff ranges, and spectral flatness cutoffs for these specific instrument pairs cannot be established from acoustics literature alone — they require empirical testing on real mixed jazz recordings.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2 is non-negotiable. Four zero-tolerance crashes exist. Building UI without fixing them produces a working form that drives a broken canvas.
- Phase 2 items are deliberately independent of each other within the phase. BandSetupPanel changes and VisualizerCanvas wiring touch non-overlapping code and can be done in parallel.
- Phase 3 is explicitly out of v1.1 scope. Both FEATURES.md (MVP recommendation section) and STACK.md (confidence assessment) confirm that shipping frequency band definitions first and then calibrating disambiguation is the correct sequence.
- The 8-step build order in ARCHITECTURE.md must be followed within Phase 1: it reflects actual TypeScript compilation order (types → consumers → renderers → wiring).

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (v1.2 disambiguation):** Chroma entropy thresholds (0.3/0.5) are acoustics-reasoning estimates, not empirically validated. Spectral flatness cutoffs for vibes-vs-keyboard have no implementation precedent in this codebase. Flag this entire phase for `/gsd:research-phase`.

Phases with standard patterns (no additional research needed):
- **Phase 1 (structural refactor):** All 13 change sites are explicitly identified with file paths and line numbers in ARCHITECTURE.md. Standard TypeScript refactor; compiler validates correctness.
- **Phase 2 (UI + canvas):** Circular polygon layout formula is standard graph drawing math. Canvas edge batching and opacity early-exit are well-documented Canvas 2D optimization patterns. BandSetupPanel additions are straightforward data-driven UI.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies needed. Meyda 5.6.3 features verified against installed package source. Circular layout is standard verified formula. d3-force explicitly evaluated and rejected. |
| Features | HIGH for table stakes; MEDIUM for differentiators | Toggle/listing/validation features are unambiguous. iOS canvas resize behavior with variable node count is untested — empirical validation required in Phase 2. |
| Architecture | HIGH | All 13 change sites identified from direct read of 17 source files with line numbers confirmed. Module-level IIFE pitfall confirmed by direct reading of `drawCommunicationEdges.ts`. |
| Pitfalls | HIGH for structural (V1–V4, V9, V12–V14); MEDIUM for acoustic (V5–V8, V10) | Structural pitfalls from direct codebase audit. Acoustic pitfall severity from physics-verified frequency data (UNSW, DPA Microphones); specific calibration behavior is theoretical until tested on real recordings. |

**Overall confidence:** HIGH for Phase 1 and Phase 2 execution. MEDIUM for Phase 3 accuracy improvements (empirical calibration required).

### Gaps to Address

- **Chroma entropy thresholds (0.3/0.5):** Acoustics-reasoning estimates for sax-vs-keyboard disambiguation in `BrassWindDisambiguator.ts`. Cannot be validated without real mixed jazz recordings. Do not commit these values in v1.1 production code; flag for calibration in v1.2 planning.
- **iOS canvas performance at 8 instruments:** Quadratic edge growth (6 edges at 4 instruments → 28 at 8) is mathematically certain. Whether it drops below 30fps on iPhone SE is an empirical question. Test on a physical device early in Phase 2 execution, before completing the full implementation.
- **Vibes + keyboard simultaneous selection policy:** Whether to allow this combination (accepting known inaccuracy and documenting it) or prevent it in the UI is a product decision that must be made before Phase 2 ships. FEATURES.md suggests accepting the limitation with transparency. Confirm explicitly during Phase 2 planning.
- **Layout geometry for 5–8 nodes:** Coordinates in ARCHITECTURE.md are starting points for visual iteration. They must be tested on the actual 800×400 canvas against the tension meter (right edge x ≈ 0.95) and BPM display (bottom-left y ≈ 0.95) as layout constraints. This is a Phase 2 execution task, not a research gap.
- **Meyda `chroma` API input format:** `chroma` is a frequency-domain feature that accepts the amplitude spectrum, not the time-domain `rawTimeDataFloat` buffer. STACK.md flags this specifically. Confirm the correct input buffer at the call site in `BrassWindDisambiguator.ts` before shipping.

---

## Sources

### Primary (HIGH confidence)
- Direct source audit of 17 project source files (ARCHITECTURE.md) — all change sites identified with file paths and line numbers
- UNSW Acoustics (newt.phys.unsw.edu.au) — brass instrument harmonics, trumpet/trombone profiles, saxophone conical bore physics
- Meyda.js 5.6.3 installed package source — `chroma`, `spectralCentroid`, `spectralRolloff`, `spectralFlatness`, `spectralFlux` bug confirmed
- MDN browser-compat-data v7.3.6 — iOS Safari Web Audio API compatibility (v1.0 research)
- johndcook.com + UNSW saxophone pages — fundamental Hz ranges for all woodwinds
- DPA Microphones Acoustical Characteristics reference — instrument frequency zones

### Secondary (MEDIUM confidence)
- soundshockaudio.com tenor sax EQ guide — frequency zone breakdown
- Cambridge Intelligence graph layout guide — circular layout principles
- ISMIR 2018 jazz solo instrument classification (Fraunhofer) — spectral feature taxonomy for instrument recognition
- Lead Instrument Detection from Multitrack Music (arxiv 2025, arXiv:2503.03232) — disambiguation signal references
- Impedance Spectrum study for tenor sax and trumpet (University of Illinois REU) — harmonic profiles

### Tertiary (LOW confidence — validate before use)
- Vibraphone inharmonic partials (Wikipedia) — cited as MEDIUM confidence in STACK.md; tremolo-based vibes disambiguation has no implementation precedent
- Chroma polyphony score thresholds 0.3/0.5 — acoustics reasoning only, not empirically validated on real jazz recordings

---

*Research completed: 2026-03-11*
*v1.0 research: 2026-03-10*
*Ready for roadmap: yes*
