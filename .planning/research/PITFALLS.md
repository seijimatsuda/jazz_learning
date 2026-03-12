# Domain Pitfalls: Browser-Based Jazz Audio Visualization

**Domain:** Browser-based real-time audio analysis + Canvas visualization (React + Web Audio API + Meyda.js)
**Researched:** 2026-03-10 (v1.0) | Updated: 2026-03-11 (v1.1 milestone additions)
**Confidence note:** Web Audio API and Canvas pitfalls verified against MDN official documentation (HIGH confidence). Meyda.js-specific pitfalls from training knowledge only — WebFetch to meyda.js.org was blocked (MEDIUM/LOW confidence, flagged per pitfall). iOS Safari behavior verified via MDN autoplay guide (HIGH confidence). v1.1 pitfalls are specific to codebase audit + acoustic data from official instrument frequency sources (MEDIUM confidence for acoustic, HIGH for structural codebase analysis).

---

## v1.1 Milestone Pitfalls: Flexible Instrument Lineup + Dynamic Layout

These pitfalls are specific to the v1.1 work: adding saxophone, trumpet, trombone, vibes support and replacing the hardcoded 4-node diamond layout with a dynamic 2–8 node layout.

---

### Pitfall V1: `INSTRUMENT_ORDER` Is a Module-Level Constant Relied On at Module Load Time

**What goes wrong:** `INSTRUMENT_ORDER` is exported as a static array `['guitar', 'drums', 'keyboard', 'bass']` from `NodeLayout.ts` and is imported at **module load time** by `drawCommunicationEdges.ts`, which uses it to pre-compute the `PAIRS` constant (an IIFE that runs when the module is first imported). When `INSTRUMENT_ORDER` expands from 4 to 8 entries, or becomes dynamic per session, `PAIRS` is already frozen with 6 pairs — the pairs for 8 instruments (28 pairs) are never computed.

**Root cause:** `PAIRS` is computed once at module load via an IIFE:
```typescript
const PAIRS: PairTuple[] = (() => {
  const n = INSTRUMENT_ORDER.length; // frozen at module load
  ...
})();
```
Any dynamic lineup is ignored because `PAIRS` already exists.

**Consequences:**
- With 8 instruments, only the original 6 pairs (minus bass_drums) are rendered as edges.
- New instruments (saxophone, trumpet, etc.) have no communication edges drawn.
- The pocket line logic in `CanvasRenderer` uses `INSTRUMENT_ORDER.indexOf('bass')` and `INSTRUMENT_ORDER.indexOf('drums')` — these still work as long as those instruments are present, but silently break if the lineup has neither.
- `edgeAnimStates` in `CanvasRenderer` constructor is hardcoded to 6 specific pair keys — new pairs have no animation state, so `drawCommunicationEdges` skips them (`if (!animState) continue`).

**Prevention:** `INSTRUMENT_ORDER` must become a parameter, not a global constant. `PAIRS` must be computed from the active lineup at session start, not at module load. `edgeAnimStates` must be built from the active lineup pair set, not from a hardcoded list. The correct fix pattern:
- Remove the IIFE from `drawCommunicationEdges.ts`
- Pass `nodeNames: string[]` as a parameter to `drawCommunicationEdges`
- Compute pairs inside the function (acceptable since it only runs once per re-init) or accept a pre-built pairs array from `CanvasRenderer`
- `CanvasRenderer` constructor must accept lineup as a parameter and build `edgeAnimStates` from it

**Warning signs:**
- Adding saxophone to lineup shows no saxophone edges
- Console shows `animState` is undefined for new pairs in `drawCommunicationEdges`
- Node rendering loop iterates only 4 nodes even when 6 are in lineup

**Phase:** Phase 1 of the milestone (core structure). This blocks all other edge work.

**Severity:** Zero-tolerance — no edge rendering for new instruments without this fix.

**Confidence:** HIGH — direct codebase audit.

---

### Pitfall V2: `computeNodePositions` Only Handles `2 | 3 | 4` — TypeScript Will Block Compile But Runtime Passes `undefined`

**What goes wrong:** `computeNodePositions` has signature `(count: 2 | 3 | 4): NodePosition[]`. Calling it with 5, 6, 7, or 8 will be caught by TypeScript at compile time — but only if TypeScript strict mode is on and the call site uses a `number` not a literal. If `count` is derived from `lineup.length` as a `number`, TypeScript will raise an error. However, if the team casts as `any` or uses `as 2 | 3 | 4` to silence the error, the function's switch-case falls through to `undefined` (no `default` branch), returning `undefined` and crashing the rAF loop the first frame.

**Root cause:** The function's switch-case has no `default`, so any unhandled count produces `undefined`. The caller `CanvasRenderer.resize()` hardcodes `computeNodePositions(4)` — it does not read from the lineup.

**Consequences:**
- Canvas goes blank when lineup count > 4 (rAF crashes on `undefined.x`)
- `CanvasRenderer.resize()` also hardcodes `computeNodePositions(4)` — resize will reset to wrong positions even after the constructor is fixed
- Node click hit detection in `VisualizerCanvas` iterates `positions.length` — if positions is undefined, the click handler crashes

**Prevention:**
- Replace the `2 | 3 | 4` union with a general circular layout algorithm for any `n` (2–8)
- The standard pattern for circular polygon: `x = cx + r * cos(2π * i / n)`, `y = cy + r * sin(2π * i / n)` — this handles any count
- For semantic importance (bass/drums adjacency), assign slots by role priority after computing positions
- Update `CanvasRenderer.resize()` to read from the stored lineup count, not hardcode `4`

**Warning signs:**
- TypeScript compiler error at `computeNodePositions(lineup.length)` — this is a good sign (compile-time catch)
- Canvas goes blank immediately when switching to 5-instrument lineup
- `Uncaught TypeError: Cannot read properties of undefined (reading 'x')` in console

**Phase:** Phase 1 of the milestone.

**Severity:** Zero-tolerance — canvas crashes for any lineup > 4.

