# Project Research Summary

**Project:** Jazz Learning — Browser-based jazz audio analysis and visualization
**Domain:** Browser-native music information retrieval + real-time Canvas visualization
**Researched:** 2026-03-10
**Confidence:** HIGH (stack and architecture verified against installed packages and MDN docs; features and pitfalls from MIR literature with high domain confidence)

---

## Executive Summary

This is a browser-native audio analysis and visualization tool for jazz ensemble recordings — a novel product with no direct competitor. The closest existing tools are Sonic Visualiser (desktop, research-grade) and iReal Pro (chord charts, no analysis). The right approach is: file upload via FileReader, Web Audio API for playback and FFT extraction, Meyda.js for feature extraction (chroma, RMS, ZCR, spectral flux), raw Canvas 2D for the animated node graph, and Zustand to share state between the 10fps analysis loop and the 60fps render loop without triggering React re-renders. The stack is well-chosen for the use case and all version choices have been verified against installed packages.

The central architectural decision is the two-loop pattern with a shared mutable ref. The analysis loop runs at ~10fps via `setInterval`, writes to `audioStateRef.current`. The render loop runs at 60fps via `requestAnimationFrame`, reads from `audioStateRef.current`. React only touches coarse UI state (chord label display, BPM text, tension meter number). This pattern keeps React out of the hot path entirely and is the correct architecture for audio-driven Canvas animation. Everything else in the architecture follows from this decision.

The highest risks for this project are not engineering unknowns — they are iOS Safari platform constraints that silently break audio if not addressed from day one. AudioContext must be created inside a user gesture handler (not on mount), iOS defaults to 48kHz sample rate (invalidating hardcoded FFT bin math), and `ctx.shadowBlur` on animated Canvas elements collapses framerate on iPhone hardware. All three are zero-tolerance items that belong in Phase 1 of the build. A fifth risk is specific to the domain: jazz recordings use swing rhythm and rootless voicings, both of which defeat standard BPM detection and chord template matching. The mitigation is graceful degradation — confidence scores, rubato suppression, and honest "Unknown" states — not attempts to solve MIR problems that remain open in the research literature.

---

## Key Findings

### Recommended Stack

The stack centers on Vite 7.3.1 + React 19.2.4 + TypeScript 5.9.3, scaffolded with `@vitejs/plugin-react-swc`. Audio analysis uses Web Audio API (browser built-in: AnalyserNode, decodeAudioData) plus Meyda.js 5.6.3 (MIT license, 556 KB, confirmed extractors). Visualization uses raw Canvas 2D — PixiJS and Three.js are both overkill and add bundle weight for a 5-15 node graph. Tailwind 4.2.1 handles surrounding UI chrome, but requires the new CSS-first configuration pattern (`@import "tailwindcss"` in CSS, `@tailwindcss/vite` plugin) — the v3 `tailwind.config.js` pattern does not work and silently produces no styles. Zustand 5.0.11 manages shared audio state.

Key version alert: Meyda.js 5.6.3 uses `ScriptProcessorNode` internally (deprecated but working on iOS Safari since iOS 7). This is acceptable for v1 but should be verified against Meyda v6 when it reaches stable.

**Core technologies:**
- React 19 + TypeScript 5.9: UI lifecycle and type safety across audio buffer types
- Vite 7 + plugin-react-swc: Fast HMR, clean WASM/worklet loading
- Meyda.js 5.6.3 (MIT): Confirmed chroma, RMS, ZCR, spectralFlux, spectralCentroid extractors
- Web Audio API (built-in): AnalyserNode FFT, decodeAudioData, AudioBufferSourceNode
- Canvas 2D (built-in): Animated node graph — zero bundle weight, full control
- Zustand 5.0.11: Selector-based state reads outside React render cycle
- Tailwind 4.2.1: UI chrome only — CSS-first config, @tailwindcss/vite plugin required

