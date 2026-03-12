# Project Research Summary

**Project:** Jazz Communication Visualizer — v1.2 Milestone (Instrument Disambiguation + Visual Polish)
**Domain:** Browser-based jazz audio analysis — spectral feature disambiguation + Canvas visual identity
**Researched:** 2026-03-12 (v1.2 update; v1.1 research 2026-03-11)
**Confidence:** MEDIUM-HIGH for disambiguation architecture; MEDIUM for acoustic accuracy; HIGH for visual changes

---

## Executive Summary

v1.2 is an accuracy and visual identity milestone. The core task is adding spectral feature-based disambiguation for 4 overlapping instrument pairs (sax/keyboard, vibes/keyboard, trombone/bass, multi-horn) and instrument family visual identity (color coding, spatial grouping, typed edge animations). Research across all four dimensions converges on three critical findings:

1. **Meyda's spectralFlatness is broken for this use case** — `Math.log(0)` produces `-Infinity` for any zero-valued FFT bin, collapsing output to 0. Must hand-roll, same as existing spectralFlux workaround.

2. **Disambiguation cascade will suppress keyboard** — Keyboard appears in 3 disambiguation pairs (vs guitar, vs sax, vs vibes). Without separating raw scores from display scores, three rounds of weight multiplication will drive keyboard activity to near-zero. Architecture must split raw vs disambiguated scores.

3. **New disambiguators should be STATEFUL** — Unlike the existing stateless KbGuitarDisambiguator, tremolo detection (vibes) and onset timing (trombone) inherently require multi-frame temporal windows. State is pre-allocated Float32Array buffers in `initAnalysisState()`, gated by lineup composition.

The stack requires zero new npm dependencies. All disambiguation techniques use existing Meyda features (chroma, spectralCentroid) plus hand-rolled replacements for broken extractors (spectralFlatness, spectralFlux). Visual family identity is purely additive — ring stroke color encodes family (fill already encodes role), and family-sorted instrument ordering clusters related instruments on the circular layout.

Realistic accuracy ceiling: **60-80% during solos, ~50% during tutti passages**. The system should display honest uncertainty (equal weights) during tutti rather than guessing. This is a fundamental limitation of single-analyser mixed stereo analysis.

---

## Key Findings

### Recommended Stack

**No new dependencies.** All disambiguation uses existing capabilities:

| Disambiguation Pair | Technique | Source | Confidence |
|---------------------|-----------|--------|------------|
| Sax vs keyboard | Chroma entropy (Shannon) | Existing chroma vectors from ChordDetector | MEDIUM — thresholds 0.3/0.5 are estimates |
| Vibes vs keyboard | Tremolo detection (3-7 Hz amplitude modulation) | RMS envelope ring buffer (new, hand-rolled) | LOW — no implementation precedent |
| Trombone vs bass | Onset timing + spectral flatness | Hand-rolled spectralFlatness (Meyda broken) + onset buffer | MEDIUM — dual-feature approach |
| Multi-horn (3+) | Spectral centroid hierarchy | Existing Meyda spectralCentroid | LOW — 45-60% accuracy on mixed stereo |

**What NOT to add:**
- `TensorFlow.js` / `ONNX Runtime` — ML models too heavy for browser, overkill for 4 disambiguation pairs
- `Essentia.js` — AGPL-3.0 license risk, 10 MB WASM bundle
- `Web Workers` for disambiguation — overhead exceeds benefit at 10fps with ~0.75ms added computation
- Any new npm package — all needed capabilities present in existing stack + hand-rolled extractors

### Expected Features