**Confidence:** HIGH — direct codebase audit, confirmed by reading NodeLayout.ts switch-case.

---

### Pitfall V3: `CanvasRenderer` Constructor Hardcodes 4 Nodes and 6 Pairs — Does Not Accept Lineup

**What goes wrong:** `CanvasRenderer` constructor hardcodes the diamond layout for exactly 4 instruments:
```typescript
this.nodePositions = computeNodePositions(4);
this.nodeAnimStates = INSTRUMENT_ORDER.map(...); // always length 4
const pairs = ['bass_drums', 'bass_guitar', 'bass_keyboard', 'drums_guitar', 'drums_keyboard', 'guitar_keyboard'];
for (const key of pairs) { this.edgeAnimStates[key] = createEdgeAnimState(); }
```
The constructor has no lineup parameter. When the lineup changes (user adds saxophone), there is no path to rebuild `nodeAnimStates` or `edgeAnimStates` without destroying and recreating the entire renderer.

**The deeper problem:** `VisualizerCanvas.tsx` creates the `CanvasRenderer` in a `useEffect([audioStateRef])` dependency — the lineup is NOT in the dependency array. If lineup changes after the renderer is created, the renderer does not know.

**Consequences:**
- Lineup changes after initial mount are silently ignored by the renderer
- `nodeAnimStates` has 4 entries; drawing 6 nodes attempts `nodeAnimStates[4]` = `undefined` → crash
- Alternatively, if the renderer draws only `INSTRUMENT_ORDER.length` nodes (4), new instruments in analysis state are never drawn
- After lineup change, `CanvasRenderer` should be torn down and rebuilt, but there is no mechanism for this

**Prevention:**
- Add `lineup: string[]` parameter to `CanvasRenderer` constructor
- `VisualizerCanvas.tsx` must add `lineup` to the `useEffect` dependency array, and destroy/recreate the renderer on lineup change
- Or: add a `setLineup(lineup: string[])` method to `CanvasRenderer` that rebuilds positions, animStates, and edgeStates in-place without creating a new renderer object — this avoids the useEffect teardown/recreation on iOS (AudioContext is untouched)

**Warning signs:**
- Changing lineup does nothing visually — canvas still shows 4 nodes
- Console shows array-out-of-bounds errors after lineup change
- `nodeAnimStates[i]` is undefined for i >= 4

**Phase:** Phase 1 of the milestone. Architecture change required before any visual work.

**Severity:** Zero-tolerance — renderer does not support variable lineup without this.

**Confidence:** HIGH — direct codebase audit.

---

### Pitfall V4: Pocket Line Logic Assumes Bass and Drums Are Always Present

**What goes wrong:** `CanvasRenderer.render()` unconditionally looks up bass and drums indices:
```typescript
const bassIdx  = INSTRUMENT_ORDER.indexOf('bass');   // always 3
const drumsIdx = INSTRUMENT_ORDER.indexOf('drums');  // always 1
```
Then calls `drawPocketLine` with those positions. If the user selects a lineup without bass or without drums (e.g., saxophone + trumpet + trombone), `indexOf` returns `-1`. `this.nodePositions[-1]` is `undefined`, and `drawPocketLine` crashes on `undefined.x * w`.

**PocketScorer.ts** uses `beat.lastBassOnsetSec` and `beat.lastDrumOnsetSec` — these remain meaningful only if bass or drums are in the lineup. If neither is present, pocket scoring produces meaningless values from background frequency bleed.

**Consequences:**
- Canvas crash for lineups without bass or drums
- Pocket score displays "0.00" meaninglessly when neither bass nor drums is in lineup
- The UI panel still shows "pocket" metrics even when irrelevant

**Prevention:**
- Guard pocket line rendering: `if (bassIdx >= 0 && drumsIdx >= 0) { drawPocketLine(...) }`
- Gate pocket score computation in `AnalysisTick.ts` on whether bass and drums are both in the lineup
- When pocket is unavailable, hide the pocket score UI component (read from Zustand: `lineup.includes('bass') && lineup.includes('drums')`)

**Warning signs:**
- `Uncaught TypeError: Cannot read properties of undefined (reading 'x')` when non-standard lineup selected
- Pocket score shows 0 on recordings with clear bass guitar presence

**Phase:** Phase 1 of the milestone (guards), Phase 2 (UI suppression).

**Severity:** Zero-tolerance for the crash. Moderate for the meaningless display.

**Confidence:** HIGH — direct codebase audit.

---

### Pitfall V5: Saxophone and Keyboard Share the Exact Same Frequency Bands — Activity Scores Will Blend

**What goes wrong:** The current band map assigns keyboard to `['mid']` (250–2000 Hz). Saxophone fundamentals span ~140 Hz (alto low end) to ~1480 Hz (soprano high end), placing the saxophone body squarely in the `mid` band. If saxophone is added with `bandNames: ['mid']`, both saxophone and keyboard will be reading activity from the same FFT energy — their scores will be nearly identical and highly correlated even when one is silent.

**Acoustic specifics (from DPA Microphones reference data):**
- Alto saxophone: 139–831 Hz fundamentals, harmonics reaching ~12 kHz
- Soprano saxophone: 208–1245 Hz fundamentals
- Guitar `mid_high` band (300–3000 Hz) also overlaps significantly with saxophone presence

**Consequences:**
- When only saxophone is playing, keyboard activity score is non-zero and may trigger 'comping' role
- Cross-correlation between saxophone and keyboard is artificially high (they share the same band energy)
- `INSTRUMENT_ORDER` disambiguation currently only handles the specific keyboard/guitar pair via `KbGuitarDisambiguator` — there is no general disambiguation mechanism