See `/Users/seijimatsuda/jazz_learning/.planning/research/STACK.md` for full alternatives analysis and iOS compat table.

### Expected Features

The MVP needs to deliver a coherent musically meaningful unit that a jazz musician would recognize as correct. The signal: "yes, that's a II-V-I" and "yes, the bass and drums are in the pocket." Features are grouped by dependency chain, not by complexity.

**Must have (table stakes — universal audio tool expectations):**
- Audio upload (MP3/WAV) via FileReader + loading progress feedback
- Waveform display with playhead + transport controls (play/pause/seek)
- BPM display (first thing a musician asks)
- Chord name display with confidence indicator (always show confidence — never show a chord without it)
- Smooth 60fps animation with no flicker
- iOS Safari compatibility (non-negotiable — jazz musicians use iPhones)

**Must have (jazz-specific table stakes):**
- Extended chord vocabulary: maj7, m7, dom7, dim7, m7b5, alt (showing "C major" instead of "Cmaj7" signals the tool doesn't understand jazz)
- Chord function labels: tonic / subdominant / dominant / altered
- Key detection (all chord function analysis depends on it)
- Instrument role labeling: soloing / comping / holding / silent
- Harmonic tension arc (0.0–1.0 continuous) + vertical tension meter

**Core differentiators (launch-critical):**
- Animated node graph (instrument communication network) — the signature feature; no existing tool does this
- Pocket score (bass-drums sync ±80ms cross-correlation) — educators have no existing tool for this
- Tension-tinted edges — visual encoding of harmonic state in the relationship graph
- Role-based node visual states (soloists look different than compers)
- Beat-synchronized canvas pulse (visualization breathes with the music)

**Should have (Phase 2):**
- Call-and-response detection + conversation log
- Timeline tension heatmap (navigate to harmonically interesting moments)
- Bar/beat grid overlay (requires accurate meter inference)
- Pre-loaded example tracks with annotations
- User annotations + JSON/image export
- Node detail panel (sparklines, role breakdown pie)

**Defer to v2+:**
- Pitch detection (YIN/autocorrelation) — accuracy on mixed recordings will undermine trust
- MIDI export / score generation — unsolved problem at useful accuracy
- Social features / accounts — backend required, low v1 ROI
- Stem separation — not browser-feasible without server

**Anti-features to explicitly avoid:**
- Stem isolation "solo/mute" buttons — implies the app can isolate instruments (it cannot)
- Roman numeral notation by default — jazz musicians read chord names, not Roman numerals
- Real-time microphone analysis — completely different product with latency/noise problems

See `/Users/seijimatsuda/jazz_learning/.planning/research/FEATURES.md` for full dependency graph.

### Architecture Approach

The architecture is driven by two concurrent execution loops that must never block each other. The analysis loop (`setInterval` ~100ms, ~10fps) reads AnalyserNode FFT data, runs the DSP pipeline (FrequencyBandSplitter → Meyda → InstrumentActivityScorer → RoleClassifier → ChordDetector + BeatDetector → PocketScorer), and writes to `audioStateRef.current`. The render loop (`requestAnimationFrame`, 60fps) reads `audioStateRef.current` and calls the Canvas drawing functions. `audioStateRef` is a plain mutable React ref — it never triggers re-renders. React components read coarse state (chord name, BPM, tension value) via `setInterval` polling at ~2fps, not from the analysis loop directly.

**Major components:**
1. `AudioPipeline` — Creates AudioContext inside user gesture, wires MediaElementSource → AnalyserNode → destination
2. `AnalysisLoop` — 10fps orchestrator: reads FFT, calls all DSP modules, writes audioStateRef
3. `FrequencyBandSplitter` — Slices 2048-bin FFT into per-instrument sub-bands using `hzToBin(hz, sampleRate, fftSize)` (sample-rate-aware)
4. `InstrumentActivityScorer` + `RoleClassifier` — Per-band RMS → 0.0-1.0 activity → role enum
5. `ChordDetector` — Chroma extraction → cosine similarity against 8 jazz chord templates → 300ms smoothing
6. `BeatDetector` + `PocketScorer` — Dual-stream (drum transients 6-10kHz + bass onsets 20-250Hz) → BPM + pocket score
7. `CanvasRenderer` — rAF loop: reads audioStateRef, draws node graph with glows, edges, beat pulse
8. React UI components — Band config panel, chord display, tension meter, timeline (read audioStateRef via polling)

Two AnalyserNode instances are required: one with `smoothingTimeConstant = 0.8` for visualization, one with `smoothingTimeConstant = 0.0` for transient/onset detection in BeatDetector.

See `/Users/seijimatsuda/jazz_learning/.planning/research/ARCHITECTURE.md` for full data flow diagram and all 7 anti-patterns.

### Critical Pitfalls

Ranked by rewrite risk (items 1-3 are zero-tolerance — they break the entire app if missed):

1. **iOS AudioContext outside user gesture** — Creates a suspended context that silently fails. Create AudioContext inside the `onClick` handler of the play/upload button. Never create it in `useEffect` on mount or at module scope. Detection: works on Chrome desktop, completely silent on iPhone.

2. **`ctx.shadowBlur` on animated Canvas elements** — 60fps Gaussian blur on 4+ nodes collapses iOS framerate to 15-30fps. Use pre-rendered offscreen glow compositing instead: multiple overlapping circles with decreasing opacity, drawn once to an offscreen canvas and composited. Do not use `shadowBlur` on any element that animates. This must be the chosen strategy before writing any Canvas visual code — retrofitting is a full rewrite.

3. **iOS sample rate 48kHz vs desktop 44.1kHz** — Silently invalidates all frequency band splitting. Never hardcode FFT bin indices. Always compute with `hzToBin(hz, audioCtx.sampleRate, analyser.fftSize)`. Detection: bass band appears quieter on iOS, results differ systematically from desktop for same file.

4. **ScriptProcessorNode vs AudioWorklet decision** — Meyda 5.6.3 uses ScriptProcessorNode (verified from source). This is acceptable but creates main-thread audio callbacks that compete with Canvas rAF. Use Meyda's offline `Meyda.extract()` at 10fps (not MeydaAnalyzer which runs at audio clock rate). Verify AudioWorklet availability in Meyda during Phase 1.

5. **Swing tempo double-counting** — Standard onset detection counts swing eighth notes as beats, reporting 2x the actual BPM. Build rubato confidence gate (IOI coefficient of variation > 0.3 → display "—") and halve BPM when 2:1 swing ratio is detected. This affects pocket score too — suppress it when BPM confidence is low. Highly visible to the target audience.

Moderate pitfalls to address in Phase 2: rootless jazz voicings undermining chord accuracy (build "low confidence / Unknown" display state from day one), GC jank from per-frame typed array allocation (pre-allocate all `Float32Array`/`Uint8Array` buffers once at AudioContext setup), Canvas devicePixelRatio scaling (set `canvas.width = rect.width * dpr` + `ctx.scale(dpr, dpr)` before drawing anything).

See `/Users/seijimatsuda/jazz_learning/.planning/research/PITFALLS.md` for all 14 pitfalls with code examples and detection patterns.

---

## Implications for Roadmap

The dependency chain from FEATURES.md + the build order from ARCHITECTURE.md converge on the same 5-phase structure. All phases are sequential through Phase 4 (each depends on the prior phase's outputs). Phase 5 can begin partway through Phase 3.

### Phase 1: Audio Pipeline Foundation

**Rationale:** Nothing else can be built without a working audio pipeline. iOS Safari pitfalls 1, 3, 4, 12 must all be addressed here — they are foundational decisions that cannot be retrofitted.

**Delivers:** AudioContext (user-gesture safe, iOS-compatible), MediaElementSource → AnalyserNode graph, `getByteFrequencyData` at 10fps, `FrequencyBandSplitter` with sample-rate-aware `hzToBin()`, dual AnalyserNodes (smooth for viz, raw for transients), `audioStateRef` structure defined, TypeScript interfaces for AudioState finalized.

**Addresses:** File upload, waveform display, transport controls, loading state.

**Must avoid:**
- Pitfall 1: AudioContext on mount (create in click handler only)
- Pitfall 3: Hardcoded bin indices (always use hzToBin with sampleRate)
- Pitfall 4: minDecibels clipping jazz dynamics (use Float32 data or calibration pass)
- Pitfall 12: Single AnalyserNode with smoothing (need two: one smooth, one raw)
- Pitfall 10: No cleanup on unmount (write useEffect cleanup from day one)

**Research flag:** Verify Meyda.js ScriptProcessorNode vs AudioWorklet default in v5.6.3 via Context7 before writing any analysis code.

### Phase 2: Core DSP Modules

**Rationale:** With a working FFT pipeline, the three independent analysis modules (activity scoring, beat detection, chord detection) can be developed. These are independent of each other and can be tested via console output before any Canvas work. The `audioStateRef` structure is finalized by end of this phase.

**Delivers:** InstrumentActivityScorer (RMS per band → 0.0-1.0), BeatDetector (dual-stream drum transients + bass onsets, swing ratio detection, rubato suppression), ChordDetector (chroma → cosine similarity against 8 jazz templates, 300ms smoothing, confidence gap display).

**Addresses:** BPM display, chord name with confidence badge, instrument activity detection.

**Must avoid:**
- Pitfall 7: Swing double-counting (implement IOI coefficient of variation gate in BeatDetector, not as a later addition)
- Pitfall 6: Rootless voicings (build "low confidence / Unknown" chord display state from the start — a jazz pianist will see it immediately in testing)
- Pitfall 9: Verify Meyda chroma sample rate handling (test same file on iOS vs Chrome; note whether chroma differs)

**Research flag:** Meyda chroma internal sample rate mapping (LOW confidence claim) — verify empirically in this phase.

### Phase 3: Derived Analysis + Stable State Shape

**Rationale:** RoleClassifier depends on activity scores (Phase 2 output). PocketScorer depends on BeatDetector timestamps (Phase 2). TensionScorer depends on ChordDetector output. This phase finalizes `audioStateRef` structure — the Canvas renderer cannot be built until state shape is stable.

**Delivers:** RoleClassifier (solo/comp/hold/silent state machine with history), PocketScorer (±80ms cross-correlation, pocket quality enum), TensionScorer (chroma → tension 0.0-1.0 with smoothing), finalized `audioStateRef` TypeScript interface.

**Addresses:** Role-based node visual states, pocket score display, harmonic tension arc.

**Must avoid:** Pocket score displayed when BPM confidence is below threshold (rubato tracks will produce garbage — implement the suppression gate here, not as a fix later).

**Research flag:** Standard patterns — no additional research needed. RoleClassifier heuristics are tunable post-launch.

### Phase 4: Canvas Renderer

**Rationale:** Canvas rendering depends on a stable `audioStateRef` shape (Phase 3). All glow strategy decisions must be made before writing any visual code — retrofitting from shadowBlur to compositing is a full rewrite.

**Delivers:** CanvasRenderer with node layout engine (2-4 instruments), static node drawing + labels, edge drawing (communication lines), animation layer (glows via offscreen compositing, ripples, beat pulse on drum transients), tension-tinted edges, devicePixelRatio scaling.

**Addresses:** Animated node graph (core differentiator), tension-tinted edges, beat-synchronized pulse, role-based visual states.

**Must avoid:**
- Pitfall 8: `ctx.shadowBlur` on animated nodes — use pre-rendered offscreen glow compositing from day one
- Pitfall 5: Per-frame typed array allocation — all buffers pre-allocated at setup
- Pitfall 11: Canvas blurriness on Retina/iOS — set `canvas.width = rect.width * dpr` + `ctx.scale(dpr, dpr)` before any drawing

**Research flag:** Standard Canvas patterns — well-documented in MDN. No research phase needed. Two-canvas layering strategy (background / animated) is the correct approach.

### Phase 5: React UI Components + Polish

**Rationale:** React UI components can begin partway through Phase 3 once `audioStateRef` shape is known. They read from the shared ref via `setInterval` polling at ~2fps, keeping React out of the hot path.

**Delivers:** BandSetupPanel (instrument configuration), TensionMeter (reads tensionScore), ChordDisplay with chord name + function label + confidence badge, Timeline scrubber, Key detection display, chord function labels (tonic/dominant/subdominant/altered).

**Addresses:** All jazz-specific table stakes features that display in React UI.

**Must avoid:** React Context for audio state (use Zustand or direct ref polling — context at 60fps is 60 re-renders/second). Anti-Pattern 1 from ARCHITECTURE.md: driving Canvas via React state updates.

**Research flag:** Standard React patterns — no research phase needed.

### Phase 6: Advanced Features (Post-MVP)

**Rationale:** Call-and-response detection depends on role classification (Phase 3) + pitch detection on mixed audio (known accuracy limitations). Key detection depends on chord detection being stable. These add depth to a working core.

**Delivers:** Call-and-response detection + conversation log, key detection with rolling window, timeline tension heatmap, bar/beat grid overlay (requires meter inference), user annotations, export (JSON/image), pre-loaded example tracks (CORS considerations apply).

**Research flag:** Pitch detection accuracy on mixed recordings (known MIR open problem — set expectations before building). Bar/beat grid overlay requires meter inference (5/4, 7/4 are common in jazz — not only 4/4).

### Phase Ordering Rationale

- Phases 1-3 are a strict dependency chain: FFT pipeline → DSP modules → derived analysis. Cannot be reordered.
- Phase 4 (Canvas) must follow Phase 3 because the renderer needs a finalized state shape to draw from.
- Phase 5 (React UI) can begin partway through Phase 3 — components that display chord name and tension score only need those fields defined.
- Phase 6 is additive and can be planned and scoped after the MVP is validated with jazz musicians.
- The three zero-tolerance iOS pitfalls (Pitfalls 1, 3, 8) all belong in Phase 1 or Phase 2. Building iOS-first prevents the "works on Chrome, broken on iPhone" failure mode that is the most common post-launch finding for Web Audio apps.

### Research Flags

Needs verification during Phase 1 planning/execution:
- **Phase 1:** Meyda.js ScriptProcessorNode vs AudioWorklet default (MEDIUM confidence) — verify with Context7 before writing analysis code
- **Phase 2:** Meyda chroma internal sample rate handling (LOW confidence claim) — test empirically: run same audio file through chroma on iOS vs Chrome desktop, compare vectors

Standard patterns (skip research phase):
- **Phase 4:** Canvas 2D animation, layering, glow compositing — well-documented in MDN Canvas Optimization guide
- **Phase 5:** React + Zustand integration — standard, well-documented patterns
- **All phases:** Web Audio API pipeline — MDN documentation is comprehensive and HIGH confidence

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified from installed packages (Meyda, React, Vite, Tailwind) and npm registry. iOS compat from MDN browser-compat-data package v7.3.6. |
| Features | HIGH | Feature categorization from well-established audio tool conventions and jazz pedagogy. Complexity estimates are MEDIUM (iOS behavior may shift estimates). |
| Architecture | HIGH | Two-loop pattern and all anti-patterns verified against MDN official documentation. Component boundaries derived from Web Audio API constraints (AnalyserNode is main-thread only — not an inference). |
| Pitfalls | HIGH (critical), MEDIUM/LOW (some) | Pitfalls 1, 3, 4, 5, 8, 10, 11, 12, 13, 14 verified against MDN docs. Pitfall 2 (Meyda AudioWorklet default) and Pitfall 9 (Meyda chroma sample rate) are MEDIUM/LOW — need Context7 verification before implementation. Pitfalls 6 and 7 (rootless voicings, swing detection) are HIGH for the problem being real; specific algorithm parameters are training knowledge estimates. |

**Overall confidence:** HIGH for the architectural approach and critical pitfall prevention. MEDIUM for analysis accuracy expectations (chord detection and beat detection accuracy on real jazz recordings will require empirical calibration).

### Gaps to Address

- **Meyda AudioWorklet mode:** Whether Meyda 5.6.3 supports or defaults to AudioWorklet, and what the setup looks like. Verify with Context7 during Phase 1 planning. Decision affects Phase 1 architecture.
- **Meyda chroma sample rate handling:** Whether Meyda internally hardcodes 44100Hz for chroma pitch-to-bin mapping. Verify empirically in Phase 2 by testing same file on iOS (48kHz) vs desktop Chrome (44.1kHz). If chroma differs, implement custom chroma mapping (~50 lines).
- **iOS Safari AudioContext `{ sampleRate: 44100 }` constructor option:** MDN documents the option but does not confirm iOS Safari honors it. Read back `audioCtx.sampleRate` after creation and apply `hzToBin` regardless.
- **Chord detection accuracy on real jazz recordings:** Template matching on mixed stereo with rootless voicings has documented accuracy limits. Calibrate thresholds empirically during Phase 2 with actual jazz recordings before committing to confidence threshold values.
- **Beat detection accuracy on swing and odd meters:** IOI coefficient-of-variation threshold (0.3) and swing ratio detection are training knowledge estimates. Calibrate against actual jazz recordings (straight-time, swing, ballad, 5/4) during Phase 2.
- **OffscreenCanvas iOS support:** Confirmed Baseline March 2023 (iOS 16.4+), but not the primary rendering strategy. Main-thread Canvas is the safe path; OffscreenCanvas is an optimization-only path if profiling reveals main thread budget issues.

---

## Sources

### Primary (HIGH confidence — verified against installed packages or official docs)

- Meyda.js source: `node_modules/meyda/dist/node/main.js` (installed v5.6.3) — confirmed extractors, ScriptProcessorNode usage
- MDN browser-compat-data v7.3.6: `data.json` — AudioContext, AnalyserNode, AudioWorkletNode, AudioBufferSourceNode iOS Safari compat tables
- MDN Web Audio API: AnalyserNode, AudioContext.resume(), AudioWorklet, ScriptProcessorNode, sampleRate, Web Audio Best Practices, Autoplay guide
- MDN Canvas: Optimizing Canvas, Visualizations with Web Audio API, OffscreenCanvas
- npm registry: `react@19.2.4`, `vite@7.3.1`, `tailwindcss@4.2.1`, `@tailwindcss/vite@4.2.1`, `typescript@5.9.3`, `@vitejs/plugin-react-swc@4.2.3`, `zustand@5.0.11`

### Secondary (MEDIUM confidence — training knowledge, well-established domain patterns)

- Music information retrieval literature: rootless voicing chord detection accuracy, swing beat detection double-tempo problem, IOI coefficient of variation for rubato detection
- Jazz pedagogy: chord function label conventions (tonic/subdominant/dominant/altered), extended chord vocabulary expectations, instrument role concepts (soloing/comping/holding/silent)
- Audio tool conventions: Transcribe!, Sonic Visualiser, iReal Pro, Peaks.js, Amazing Slow Downer feature set analysis

### Tertiary (LOW confidence — verify before implementation)

- Meyda.js chroma internal sample rate handling (44100Hz hardcoding) — needs Context7 verification
- Meyda.js AudioWorklet support and default behavior in v5.6.3 — needs Context7 verification
- iOS Safari behavior of `AudioContext({ sampleRate: 44100 })` constructor option — not confirmed in fetched sources

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