**Table stakes (must have for disambiguation to be useful):**
- Disambiguation confidence indicator per instrument (shows when analysis is uncertain)
- Graceful degradation — equal weights during tutti, no false precision
- Raw vs disambiguated score separation (prevents cascade suppression)
- Per-pair enable/disable based on lineup composition (only run relevant disambiguators)
- Hand-rolled spectralFlatness extractor (Meyda's is broken)

**Differentiators:**
- Instrument family ring color on canvas nodes (family identity without disrupting role-based fill)
- Family-sorted circular layout (horns cluster, rhythm clusters)
- Edge animation varies by communication type (rhythmic: beat-pulse, melodic: gradient, support: opacity breathe)
- Disambiguation debug overlay (visual feedback for calibration)

**Anti-features (deliberately NOT building):**
- Claiming >80% accuracy on mixed stereo — misleading and unachievable
- Per-instrument isolated confidence scores — implies stem separation capability
- Automatic threshold adaptation — too complex without ML, defer to manual calibration
- DISC-03 (3+ horn disambiguation) as individual tracking — recommend falling back to "horn section" entity when accuracy <50%

### Architecture Approach

**Disambiguation pipeline position:**
1. Activity scoring (existing) → produces raw scores
2. KbGuitarDisambiguator (existing, step 4 in AnalysisTick)
3. **NEW: SaxKeyboardDisambiguator** (chroma entropy) — only when both in lineup
4. **NEW: VibesKeyboardDisambiguator** (tremolo detection) — only when both in lineup
5. **NEW: TromboneBassDisambiguator** (onset timing + spectral flatness) — only when both in lineup
6. **NEW: HornSectionDisambiguator** (spectral centroid hierarchy) — only when 3+ horns in lineup
7. Weight factors multiply activity scores → produce display scores

**Critical architectural requirement — raw/display score split:**
```
rawActivity: number        // from InstrumentActivityScorer (before disambiguation)
activity: number           // after disambiguation weight multiplication (for display)
disambiguationConfidence: number  // 0-1, how certain the disambiguator is
```

**Stateful disambiguators:**
- Pre-allocated Float32Array ring buffers in DisambiguationState (initialized in initAnalysisState)
- Tremolo detection: 800ms window at 10fps = 8 samples (may need 1.6s = 16 for reliable low-end detection)
- Onset timing: 500ms window for attack detection
- State gated by lineup composition — zero allocation when disambiguator not needed

**Visual family identity data flow:**
- `instrumentFamilies.ts` — static constants: family assignments, colors, sort order
- NodeLayout.ts — family-sorted instrument ordering before position computation
- drawNode.ts — 2px ring stroke in family color (fill remains role-based)
- drawCommunicationEdges.ts — EDGE_TYPE already looked up in Pass 1; add animation branching in Pass 3

**Build order (5 waves, respects TypeScript compilation dependencies):**
1. **Wave 1:** types.ts additions + instrumentFamilies.ts constants (shared foundation)
2. **Wave 2:** Hand-rolled spectralFlatness + SaxKeyboardDisambiguator + TromboneBassDisambiguator
3. **Wave 3:** VibesKeyboardDisambiguator + HornSectionDisambiguator (needs Wave 1 types)
4. **Wave 4:** Visual family identity (ring color, family sort, spatial grouping) — independent of Wave 2-3
5. **Wave 5:** Edge animation differentiation — independent, can parallelize with Wave 4

### Critical Pitfalls

**Severity: Silent failure / crash:**

1. **D3 — Disambiguation cascade kills keyboard** — Keyboard in 3 pairs (guitar, sax, vibes). Weight multiplication: 0.7 × 0.7 × 0.7 = 0.34. Fix: split raw/display scores, apply max single-pair adjustment.
   - Prevention: raw/display split in types.ts before any disambiguator code
   - Phase: Must be Wave 1

2. **D1 — Meyda spectralFlatness returns -Infinity** — `Math.log(0)` on any zero FFT bin. Fix: hand-roll with epsilon guard, same pattern as computeSpectralFlux.
   - Prevention: Never call `Meyda.extract('spectralFlatness', ...)`
   - Phase: Wave 2, before TromboneBassDisambiguator

3. **D2 — Chroma entropy reflects ALL instruments, not target pair** — Chroma vector from ChordDetector includes all instruments' harmonics. Sax entropy is polluted by keyboard chroma. Fix: band-limit chroma extraction to target frequency range, gate by activity level.
   - Prevention: Band-limited chroma computation, not global chroma
   - Phase: Wave 2, SaxKeyboardDisambiguator implementation detail

**Severity: Degraded accuracy:**

4. **D4 — Tremolo detection is stateful** — Existing disambiguator pattern is stateless (per-tick). Tremolo at 3-7 Hz requires 8+ frames at 10fps. Fix: RMS ring buffer with autocorrelation.
   - Prevention: Design stateful architecture in Wave 1
   - Phase: Wave 1 (types), Wave 3 (implementation)

5. **D7 — Tutti passages defeat all disambiguation** — During full ensemble sections, frequency overlap is total. Fix: detect tutti (all instruments active >0.6) and set all disambiguators to equal weight (1.0).
   - Prevention: Tutti guard in each disambiguator
   - Phase: Each disambiguator implementation

6. **D10 — Calibration peak bias** — Calibration set by loudest shared-band instrument. Fix: scale thresholds by instrument count sharing each band.
   - Prevention: Normalize per shared-band-count during calibration
   - Phase: Wave 2

**Severity: Cosmetic / performance:**

7. **D6 — iOS Safari performance with additional per-frame computation** — ~0.75ms added to 10fps loop against ~11ms headroom. Should be fine but needs profiling.
   - Prevention: Profile on iPhone SE early
   - Phase: Wave 2-3 completion

---

## Implications for Roadmap

### Recommended Phase Structure (3 phases)

**Phase 12: Disambiguation Foundation**
- Wave 1: types.ts additions (DisambiguationState, raw/display score split, family constants)
- Wave 2: Hand-rolled spectralFlatness + SaxKeyboardDisambiguator + TromboneBassDisambiguator
- Wave 3: VibesKeyboardDisambiguator + HornSectionDisambiguator
- AnalysisTick wiring for all 4 disambiguators with lineup guards

**Phase 13: Visual Family Identity**
- Instrument family color coding (ring stroke on canvas nodes)
- Family-sorted circular layout (horns cluster, rhythm clusters)
- Edge animation differentiation (rhythmic/harmonic/melodic)
- Independent of Phase 12 — can potentially run in parallel

**Phase 14: Tech Debt + Polish**
- Remove edge fallback operator (`?? 'support'` in drawCommunicationEdges.ts:150)
- Add crash guard for malformed pair keys (drawCommunicationEdges.ts:209-210)
- Address single-read lineup pattern brittleness
- Disambiguation debug overlay (optional)

### Research Flags

- **Phase 12 needs `/gsd:research-phase`** — chroma entropy thresholds, spectralFlatness implementation, tremolo window sizing all need deeper investigation during planning
- **Phase 13 is standard** — color constants, sort ordering, Canvas 2D stroke are well-understood patterns
- **Phase 14 is standard** — tech debt cleanup from v1.1 audit, all change sites known

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. Hand-rolled extractors follow existing pattern. |
| Architecture | HIGH | Follows KbGuitarDisambiguator pattern exactly. Stateful extension is clean. |
| Sax/keyboard disambiguation | MEDIUM | Chroma entropy is sound theory. Thresholds need empirical calibration. |
| Trombone/bass disambiguation | MEDIUM | Dual-feature approach (onset + flatness). Onset timing may be unreliable for legato trombone. |
| Vibes/keyboard disambiguation | LOW | Tremolo detection at 10fps is marginal. Motor-off vibes are indistinguishable. |
| Multi-horn disambiguation | LOW | 45-60% accuracy on mixed stereo is barely better than even distribution. |
| Visual family identity | HIGH | Pure additive changes, backward compatible, no risk. |
| Overall accuracy | MEDIUM | 60-80% solos, ~50% tutti. Honest uncertainty display is critical. |

### Open Questions

- What is the actual per-tick timing budget remaining on iOS Safari? (needs profiling)
- Empirical chroma entropy distributions for sax vs keyboard on real jazz recordings
- Does band-limited chroma extraction provide enough discrimination?
- Vibes tremolo window: 800ms (8 samples) vs 1.6s (16 samples) at 10fps
- Should DISC-03 (3+ horns) fall back to "horn section" entity rather than individual tracking?

---

## Sources

### Primary (HIGH confidence)
- Direct source audit of project codebase (all disambiguation-relevant files read)
- Meyda.js 5.6.3 source inspection — spectralFlatness `Math.log(0)` bug confirmed
- Existing KbGuitarDisambiguator.ts — proven disambiguation pattern in this codebase
- v1.1 research (2026-03-11) — frequency band definitions, instrument spectral profiles

### Secondary (MEDIUM confidence)
- UNSW Acoustics — instrument harmonic profiles, spectral centroid ranges
- Shannon entropy for monophonic/polyphonic classification — established signal processing technique
- Amplitude modulation detection for vibraphone tremolo — standard DSP approach

### Tertiary (LOW confidence — validate before use)
- Chroma entropy thresholds 0.3/0.5 — acoustics reasoning only, not empirically validated
- Vibraphone tremolo detection at 10fps — no implementation precedent in this codebase
- Multi-horn spectral centroid hierarchy — theoretical ordering, untested on mixed recordings

---

*Research completed: 2026-03-12*
*Previous research: v1.1 (2026-03-11), v1.0 (2026-03-10)*
*Ready for roadmap: yes*