**Prevention:**
- Do not reuse the same band name for two instruments in the same lineup. New instruments need either unique bands or an explicit disambiguation step.
- For saxophone: create a new band with slightly different Hz range (e.g., `sax_body: 200–800 Hz`) and use spectral centroid to distinguish from keyboard (saxophone has stronger low harmonics, keyboard has more even harmonic distribution across mid range)
- Add a flag in `resolveBandsForInstrument` for the sax/keyboard disambiguation case (similar to the existing keyboard/guitar logic)
- Alternatively: accept that frequency-band analysis cannot cleanly separate sax from keyboard on mixed-down audio, and be transparent about this in the UI

**Warning signs:**
- Saxophone and keyboard activity scores track each other exactly in the analysis log
- Adding saxophone to a keyboard-only recording shows keyboard going from `soloing` to `comping` (because now sax "claims" some mid energy)
- Edge weight between saxophone and keyboard is always near 1.0

**Phase:** Phase 1 of the milestone (band definitions), Phase 2 (disambiguation logic).

**Severity:** Moderate — does not crash, but produces meaningless analysis for the sax+keyboard case.

**Confidence:** HIGH for the frequency overlap fact (verified via DPA Microphones acoustic reference). MEDIUM for specific band boundary recommendations.

---

### Pitfall V6: Trumpet Upper Harmonics Overlap Guitar `mid_high` Band — Disambiguation Untested

**What goes wrong:** Guitar is assigned to `['mid_high']` (300–3000 Hz). Trumpet fundamentals span 165–1175 Hz, with harmonics extending to ~15 kHz. The trumpet's strong presence region (1–4 kHz) falls directly in the `mid_high` band. When both trumpet and guitar are in the lineup, their activity scores will correlate — not because they are communicating musically, but because they share the same FFT energy pool.

**Acoustic specifics (from DPA Microphones reference):**
- Trumpet: 165–1175 Hz fundamentals, harmonics to 15 kHz, presence peak 1–4 kHz
- Guitar `mid_high` band: 300–3000 Hz

**Worse case:** Trumpet + keyboard + guitar in the same lineup means three instruments all competing for the `mid` and `mid_high` bands. The `resolveBandsForInstrument` INST-05 fallback (single mid-range instrument claims both bands) will not apply when 3 instruments are present — all three get half the mid range. The disambiguation between the three cannot be solved by simple band splitting.

**Consequences:**
- Trumpet playing strongly registers as guitar activity
- Guitar comping behind a trumpet solo shows as more active than it is
- Edge weights between trumpet and guitar are inflated by shared band energy, not musical interaction

**Prevention:**
- Define trumpet with a custom band that weights the upper mid more (`trumpet_mid: 500–3000 Hz`) and use spectral tilt (low-to-high ratio) to distinguish from guitar (guitar is brighter in the 2–5 kHz presence range; trumpet has a more prominent fundamental)
- Be explicit in the UI about accuracy limitations for brass+guitar lineups
- Consider a "known overlap" warning in the band setup panel for these instrument pairs

**Warning signs:**
- Trumpet and guitar edges show high weight even when playing completely different material
- Removing guitar from the lineup causes trumpet activity score to drop (they were sharing energy)

**Phase:** Phase 1 of the milestone (band definitions).

**Severity:** Moderate. Does not crash, but misleads the user about trumpet-guitar interaction.

**Confidence:** HIGH for the overlap (acoustic data verified). MEDIUM for disambiguation approach.

---

### Pitfall V7: Trombone and Bass Share the Low-Frequency Region — Calibration Amplifies the Problem

**What goes wrong:** Trombone fundamentals span 82–523 Hz (DPA Microphones reference). The bass frequency band is 20–250 Hz. Trombone's low notes (82–250 Hz) fall directly in the bass band. When both trombone and bass are in the lineup:
- Bass band energy reflects both upright bass and trombone low notes
- Bass activity score is inflated when trombone plays in its lower register
- Calibration peak for the bass band is set by the loudest content in the first 3 seconds — if a trombone plays a low note during calibration, the peak is set higher, suppressing bass activity for the rest of the session

**The calibration trap specifically:** `CalibrationPass.ts` runs for 3 seconds from the beginning of the file. It measures `peak` per band. If trombone happens to play a low note in the first 3 seconds, `calibration['bass'].peak` includes trombone energy. The bass threshold `solo = 0.75 * peak` is now set against a higher peak, meaning the actual bass will need to be louder than it truly is to register as `soloing`. The bass appears to under-perform whenever trombone is quiet.

**Consequences:**
- Bass ↔ trombone edges inflated (sharing band energy)
- Bass activity systematically underscored when trombone is quiet (calibration set too high)
- Pocket score (bass ↔ drums) may be degraded if bass onset detection is suppressed

**Prevention:**
- Define trombone with bands that focus on its upper register rather than its fundamentals (e.g., `trombone_mid: 200–1000 Hz`) to reduce bass band contamination
- Or accept the overlap and avoid claiming the trombone-bass combination provides accurate individual activity tracking
- For calibration: if trombone is in the lineup, consider calibrating the bass band with knowledge that trombone may contribute — potentially run calibration twice (early and mid-track) and take the minimum peak as the baseline

**Warning signs:**
- Bass goes `silent` during trombone solos in the low register
- Bass pocket score drops when trombone plays
- Activity log shows bass and trombone scores are identical during low-register trombone passages

**Phase:** Phase 1 (band definitions), with note in planning that calibration may need a future per-instrument calibration strategy.

**Severity:** Moderate for lineups without trombone. The bass ↔ drums visual spine is the app's core feature — trombone contamination degrades it.

**Confidence:** HIGH for the overlap fact (acoustic data). MEDIUM for specific calibration behavior prediction.

---

### Pitfall V8: Vibraphone Frequency Range Nearly Identical to Keyboard — Cannot Be Disambiguated with Band Splitting Alone

**What goes wrong:** Vibraphone range is F3–F6 (174–1397 Hz), which maps almost exactly to the `mid` band (250–2000 Hz). Vibraphone and keyboard/piano are acoustically nearly identical when analyzed via FFT bands. Both are struck instruments (metal vs strings) with tonal, sustained output. ZCR-based disambiguation (used for keyboard vs guitar) will not work: vibraphone has moderate ZCR similar to piano, not the high-transient ZCR of guitar.

**Spectral distinction (from Grinnell College musical instrument collection and Wikipedia):**
- Vibraphone: resonators amplify fundamental but suppress upper partials — sound is pure, round, less harmonically complex
- Piano/keyboard: richer harmonic series, especially in upper mid range, more inharmonicity in upper register
- A spectral centroid or spectral rolloff feature may distinguish them, but requires empirical validation

**Consequences:**
- Vibraphone and keyboard assigned to the same band return nearly identical activity scores
- If vibes is added alongside keyboard, the `resolveBandsForInstrument` INST-05 fallback is not triggered (it only activates for the `keyboard`/`guitar` pair by name)
- Cannot use the existing `KbGuitarDisambiguator` for vibes vs keyboard

**Prevention:**
- Vibraphone + keyboard is a realistic jazz lineup (vibes-piano duos do exist) but the frequency domain cannot cleanly separate them on mixed-down audio
- Define vibraphone's bands identically to keyboard and acknowledge in documentation that vibes vs keyboard is ambiguous at the analysis layer
- Alternatively: treat vibraphone as a "substitute" for keyboard in the lineup — the user would not select both vibes AND keyboard for the same role
- The vibraphone's tremolo motor (vibrato at 3–8 Hz amplitude modulation) is a potential distinguishing feature — amplitude modulation rate could separate vibes from piano, but this requires implementing a modulation detector not currently in the codebase

**Warning signs:**
- Vibraphone and keyboard scores are nearly equal whenever both are in the lineup
- Adding vibes to a keyboard-only lineup causes keyboard score to halve (they now split the same band)

**Phase:** Phase 1 (band definitions). Flag as "ambiguous pair" in planning notes.

**Severity:** Moderate. Vibes-only lineup works fine. Vibes + keyboard lineup produces misleading analysis.

**Confidence:** HIGH for the frequency overlap (acoustic data). LOW for the tremolo-based disambiguation approach (no implementation precedent found).

---

### Pitfall V9: Edge Count Grows Quadratically — 28 Edges for 8 Instruments Degrades Canvas Performance

**What goes wrong:** The number of instrument pairs (edges) follows `n*(n-1)/2`:
- 4 instruments: 6 edges (current)
- 5 instruments: 10 edges
- 6 instruments: 15 edges
- 7 instruments: 21 edges
- 8 instruments: 28 edges

Each edge in `drawCommunicationEdges` performs:
- Lerp on `currentWeight` and `currentOpacity` (2 `lerpExp` calls)
- Lerp on `tintFactor`
- `ctx.save()` + `ctx.restore()` (expensive on some browsers — forces compositing layer push/pop)
- `ctx.beginPath()` + `ctx.moveTo()` + `ctx.lineTo()` + `ctx.stroke()`
- For animated edges: `ctx.setLineDash()` call

At 60fps, 28 edges = 28 `ctx.save/restore` pairs per frame = 1680 save/restore per second. The existing code already calls `ctx.setLineDash([])` for non-animated edges — this is a minor but real overhead that scales.

**iOS specific:** On iOS Safari, `ctx.save()` / `ctx.restore()` is slower than on Chrome desktop because the compositing state stack management is less optimized. At 28 edges with `setLineDash`, this is measurable on older iPhones.

**Consequences:**
- With 8 instruments, canvas frame time may increase 3–5x for the edge-drawing pass
- Animated edges (flowing dashes) use `setLineDash` per frame — this is 28 `setLineDash` calls at 60fps for a fully-connected 8-node graph
- On iPhone 12 or older, this could push the canvas below 30fps

**Prevention:**
- Apply early exit more aggressively: skip all computation for edges with `currentOpacity < 0.01` (the existing code does this, but ensure opacity actually reaches 0 quickly for unconnected instruments)
- Batch `ctx.save/restore` — render all non-animated edges together without individual save/restore per edge. Only animated (dashed) edges need their own save/restore for `lineDashOffset` state isolation
- Add a maximum active edges constant (e.g., render only the N highest-weight edges when N > 10)
- Suppress edges below a more aggressive threshold for large lineups (raise suppression from `|r| < 0.3` to `|r| < 0.4` for lineups of 6+ instruments to reduce visual clutter and rendering load)

**Warning signs:**
- Chrome DevTools shows edge drawing pass taking >3ms per frame (was <1ms for 4 instruments)
- Canvas framerate drops consistently with 8-instrument lineup even before any instruments are active
- Removing instruments from the lineup restores framerate (confirms edges are the bottleneck)

**Phase:** Phase 2 of the milestone (edge rendering). Test on real iOS device with 8 instruments early.

**Severity:** Moderate on desktop, potentially zero-tolerance on older iOS devices.

**Confidence:** HIGH for the quadratic scaling math. MEDIUM for the specific iOS performance impact numbers (training knowledge; needs empirical testing).

---

### Pitfall V10: Calibration Pass Sets Per-Band Thresholds — More Instruments Share Bands, Reducing Calibration Meaning

**What goes wrong:** `CalibrationPass.ts` measures peak energy per **frequency band**, not per **instrument**. With 4 instruments and non-overlapping bands, this works: the bass band peak reflects only the bass, the drums bands reflect only drums, etc. With 8 instruments and extensive band overlap (saxophone + keyboard sharing `mid`, trombone + bass sharing `bass` region), the calibration peak for a shared band is set by whichever instrument is louder in the first 3 seconds. The quieter instrument's thresholds become impossible to meet.

**Specific failure scenario:** Lineup includes saxophone, keyboard, and guitar. All three compete in the mid-frequency region. If saxophone plays loudly in the opening 3 seconds (common in many jazz recordings), `calibration['mid'].peak` is set to a high value. For the rest of the session, the keyboard and guitar must exceed 75% of that saxophone-driven peak to register as `soloing`. A comping piano behind a saxophone solo never reaches that threshold and is permanently classified as `silent`.

**Consequences:**
- Instruments that are quieter than the loudest instrument in their shared band are systematically underscored
- Role classification biases toward `silent` or `holding` for secondary instruments in shared bands
- The visualization shows fewer instruments as active than are actually playing

**Prevention:**
- The calibration pass should be treated as approximate for overlapping lineups — lower the thresholds for shared bands to account for signal splitting
- Consider a "divided" threshold: when N instruments share a band, the effective peak for each is `peak / N` (equal sharing assumption)
- Long-term: per-instrument calibration windows (sample only when the instrument is clearly dominant) — but this requires identification which requires thresholds — circular dependency
- Document this limitation clearly in the app for the v1.1 release

**Warning signs:**
- After calibration, many instruments immediately show as `silent` even in active recordings
- The console log from `CalibrationPass` shows very high peak values for mid-range bands when multiple mid-range instruments are selected
- Reducing the `solo` threshold constant from `0.75` to `0.5` temporarily fixes the issue

**Phase:** Phase 1 of the milestone (calibration logic).

**Severity:** Moderate. Does not crash, but produces systematically incorrect role classifications for larger lineups.

**Confidence:** MEDIUM — inferred from codebase structure. The specific failure scenario is theoretical but logically sound.

---

### Pitfall V11: Node Overlap at Small Canvas Sizes for Large Lineups — Circular Layout Spacing

**What goes wrong:** The existing `computeNodePositions` uses hardcoded positions with significant spacing (diamond corners at 0.20–0.80 range). A circular layout for 8 nodes at a canvas height of 400px with padding must fit 8 nodes of radius ~28px (holding state) in a circle. Node radius in the canvas is 400/2 × (1 - 2×margin), so for 8 nodes on a circle of radius ~160px, the spacing between adjacent node centers is `2π × 160 / 8 ≈ 126px`. With node radii of 28px, glow layers extend ~30px beyond the node — adjacent nodes in a 400px canvas at 8 instruments have centers only ~126px apart with combined radius influence of ~116px. At small viewport widths (mobile portrait), canvas is even smaller.

**Specific concern:** The label text drawn above each node occupies approximately 20px vertical space. For 8 closely-spaced nodes, labels can overlap, making them illegible.

**Consequences:**
- At 8 instruments on a mobile-sized canvas, node glows visually merge
- Labels overlap and become unreadable
- Node hit detection in `VisualizerCanvas.tsx` uses `hitRadius = 0.06` (fractional) — with 8 nodes evenly distributed, the angular separation between nodes is 45 degrees. At distance 0.5 from center on a 1:1 canvas, adjacent nodes are `0.5 × sin(45°) ≈ 0.35` apart. The hitRadius of 0.06 is safe at 8 nodes, but borderline at close angles.

**Prevention:**
- Scale node base radius inversely with instrument count: `baseRadius = Math.max(16, 28 - (count - 4) * 2)` for counts > 4
- Scale label font size slightly for large lineups
- Consider showing abbreviated labels for 7–8 instruments (3-letter codes: `Sax`, `Tpt`, `Tbn`, `Vbs`, `Kbd`, `Gtr`, `Bss`, `Dms`)
- Test the canvas at 320px width (iPhone SE viewport) with 8 instruments explicitly during development

**Warning signs:**
- On mobile viewport, node circles visually overlap at 6+ instruments
- Clicking a node sometimes activates the wrong instrument detail panel
- Labels are cut off or overlap on small screens

**Phase:** Phase 2 of the milestone (layout algorithm + node rendering).

**Severity:** Moderate. Functional, but poor UX on mobile.

**Confidence:** HIGH for the geometry math. MEDIUM for the specific threshold at which overlap becomes a problem (depends on canvas CSS sizing).

---

### Pitfall V12: `PitchAnalysisState` Is Typed as Fixed `{ keyboard, guitar }` — New Instruments Not Tracked

**What goes wrong:** `PitchAnalysisState` in `types.ts` is:
```typescript
export interface PitchAnalysisState {
  keyboard: InstrumentPitchState;
  guitar: InstrumentPitchState;
}
```
And `AnalysisTick.ts` hardcodes:
```typescript
const kbInstr = instrs.find(i => i.instrument === 'keyboard');
const gtInstr = instrs.find(i => i.instrument === 'guitar');
```
There is no pitch detection for saxophone, trumpet, trombone, or vibraphone. If the user selects saxophone + trumpet (a common jazz horn duo lineup) and expects to see melodic activity, the pitch system is silent. More critically, the call-response detection is keyboard→guitar only — it will never fire for saxophone→trumpet call-response.

**Consequences:**
- `kbIsMelodic` and `gtIsMelodic` in Zustand are irrelevant for horn lineups
- UI components that show melodic state may display misleading "not melodic" for saxophone playing a melody
- The call-response log is empty for horn-only lineups

**Prevention for v1.1:** The pitch system scope does not need to expand in v1.1 if the goal is only to add frequency band support. But the UI should conditionally show melody/call-response features only when keyboard and/or guitar are in the lineup.
- Gate the `kbIsMelodic` display on `lineup.includes('keyboard')`
- Gate the `gtIsMelodic` display on `lineup.includes('guitar')`
- Gate call-response log display on both being in the lineup

**Warning signs:**
- Saxophone player sees `kbIsMelodic: false` on their saxophone activity panel — confusing
- Call-response log stays empty on an active saxophone + guitar recording

**Phase:** Phase 2 (UI gating). Not blocking v1.1 core features.

**Severity:** Minor for the core feature. Moderate for UX confusion.

**Confidence:** HIGH — direct codebase audit.

---

### Pitfall V13: `CallResponseDetector` and `AnalysisTick` Use Hardcoded `keyboard`/`guitar` Instrument Names

**What goes wrong:** `AnalysisTick.ts` hardcodes:
```typescript
const hasKeyboard = instrs.some(i => i.instrument === 'keyboard');
const hasGuitar   = instrs.some(i => i.instrument === 'guitar');
if (hasKeyboard && hasGuitar) { disambiguate(...) }
```
And the `PocketScorer` checks `beat.lastBassOnsetSec` and `beat.lastDrumOnsetSec` — explicitly tied to 'bass' and 'drums' instrument names. If the user adds `trombone` or `saxophone` but renames them (or if future code uses display names), these string matches break silently.

**Also:** `CanvasRenderer.boundHandleMelodyUpdate` hardcodes:
```typescript
const guitarKbEdge = this.edgeAnimStates['guitar_keyboard'];
```
If keyboard is not in the lineup, `guitarKbEdge` is `undefined` and the call-response flash is silently skipped.

**Consequences:**
- Adding saxophone does not trigger disambiguation (correct, since it's not keyboard/guitar)
- But adding a vibraphone called "vibraphone" when the code expects "keyboard" for the `hasKeyboard` check would silently break disambiguation
- The underlying risk: all instrument name string comparisons are fragile to renaming

**Prevention:**
- Define canonical instrument name constants at a single source of truth (e.g., an `INSTRUMENT_NAMES` enum or const object)
- All string comparisons use the constants, not inline string literals
- For v1.1, the canonical names for new instruments should be defined before any code that checks them

**Warning signs:**
- Adding vibraphone does not trigger keyboard-like disambiguation
- `guitarKbEdge` is undefined when call-response fires but guitar is not in lineup

**Phase:** Phase 1 of milestone (type definitions and canonical name constants).

**Severity:** Minor for v1.1 (new instruments have their own names). Moderate as a code hygiene issue that will grow worse with more instruments.

**Confidence:** HIGH — direct codebase audit.

---

### Pitfall V14: `edgeTypes.ts` `EDGE_TYPE` Map Is Hardcoded for 6 Pairs — New Pairs Default to `'support'` Silently

**What goes wrong:** `EDGE_TYPE` in `edgeTypes.ts` hardcodes all 6 pairs from the 4-instrument lineup:
```typescript
export const EDGE_TYPE: Record<string, EdgeType> = {
  bass_drums:      'rhythmic',
  guitar_keyboard: 'melodic',
  bass_guitar:     'support',
  ...
};
```
New pairs involving saxophone, trumpet, trombone, or vibraphone are not in the map. The `drawCommunicationEdges` code does `EDGE_TYPE[key] ?? 'support'` — new pairs fall back to `'support'` color (blue). This is safe (no crash) but semantically incorrect. A `saxophone_trumpet` edge should likely be `melodic`; a `bass_saxophone` edge should be `support`. All new pairs being uniformly blue regardless of musical relationship is misleading.

**Consequences:**
- All new instrument edges appear blue regardless of their musical relationship
- No visual distinction between rhythmic backbone edges and melodic conversation edges for new instruments
- The color legend becomes misleading (user sees a saxophone-trumpet edge in blue and thinks "support relationship" when it may be a lead melody conversation)

**Prevention:**
- Define the semantic edge type for all new pairs upfront in planning, before implementing
- Jazz instrument pair semantics for v1.1:
  - `saxophone_trumpet`: melodic (lead horn conversation)
  - `saxophone_trombone`: melodic
  - `trumpet_trombone`: melodic (horn section pairing)
  - `bass_trombone`: rhythmic/support (trombone rhythm section role)
  - `drums_saxophone` etc.: support
  - `keyboard_saxophone`: melodic (comping + lead)
  - `vibes_*`: melodic for vibes-horn pairs, support for vibes-bass/drums
- Add entries for all 22 new pairs to `EDGE_TYPE` before v1.1 ships

**Warning signs:**
- Every new instrument pair shows blue edges
- User feedback: "why is saxophone-trumpet not purple like piano-guitar?"

**Phase:** Phase 1 of milestone (type definitions).

**Severity:** Minor. Functional, cosmetically incorrect.

**Confidence:** HIGH for the code behavior. MEDIUM for the specific semantic assignments (jazz musical convention, not technical constraint).

---

## Phase-Specific Warnings for v1.1 Milestone

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Dynamic lineup initialization | `INSTRUMENT_ORDER` module-level IIFE freezes `PAIRS` at load time (V1) | Pass lineup as parameter; compute pairs at session init |
| Node layout expansion | `computeNodePositions` only handles 2/3/4 (V2) | Circular polygon algorithm for any n |
| Renderer initialization | `CanvasRenderer` constructor hardcodes 4 nodes (V3) | Accept lineup param; rebuild animStates from lineup |
| Pocket line with variable lineup | Bass/drums indices assumed present (V4) | Guard pocket line on lineup membership |
| Saxophone + keyboard overlap | Both assigned to `mid` band (V5) | New bands or disambiguation step |
| Trumpet + guitar overlap | Both in `mid_high` region (V6) | Document acoustic limitation; define custom trumpet band |
| Trombone + bass overlap | Trombone low register in bass band (V7) | Define trombone bands above bass range |
| Vibraphone + keyboard overlap | Identical frequency range (V8) | Accept as known limitation; prevent simultaneous selection or document |
| Edge rendering at 8 instruments | 28 edges degrades canvas performance (V9) | Batch non-animated edges; early exit on opacity; test on iOS |
| Calibration with shared bands | Shared band peaks set by loudest instrument (V10) | Lower thresholds proportionally; document limitation |
| Node spacing at 8 instruments | Nodes may overlap on mobile (V11) | Scale node radius inversely with count; test on 320px viewport |
| Pitch/melody for new instruments | `PitchAnalysisState` is keyboard/guitar only (V12) | Gate melody UI on lineup membership |
| Hardcoded instrument name strings | Fragile string matching throughout analysis tick (V13) | Define canonical instrument name constants |
| Edge type semantic assignments | New pairs default to `support` blue (V14) | Pre-define edge types for all new pairs |

---

## Summary: Highest-Risk Items for v1.1

Ranked by likelihood of causing a crash or silent misbehavior:

1. **`PAIRS` computed at module load from static `INSTRUMENT_ORDER`** (V1) — Crash or no edges for new instruments. Zero-tolerance.
2. **`computeNodePositions` only handles count 2/3/4** (V2) — Canvas crash for 5+ instruments. Zero-tolerance.
3. **`CanvasRenderer` constructor hardcodes 4 nodes and 6 pairs** (V3) — Cannot support variable lineup without architectural change. Zero-tolerance.
4. **Pocket line assumes bass and drums are present** (V4) — Crash for lineups without bass or drums. Zero-tolerance.
5. **Edge rendering scales quadratically to 28 edges** (V9) — Performance degradation on older iOS. Must test empirically.
6. **Saxophone/keyboard share `mid` band** (V5) — Misleading analysis; most common expanded lineup combination.
7. **Calibration peak set by loudest shared-band instrument** (V10) — Systematic role misclassification in larger lineups.

---

---

## v1.0 Pitfalls (retained for reference)

*(These pitfalls from the original v1.0 research remain valid for the existing codebase and any future phases.)*

---

**Domain:** Browser-based real-time audio analysis + Canvas visualization (React + Web Audio API + Meyda.js)
**Researched:** 2026-03-10
**Confidence note:** Web Audio API and Canvas pitfalls verified against MDN official documentation (HIGH confidence). Meyda.js-specific pitfalls from training knowledge only (MEDIUM/LOW confidence). iOS Safari behavior verified via MDN autoplay guide (HIGH confidence).

---

### Pitfall 1: AudioContext Created Outside User Gesture on iOS Safari

**What goes wrong:** `new AudioContext()` is created at module load time or in a React `useEffect` on mount — before any user interaction. On iOS Safari, the AudioContext starts in `suspended` state and calling `resume()` without being inside a direct user gesture handler fails silently or throws. Audio never plays.

**Prevention:**
- Create AudioContext inside the `onClick` handler of the upload/play button
- After creation, check `audioCtx.state` and call `audioCtx.resume()` in the same handler
- Store the context in a React `useRef`

**Detection:** Audio works on desktop Chrome but not on iPhone.

**Phase:** Phase 1 (Audio Pipeline). Build iOS-first.

**Confidence:** HIGH — verified via MDN autoplay guide.

---

### Pitfall 2: Meyda.js Uses ScriptProcessorNode by Default (Deprecated, Main-Thread Blocking)

**What goes wrong:** `ScriptProcessorNode` runs audio callbacks on the main JavaScript thread, competing with Canvas RAF. On iOS devices, the interaction worsens.

**Prevention:** Use AudioWorklet mode explicitly. Keep Meyda feature set minimal.

**Detection:** Audio stutters; Canvas framerate drops; `ScriptProcessorNode` in profiler call stack.

**Phase:** Phase 1 (Audio Pipeline).

**Confidence:** MEDIUM (ScriptProcessorNode deprecation HIGH; Meyda default behavior LOW — verify with Context7).

---

### Pitfall 3: AudioContext Sample Rate Mismatch with Uploaded Audio

**What goes wrong:** iOS default AudioContext sample rate is 48000 Hz. Hardcoded bin math based on 44100 Hz gives wrong frequency boundaries on iOS.

**Prevention:** Always compute bin indices from `audioCtx.sampleRate` via `hzToBin(hz, sampleRate, fftSize)`.

**Detection:** Analysis results differ systematically between iOS and desktop Chrome.

**Phase:** Phase 1. Foundational.

**Confidence:** HIGH — MDN verified.

---

### Pitfall 4: AnalyserNode `minDecibels`/`maxDecibels` Clipping Silent Content

**What goes wrong:** Default range (-100 to -30 dB) clips quiet jazz passages (soft piano, comping bass) to zero.

**Prevention:** Tune `minDecibels`/`maxDecibels` during calibration pass, or use `getFloatFrequencyData`.

**Detection:** All analysis goes to zero during soft passages even though audio is audible.

**Phase:** Phase 1 (calibration pass).

**Confidence:** HIGH — MDN verified.

---

### Pitfall 5: Garbage Collection Jank from Per-Frame Array Allocation

**What goes wrong:** `new Float32Array(...)` inside RAF loop allocates 60x/second. GC sweeps cause periodic frame spikes.

**Prevention:** Allocate ALL typed arrays once outside the RAF loop.

**Detection:** Periodic long GC events in Chrome DevTools; regular jank not triggered by scene complexity.

**Phase:** Phases 1 and 2. Build discipline in from the start.

**Confidence:** HIGH — MDN Canvas optimization docs.

---

### Pitfall 6: Chroma Vector Accuracy on Rootless Jazz Voicings

**What goes wrong:** Jazz pianists play rootless voicings; template matching trained on root-position chords misidentifies them.

**Prevention:** Show confidence score always; add `low` confidence fallback display ("major chord" not "Cmaj7").

**Detection:** Chord labels flip between related chords; confidence consistently low even on clear harmonic motion.

**Phase:** Phase 2 (Chord Detection).

**Confidence:** HIGH for problem being real; MEDIUM for specific threshold values.

---

### Pitfall 7: Beat Detection Failure on Swing Rhythm and Rubato

**What goes wrong:** Standard onset detection counts swing eighths as beats, doubling the reported BPM. Rubato produces meaningless IOI estimates.

**Prevention:** Dual-stream detection (drum + bass); IOI consistency gate; suppress BPM display when CV > 0.3.

**Detection:** BPM reads 2x audible tempo; beat pulse fires on off-beats.

**Phase:** Phases 1 (beat detection) and 2 (pocket score).

**Confidence:** MEDIUM — well-known in MIR, specific algorithm from training knowledge.

---

### Pitfall 8: Canvas `shadowBlur` and Glow Effects Destroying Frame Rate

**What goes wrong:** `ctx.shadowBlur` forces per-draw GPU Gaussian blur. Multiple nodes + edges at 60fps drops to 15–30fps on iOS.

**Prevention:** Pre-render glow layers to offscreen canvases; composite with `drawImage`. Never use `shadowBlur` on animated elements.

**Detection:** 60fps on Chrome desktop, 20–30fps on iPhone.

**Phase:** Phase 2 (Canvas). Choose strategy before writing visual code.

**Confidence:** HIGH — MDN Canvas optimization docs; iOS GPU limitation MEDIUM.

---

### Pitfall 9: Meyda Chroma and the "Chroma 12-bin" Frequency Mapping Assumption

**What goes wrong:** Meyda's chroma mapping may assume 44100 Hz internally. At iOS 48000 Hz, chroma bins are smeared across adjacent pitch classes.

**Prevention:** Verify with Context7; test same file on iOS vs Chrome; consider custom chroma mapping.

**Detection:** Same audio gives different chord detection on iOS vs desktop.

**Phase:** Phase 1 (AudioContext setup).

**Confidence:** LOW for Meyda internals (verify with Context7); HIGH for sample rate difference.

---

### Pitfall 10: Forgetting to Disconnect AudioNodes on React Component Unmount

**What goes wrong:** Zombie AudioNodes on unmount accumulate, causing duplicate analysis and memory leaks.

**Prevention:** `useEffect` cleanup calling `node.disconnect()`.

**Phase:** Phase 1. Write cleanup from the start.

**Confidence:** HIGH — MDN verified.

---

### Pitfall 11: Canvas Size vs CSS Size Blurriness on Retina / iOS Displays

**What goes wrong:** Missing `devicePixelRatio` scaling causes CSS-upscaled blurry rendering.

**Prevention:** `canvas.width = rect.width * dpr; ctx.scale(dpr, dpr)` on initialization and resize.

**Phase:** Phase 2.

**Confidence:** HIGH — MDN Canvas docs.

---

### Pitfall 12: `smoothingTimeConstant` Masking Transient Events

**What goes wrong:** Default smoothing (0.8) takes ~5 frames to decay a drum transient — too slow for onset detection.

**Prevention:** Two separate AnalyserNodes: `smoothingTimeConstant = 0.8` for visualization, `0.0` for transient detection.

**Phase:** Phase 1. Architecture decision.

**Confidence:** HIGH — MDN verified.

---

### Pitfall 13: AudioWorklet Requires HTTPS (Blocks Local Dev Without Proper Setup)

**What goes wrong:** `audioContext.audioWorklet.addModule()` requires secure context. Non-localhost URLs without HTTPS silently fail.

**Prevention:** Use `localhost` during dev. For iOS device testing via ngrok, require HTTPS.

**Phase:** Phase 1.

**Confidence:** HIGH — MDN AudioWorklet docs.

---

### Pitfall 14: CORS Required for Audio Files Loaded via `fetch()` for Web Audio API

**What goes wrong:** External audio files without CORS headers cause `decodeAudioData` to fail.

**Prevention:** Serve example tracks from same origin or CORS-enabled CDN.

**Phase:** Phase 3 (example tracks). Not relevant for core upload flow.

**Confidence:** HIGH — MDN verified.

---

## Sources

**HIGH confidence (verified against MDN official documentation):**
- MDN Web Docs: AudioContext.resume() — https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
- MDN Web Docs: AnalyserNode — https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN Web Docs: Web Audio API Best Practices — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN Web Docs: Autoplay guide for media and Web Audio APIs — https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN Web Docs: Using AudioWorklet — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- MDN Web Docs: Optimizing Canvas — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN Web Docs: Visualizations with Web Audio API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
- MDN Web Docs: ScriptProcessorNode (deprecated) — https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode
- MDN Web Docs: BaseAudioContext.sampleRate — https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/sampleRate

**MEDIUM confidence (training knowledge + acoustic reference data):**
- DPA Microphones acoustic characteristics table — https://www.dpamicrophones.com/mic-university/background-knowledge/acoustical-characteristics-of-musical-instruments/
  - Saxophone (alto, soprano, tenor, baritone) fundamental ranges verified
  - Trumpet fundamental range verified (165–1175 Hz)
  - Trombone fundamental range verified (82–523 Hz)
- Sonicbids EQ cheat sheet — https://blog.sonicbids.com/the-ultimate-eq-cheat-sheet-for-every-common-instrument
  - Saxophone presence region 1–2 kHz verified
  - Brass brightness region 4–10 kHz noted
- Wikipedia: Vibraphone — frequency range F3–F6 (174–1397 Hz) verified
- Grinnell College Musical Instrument Collection: Vibraphone resonator behavior (fundamental amplified, upper partials suppressed)

**HIGH confidence (direct codebase audit):**
- All v1.1 pitfalls (V1–V14) verified by reading source files:
  - `src/canvas/nodes/NodeLayout.ts` (INSTRUMENT_ORDER, computeNodePositions)
  - `src/canvas/edges/drawCommunicationEdges.ts` (PAIRS IIFE)
  - `src/canvas/edges/edgeTypes.ts` (EDGE_TYPE hardcoded pairs)
  - `src/canvas/CanvasRenderer.ts` (constructor hardcoding, pocket line logic)
  - `src/audio/types.ts` (PitchAnalysisState fixed shape)
  - `src/audio/InstrumentActivityScorer.ts` (INSTRUMENT_BAND_MAP, resolveBandsForInstrument)
  - `src/audio/AnalysisTick.ts` (hardcoded keyboard/guitar checks)
  - `src/audio/CalibrationPass.ts` (per-band not per-instrument thresholds)

**MEDIUM/LOW confidence (training knowledge, verify before implementation):**
- Meyda.js ScriptProcessorNode vs AudioWorklet default behavior — VERIFY WITH CONTEXT7
- Meyda.js internal chroma frequency mapping and sample rate handling — VERIFY WITH CONTEXT7
- iOS `ctx.save()/restore()` performance relative to Chrome — from training knowledge, needs empirical testing
- Vibraphone tremolo-based disambiguation feasibility — LOW, no implementation precedent found
- Specific iPhone model thresholds for edge rendering degradation — needs empirical testing on device
