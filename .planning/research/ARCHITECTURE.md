# Architecture Patterns: Flexible Instrument Lineup and Dynamic Node Layout

**Domain:** Jazz audio analysis — adding saxophone, trumpet, trombone, vibes to existing quartet system
**Researched:** 2026-03-11
**Confidence:** HIGH — based on direct reading of all 46 source files

---

## Existing Architecture Summary

The system operates as two concurrent loops sharing a single mutable ref bridge:

```
10fps ANALYSIS LOOP (AnalysisTick.ts)
  reads: audioStateRef.smoothedFreqData, rawFreqData, rawTimeData
  writes: audioStateRef.analysis.instruments[].activityScore, .role
  writes: audioStateRef.analysis.edgeWeights[pairKey]
  writes: audioStateRef.chord, .tension, .beat, .pitch
  fires: onRoleChange, onChordChange, onBeatUpdate, onMelodyUpdate callbacks → Zustand

60fps RENDER LOOP (CanvasRenderer.ts)
  reads: audioStateRef.analysis.instruments, .edgeWeights, .beat, .tension, .pitch
  reads: INSTRUMENT_ORDER (module-level constant — this is the problem)
  owns: nodePositions[], nodeAnimStates[], edgeAnimStates{}
  calls: runAnalysisTick() when 100ms gate fires
```

The bridge is `audioStateRef`, a `MutableRefObject<AudioStateRef>`. Mutations are invisible to React, which is intentional. Zustand is only updated via callbacks for UI panels. The analysis loop writes into pre-allocated typed arrays; no new arrays are created after initialization.

---

## Hardcoded Assumptions to Break

These are the specific locations in the codebase where "4-instrument jazz quartet" is assumed. Each is a required change site.

### 1. `INSTRUMENT_ORDER` — NodeLayout.ts line 34

```typescript
export const INSTRUMENT_ORDER: string[] = ['guitar', 'drums', 'keyboard', 'bass'];
```

This module-level constant is imported in three places:
- `CanvasRenderer.ts` (lines 18, 34, 137, 412, 446) — node draw loop and pocket line lookup
- `drawCommunicationEdges.ts` (lines 31, 46-63) — uses it inside a module-load IIFE to build PAIRS
- `VisualizerCanvas.tsx` (lines 15, 98) — maps click position index to instrument name

All three consumers treat this as ground truth. Making it dynamic requires the active lineup to flow into these consumers at runtime.

### 2. `computeNodePositions` signature — NodeLayout.ts line 42

```typescript
export function computeNodePositions(count: 2 | 3 | 4): NodePosition[] {
```

TypeScript enforces counts 2, 3, 4 only. Must extend to 5, 6, 7, 8.

### 3. `CanvasRenderer` constructor and `resize()` — CanvasRenderer.ts lines 134, 184

```typescript
this.nodePositions = computeNodePositions(4);  // hardcoded in constructor
// ...
this.nodePositions = computeNodePositions(4);  // also hardcoded in resize()
```

### 4. Edge pair initialization — CanvasRenderer.ts lines 142-145

```typescript
const pairs = ['bass_drums', 'bass_guitar', 'bass_keyboard', 'drums_guitar', 'drums_keyboard', 'guitar_keyboard'];
for (const key of pairs) {
  this.edgeAnimStates[key] = createEdgeAnimState();
}
```

Hardcoded 6-pair list. Must be computed from the actual lineup.

### 5. `PAIRS` IIFE — drawCommunicationEdges.ts lines 46-64

```typescript
const PAIRS: PairTuple[] = (() => {
  const n = INSTRUMENT_ORDER.length;
  // builds from module-level INSTRUMENT_ORDER at import time
})();
```

This IIFE runs **once at module import**, before any lineup is known. When the renderer is initialized with a different lineup, this constant is already stale. This is the single highest-risk change in the migration.

### 6. Pocket line lookup — CanvasRenderer.ts lines 412-426

```typescript
const bassIdx  = INSTRUMENT_ORDER.indexOf('bass');   // hardcoded to index 3
const drumsIdx = INSTRUMENT_ORDER.indexOf('drums');  // hardcoded to index 1
```

Assumes bass and drums are always present. With flexible lineup, either may be absent — `indexOf` returning `-1` causes `this.nodePositions[-1]` to be `undefined`, which throws at `undefined.x`.

### 7. Call-response edge lookup — CanvasRenderer.ts lines 158-161

```typescript
const guitarKbEdge = this.edgeAnimStates['guitar_keyboard'];
if (guitarKbEdge) {
  guitarKbEdge.callResponseFlashIntensity = 1.0;
```

The `if (guitarKbEdge)` guard handles absence gracefully, but the underlying call-response detection in `AnalysisTick.ts` lines 311-326 hardcodes `'keyboard'` and `'guitar'` as instrument names.

### 8. `PitchAnalysisState` — types.ts lines 104-107

```typescript
export interface PitchAnalysisState {
  keyboard: InstrumentPitchState;
  guitar: InstrumentPitchState;
}
```

Fixed named fields. Must become a dynamic map keyed by instrument name to accommodate new melodic instruments.

### 9. `InstrumentName` type and `INSTRUMENT_BAND_MAP` — InstrumentActivityScorer.ts lines 23-41

```typescript
export type InstrumentName = 'bass' | 'drums' | 'keyboard' | 'guitar';
export const INSTRUMENT_BAND_MAP: Record<InstrumentName, string[]> = {
  bass:     ['bass'],
  drums:    ['drums_low', 'drums_high', 'ride'],
  keyboard: ['mid'],
  guitar:   ['mid_high'],
};
```

Both need to expand to include 4 new instruments.

### 10. `resolveBandsForInstrument` — InstrumentActivityScorer.ts lines 54-70

```typescript
const hasKeyboard = lineup.includes('keyboard');
const hasGuitar = lineup.includes('guitar');
const hasBoth = hasKeyboard && hasGuitar;
if (!hasBoth && (name === 'keyboard' || name === 'guitar')) {
  return ['mid', 'mid_high'];
}
```

The "claim full mid-range when solo" fallback needs to generalize for new instruments that share the same frequency space.

### 11. `EDGE_TYPE` — edgeTypes.ts lines 111-118

```typescript
export const EDGE_TYPE: Record<string, EdgeType> = {
  bass_drums:      'rhythmic',
  guitar_keyboard: 'melodic',
  bass_guitar:     'support',
  // ... 6 pairs hardcoded
};
```

New instrument pairs return `undefined`, falling back to `'support'` via `?? 'support'` in the renderer. Safe but leaves new pairs unclassified semantically.

### 12. `BandSetupPanel.tsx` — lines 14, 16, 22

```typescript
const AVAILABLE_INSTRUMENTS = ['keyboard', 'bass', 'drums', 'guitar'] as const;
const INSTRUMENT_ICONS: Record<string, string> = { keyboard: ..., bass: ..., drums: ..., guitar: ... };
const BAND_LABELS: Record<string, string> = { keyboard: ..., bass: ..., drums: ..., guitar: ... };
```

Three constants need new entries for sax, trumpet, trombone, vibes.

### 13. Pitch state initialization — App.tsx lines 71-85

```typescript
const hasKeyboard = lineup.includes('keyboard' as InstrumentName);
const hasGuitar   = lineup.includes('guitar' as InstrumentName);
if (hasKeyboard && hasGuitar) {
  audioStateRef.current.pitch = {
    keyboard: initInstrumentPitchState(pitchFftSize),
    guitar:   initInstrumentPitchState(pitchFftSize),
  };
```

Fixed to keyboard+guitar. New melodic instruments need pitch detection too.

---

## audioStateRef Shape Changes for Variable Instruments

### What Does Not Change

`AnalysisState.instruments` is already `InstrumentAnalysis[]` — an array iterated generically in the 10fps loop. Adding more instruments is just a longer array. No shape change needed.

`AnalysisState.edgeWeights` is already `Record<string, number>` with dynamically computed keys. Works for any lineup without modification.

`FrequencyBand[]` and `CalibrationThresholds[]` are already arrays. Adding new bands is additive.

The 10fps loop in `AnalysisTick.ts` already iterates `for (const instr of instrs)` — it will naturally extend to N instruments without code changes in the loop body.

### What Must Change

**Change 1: `PitchAnalysisState` — fixed named fields to dynamic map**

Current (breaks for N instruments):
```typescript
interface PitchAnalysisState {
  keyboard: InstrumentPitchState;
  guitar: InstrumentPitchState;
}
```

Required change:
```typescript
interface PitchAnalysisState {
  instruments: Record<string, InstrumentPitchState>;
}
```

All consumers (`AnalysisTick.ts` lines 311-352, `App.tsx` lines 71-85) must update to use `state.pitch.instruments['keyboard']` instead of `state.pitch.keyboard`.

**Change 2: `InstrumentName` type union — expand to 8 instruments**

```typescript
export type InstrumentName =
  | 'bass' | 'drums' | 'keyboard' | 'guitar'
  | 'saxophone' | 'trumpet' | 'trombone' | 'vibes';
```

Keeping a union type (rather than loosening to `string`) preserves compile-time safety for `INSTRUMENT_BAND_MAP` and `resolveBandsForInstrument`.

---

## Data Flow Changes in the Analysis Loop

### Frequency Band Assignment for New Instruments

Current band definitions (FrequencyBandSplitter.ts `buildDefaultBands`):
- `bass`: 20-250 Hz
- `drums_low`: 60-300 Hz
- `mid`: 250-2000 Hz
- `mid_high`: 300-3000 Hz
- `drums_high`: 2000-8000 Hz
- `ride`: 6000-10000 Hz

New instruments and their natural frequency homes:

| Instrument | Fundamental Range | Harmonic Presence | Recommended Bands |
|------------|------------------|-------------------|-------------------|
| saxophone | 120-1200 Hz (alto), 70-1000 Hz (tenor) | 2-4 kHz overtones | `mid` primary; optionally `mid_high` |
| trumpet | 160-1000 Hz | 2-5 kHz brightness | `mid_high` primary |
| trombone | 80-500 Hz | 1-3 kHz harmonics | `mid` primary |
| vibes | 200-2000 Hz | 4-8 kHz mallet transients | `mid` and `mid_high` |

All four new instruments overlap heavily with `mid` (250-2000 Hz) and `mid_high` (300-3000 Hz). This is unavoidable — it is a fundamental constraint of single-analyser analysis on mixed-down stereo audio. The calibration normalization and EMA smoothing in `computeActivityScore` tolerate this overlap in practice.

**Recommended approach for first pass:** Assign new instruments to existing bands using the overlap rules below. Do not add new bands yet — new bands complicate calibration and are not needed for basic activity detection.

New entries for `INSTRUMENT_BAND_MAP`:
```typescript
saxophone: ['mid'],
trumpet:   ['mid_high'],
trombone:  ['mid'],
vibes:     ['mid', 'mid_high'],
```

**Disambiguation note:** Multiple instruments claiming `mid` (keyboard, saxophone, trombone) will show correlated activity scores, just as keyboard and guitar currently correlate on mid frequencies. The existing `KbGuitarDisambiguator` (ZCR + spectral flux) pattern could be extended to new pairs in a later milestone.

### `resolveBandsForInstrument` Extension

The current logic: if only keyboard or only guitar is in the lineup (not both), that instrument claims both `mid` and `mid_high`. The generalized rule for the new milestone:

- `bass`, `drums`: always their fixed bands (no fallback needed)
- Single mid-range instrument (any of keyboard, guitar, saxophone, trombone, trumpet, vibes): claim `['mid', 'mid_high']`
- When multiple mid-range instruments are present: each claims only its default band

The implementation: check whether more than one mid-range instrument is in the lineup; if exactly one, return `['mid', 'mid_high']` for it. Define a `MID_RANGE_INSTRUMENTS` set:

```typescript
const MID_RANGE_INSTRUMENTS = new Set(['keyboard', 'guitar', 'saxophone', 'trumpet', 'trombone', 'vibes']);
const midRangeCount = lineup.filter(i => MID_RANGE_INSTRUMENTS.has(i)).length;
if (midRangeCount === 1 && MID_RANGE_INSTRUMENTS.has(name)) {
  return ['mid', 'mid_high'];
}
```

### AnalysisTick.ts Pitch Section

Current code (lines 305-352) uses hardcoded `state.pitch.keyboard` and `state.pitch.guitar`. After the `PitchAnalysisState` shape change:

- Iterate `Object.entries(state.pitch.instruments)` to get per-instrument pitch state
- For each entry, find the corresponding `InstrumentAnalysis` by name
- Apply the same `activityScore > 0.15` gate before calling `updatePitchState`
- The `updatePitchState` function itself is unchanged — it operates on `InstrumentPitchState` generically

Call-response detection (lines 332-352) uses `state.pitch.keyboard.isMelodic` and `state.pitch.guitar.isMelodic` specifically. For this milestone: keep call-response detection limited to keyboard+guitar. Guard with `if (state.pitch.instruments['keyboard'] && state.pitch.instruments['guitar'])`. Generalizing call-response to other instrument pairs is future scope.

---

## Canvas Renderer Changes for Dynamic Layout

### Core Problem: The PAIRS IIFE

`drawCommunicationEdges.ts` builds `PAIRS` once at module import:

```typescript
const PAIRS: PairTuple[] = (() => {
  const n = INSTRUMENT_ORDER.length;  // reads module constant at import time
  ...
})();
```

Even after fixing `CanvasRenderer` to use a dynamic lineup, this IIFE produces a stale 4-pair array. New instrument pairs will have `EdgeAnimState` objects in `CanvasRenderer.edgeAnimStates` but will never be iterated by `drawCommunicationEdges`.

**Fix: Remove the module-level IIFE. Move pair computation to CanvasRenderer.**

`CanvasRenderer` already owns `edgeAnimStates`. It should also own the ordered pair list:

```typescript
// In CanvasRenderer constructor
private pairs: Array<[number, number, string]> = [];

// Computed from lineup after constructor receives it:
this.pairs = buildPairs(this.instrumentOrder);
```

Pass `this.pairs` as a parameter to `drawCommunicationEdges`. The function signature changes from:
```typescript
function drawCommunicationEdges(ctx, nodePositions, nodeRadii, edgeAnimStates, edgeWeights, ...)
```
to:
```typescript
function drawCommunicationEdges(ctx, nodePositions, nodeRadii, pairs, edgeAnimStates, edgeWeights, ...)
```

### CanvasRenderer Constructor Changes

The constructor must accept the lineup:

```typescript
constructor(
  canvas: HTMLCanvasElement,
  audioStateRef: MutableRefObject<AudioStateRef>,
  lineup: string[]  // add this parameter
)
```

From the lineup, the constructor derives:
- `this.instrumentOrder: string[]` — the active lineup in draw order
- `this.nodePositions` — from `computeNodePositions(lineup.length)`
- `this.nodeAnimStates` — one `NodeAnimState` per lineup entry
- `this.edgeAnimStates` — one `EdgeAnimState` per pair computed from lineup
- `this.pairs` — all `[idxA, idxB, key]` tuples for non-pocket pairs

The `resize()` method uses `this.instrumentOrder.length` instead of the hardcoded `4`.

### VisualizerCanvas Must Pass Lineup

`VisualizerCanvas.tsx` creates `CanvasRenderer` without lineup awareness:

```typescript
const renderer = new CanvasRenderer(canvas, audioStateRef);
```

After the constructor change, it must read lineup from the store and pass it:

```typescript
const lineup = useAppStore.getState().lineup;
const renderer = new CanvasRenderer(canvas, audioStateRef, lineup);
```

Since lineup is locked after file load (BandSetupPanel locks it when `isFileLoaded` becomes true), and `VisualizerCanvas` mounts after file load (`{isFileLoaded && <VisualizerCanvas .../>}` in App.tsx), the renderer is always constructed with the final lineup. No dynamic lineup update mechanism is needed.

### Click Hit Detection Fix

`VisualizerCanvas.tsx` line 98 currently does:

```typescript
useAppStore.getState().setSelectedInstrument(INSTRUMENT_ORDER[i]);
```

After the change, `INSTRUMENT_ORDER` is no longer a module-level constant. Fix: update `getNodeLayout()` to return instrument names alongside positions:

```typescript
// Before:
getNodeLayout(): { positions: NodePosition[]; width: number; height: number }

// After:
getNodeLayout(): { positions: NodePosition[]; instruments: string[]; width: number; height: number }
```

Then in the click handler:
```typescript
const { positions, instruments } = r.getNodeLayout();
// ...
useAppStore.getState().setSelectedInstrument(instruments[i]);
```

### NodeLayout Extension for 5-8 Instruments

`computeNodePositions` must handle counts 5-8. The TypeScript type `count: 2 | 3 | 4` expands to `count: 2 | 3 | 4 | 5 | 6 | 7 | 8`.

Layout geometry uses fractional [0,1] coordinates. The canvas is wider than tall (800px wide, 400px high based on the current CSS). All layouts must account for the 2:1 aspect ratio.

**Key constraint:** The pocket line connects bass and drums regardless of their visual distance. Their adjacency is aesthetic, not a code requirement. However, visual adjacency helps users understand the pocket line — placing bass and drums near each other is preferred.

Recommended layouts:

```
COUNT 5 — asymmetric pentagon
  top-center, upper-left, upper-right, lower-left, lower-right
  Bass → lower-left, Drums → lower-right (adjacent)
  {x:0.50,y:0.18}, {x:0.22,y:0.42}, {x:0.78,y:0.42}, {x:0.32,y:0.78}, {x:0.68,y:0.78}

COUNT 6 — two rows of 3
  top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
  Bass → bottom-center, Drums → bottom-right
  {x:0.20,y:0.25}, {x:0.50,y:0.25}, {x:0.80,y:0.25},
  {x:0.20,y:0.75}, {x:0.50,y:0.75}, {x:0.80,y:0.75}

COUNT 7 — top row of 3, bottom row of 4
  {x:0.20,y:0.22}, {x:0.50,y:0.22}, {x:0.80,y:0.22},
  {x:0.12,y:0.72}, {x:0.37,y:0.72}, {x:0.63,y:0.72}, {x:0.88,y:0.72}
  Bass → bottom position 2, Drums → bottom position 3

COUNT 8 — two rows of 4
  {x:0.12,y:0.25}, {x:0.37,y:0.25}, {x:0.63,y:0.25}, {x:0.88,y:0.25},
  {x:0.12,y:0.75}, {x:0.37,y:0.75}, {x:0.63,y:0.75}, {x:0.88,y:0.75}
```

The exact coordinates need visual iteration. The patterns above are starting points — tighten margins and test on the 800x400 canvas. Nodes should not crowd the tension meter (right edge, x=0.95) or the BPM display (bottom-left, y=0.95).

**`INSTRUMENT_ORDER` ordering for new layouts:** The lineup ordering in the array determines which position index maps to which node. The ordering should follow a musical logic where possible:
- Rhythm section (bass, drums) at adjacent positions
- Front-line horns (sax, trumpet, trombone) grouped
- Harmonic instruments (keyboard, guitar, vibes) grouped

The actual ordering is set by `BandSetupPanel.tsx` (user adds instruments in their chosen order). `CanvasRenderer` uses this order directly — no semantic reordering in the renderer.

### Pocket Line Guard

Before drawing the pocket line, check that both bass and drums are present:

```typescript
const bassIdx  = this.instrumentOrder.indexOf('bass');
const drumsIdx = this.instrumentOrder.indexOf('drums');
if (bassIdx >= 0 && drumsIdx >= 0 && state.beat !== null) {
  const bassPos  = this.nodePositions[bassIdx];
  const drumsPos = this.nodePositions[drumsIdx];
  drawPocketLine(ctx, bassPos.x * w, bassPos.y * h, ...);
}
```

Without this guard, lineups without bass or drums crash at `undefined.x`.

### Edge Type Classification for New Pairs

New entries needed in `EDGE_TYPE` (edgeTypes.ts):

```typescript
// Rhythm-section adjacency (bass is anchor)
bass_saxophone:   'support',
bass_trumpet:     'support',
bass_trombone:    'support',
bass_vibes:       'support',

// Drums + front line — sax and drums have strong rhythmic relationship in bebop
drums_saxophone:  'support',   // could be 'rhythmic' — debatable
drums_trumpet:    'support',
drums_trombone:   'support',
drums_vibes:      'support',

// Harmonic instruments + new instruments
keyboard_saxophone:  'melodic',   // classic conversation pair
keyboard_trumpet:    'melodic',
keyboard_trombone:   'support',   // less conversational than trumpet
keyboard_vibes:      'melodic',   // mallets + piano = harmonic conversation

guitar_saxophone:    'melodic',
guitar_trumpet:      'melodic',
guitar_trombone:     'support',
guitar_vibes:        'melodic',

// Front-line pair conversations (core of jazz combo voicing)
saxophone_trumpet:   'melodic',
saxophone_trombone:  'melodic',
trumpet_trombone:    'melodic',

// Vibes + front line
saxophone_vibes:     'melodic',
trumpet_vibes:       'melodic',
trombone_vibes:      'support',
```

With 8 instruments, the total pairs count is C(8,2) = 28. Minus the bass_drums pocket line = 27 pairs in `drawCommunicationEdges`. The loop will handle this correctly; the per-pair overhead is minimal.

---

## Component Boundary Map: New vs Modified

### Files That Must Be Modified

| File | Change Required |
|------|----------------|
| `src/audio/types.ts` | Change `PitchAnalysisState` from named fields to `{instruments: Record<string, InstrumentPitchState>}` |
| `src/audio/InstrumentActivityScorer.ts` | Expand `InstrumentName` union type; add 4 entries to `INSTRUMENT_BAND_MAP`; update `resolveBandsForInstrument` logic |
| `src/audio/AnalysisTick.ts` | Update pitch detection section (lines 305-352) to iterate `state.pitch.instruments` record; update call-response guard |
| `src/canvas/nodes/NodeLayout.ts` | Extend `computeNodePositions` type signature and add cases for 5, 6, 7, 8; `INSTRUMENT_ORDER` becomes an internal implementation detail, not the canonical source |
| `src/canvas/CanvasRenderer.ts` | Accept `lineup: string[]` in constructor; derive `instrumentOrder`, `nodePositions`, `edgeAnimStates`, `pairs` from lineup; fix pocket line guard; update `resize()`; update `getNodeLayout()` return type |
| `src/canvas/edges/drawCommunicationEdges.ts` | Remove module-level `PAIRS` IIFE; accept pairs array as parameter from `CanvasRenderer` |
| `src/canvas/edges/edgeTypes.ts` | Add `EDGE_TYPE` entries for all new instrument pairs |
| `src/components/BandSetupPanel.tsx` | Add 4 new instruments to `AVAILABLE_INSTRUMENTS`, `INSTRUMENT_ICONS`, `BAND_LABELS` |
| `src/components/VisualizerCanvas.tsx` | Pass lineup to `CanvasRenderer` constructor; update click handler to use `instruments` from `getNodeLayout()` |
| `src/App.tsx` | Update pitch state initialization to use dynamic `PitchAnalysisState.instruments` record for all melodic instruments in lineup |

### Files That Are New

None. All changes are extensions of existing modules. The architecture does not require new files because:
- New instruments are data additions (new entries in maps), not behavioral extensions
- Dynamic layout is a generalization of existing layout code, not a new system
- The `updatePitchState` function already works generically on `InstrumentPitchState`

---

## Suggested Build Order

Dependencies flow through three layers: data types, analysis logic, rendering. Changes within each layer are largely independent.

### Step 1 — Data layer (foundation, no consumers yet)

**Files:** `src/audio/types.ts`, `src/audio/InstrumentActivityScorer.ts`

Changes:
- Expand `InstrumentName` union to 8 instruments
- Add 4 entries to `INSTRUMENT_BAND_MAP`
- Change `PitchAnalysisState` to `{instruments: Record<string, InstrumentPitchState>}`
- Update `resolveBandsForInstrument` with new mid-range logic

These changes are purely additive. Do this first so downstream TypeScript compiles correctly.

### Step 2 — UI instrument selection (independent of analysis/render)

**File:** `src/components/BandSetupPanel.tsx`

Changes:
- Add saxophone, trumpet, trombone, vibes to `AVAILABLE_INSTRUMENTS`
- Add icons and frequency range labels

This is cosmetically independent. Can be developed in parallel with step 1.

### Step 3 — Analysis loop update

**File:** `src/audio/AnalysisTick.ts`

Changes:
- Update pitch detection to iterate `state.pitch.instruments` record
- Update call-response guard for new `PitchAnalysisState` shape

Depends on step 1.

### Step 4 — App.tsx initialization

**File:** `src/App.tsx`

Changes:
- Build `pitch.instruments` record for all melodic instruments in lineup (not just keyboard+guitar)
- Define which instruments receive pitch detection (recommended: all non-percussion, i.e., everything except drums)

Depends on steps 1 and 3.

### Step 5 — Layout engine extension (independent of steps 1-4)

**File:** `src/canvas/nodes/NodeLayout.ts`

Changes:
- Extend `computeNodePositions` for counts 5-8
- Adjust `INSTRUMENT_ORDER` usage: this constant can remain for backward compatibility but `CanvasRenderer` will not use it as its primary source

Can be developed in parallel with steps 1-4.

### Step 6 — Canvas renderer dynamic initialization

**File:** `src/canvas/CanvasRenderer.ts`

Changes:
- Add `lineup: string[]` parameter to constructor
- Derive `instrumentOrder` from lineup
- Call `computeNodePositions(lineup.length)` dynamically
- Build `edgeAnimStates` and `pairs` from lineup
- Fix pocket line guard
- Update `resize()`
- Expand `getNodeLayout()` to include `instruments: string[]`

Depends on steps 1 and 5.

### Step 7 — Edge rendering update

**Files:** `src/canvas/edges/drawCommunicationEdges.ts`, `src/canvas/edges/edgeTypes.ts`

Changes in `drawCommunicationEdges.ts`:
- Remove module-level `PAIRS` IIFE
- Accept pairs array as parameter
- Pairs now come from `CanvasRenderer.pairs`

Changes in `edgeTypes.ts`:
- Add 22 new pair entries to `EDGE_TYPE`

Depends on step 6 for integration.

### Step 8 — VisualizerCanvas wiring

**File:** `src/components/VisualizerCanvas.tsx`

Changes:
- Read lineup from Zustand store at mount time
- Pass lineup to `CanvasRenderer` constructor
- Update click handler to use `instruments` from `getNodeLayout()`

Depends on step 6.

**Integration test order:** After step 8, test the full flow: configure a 6-instrument lineup in BandSetupPanel, load a file, verify calibration succeeds, verify 6 nodes appear, verify edges draw between all pairs, verify pocket line draws when bass+drums present, verify pocket line absent when one is missing.

---

## Critical Integration Points

### The Module-Level PAIRS IIFE Is the Highest-Risk Change

If this IIFE is not removed, new instrument edges will silently not draw. The `edgeAnimStates` will have entries for the new pairs (they get created in the `CanvasRenderer` constructor), but `drawCommunicationEdges` will never iterate them. No runtime error — just invisible edges.

**Detection:** Add a development assertion that `pairs.length === edgeAnimStates.size - 1` (minus the pocket pair). This will catch the mismatch immediately.

### Lineup Must Be Fixed Before CanvasRenderer Construction

`VisualizerCanvas` mounts only when `isFileLoaded` is true (App.tsx line 180). `BandSetupPanel` locks the lineup when `isFileLoaded` becomes true. This means by the time `CanvasRenderer` is constructed, the lineup is finalized.

However, if the user loads a second file (which resets `isFileLoaded` to false and then back to true via the reset flow), the component will unmount and remount, creating a new `CanvasRenderer` with the new lineup. The existing cleanup in `VisualizerCanvas` useEffect handles this correctly.

### Pitch Detection for New Melodic Instruments

The `updatePitchState` function (PitchDetector.ts) uses ACF2+ autocorrelation, which works for any pitched instrument. It is instrument-agnostic. Adding saxophone, trumpet, trombone, and vibes to pitch detection requires only:
1. Initializing an `InstrumentPitchState` for each in `App.tsx`
2. Iterating them in `AnalysisTick.ts`

No changes to `PitchDetector.ts` itself.

**Note on percussion:** Drums should not receive pitch detection (ACF2+ on transient-heavy signals produces spurious pitch readings). Gate pitch detection by excluding `drums` from the instruments record. The `App.tsx` initialization can check `instrument !== 'drums'` when building the record.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Hardcoded change sites | HIGH | Identified from direct source reading; all 13 sites explicitly located with line numbers |
| audioStateRef shape changes | HIGH | All type definitions and consumers read in full |
| Analysis loop changes | HIGH | AnalysisTick.ts fully read; coupling points explicit |
| Canvas renderer changes | HIGH | CanvasRenderer.ts and all edge/node files read; module-level IIFE pitfall confirmed |
| New frequency band assignments | MEDIUM | Instrument physics are well-known; exact bin threshold effectiveness requires empirical testing |
| Layout geometry for 5-8 nodes | MEDIUM | Starting coordinates provided; visual iteration required on actual canvas |
| Edge semantic classification for new pairs | MEDIUM | Jazz music theory informs the taxonomy; some assignments are debatable |

---

## Sources

All findings from direct source reading. No external sources required — the architecture is fully expressed in the 17 source files read.

Files read in full:
- `/Users/seijimatsuda/jazz_learning/src/audio/types.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/AnalysisTick.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/InstrumentActivityScorer.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/FrequencyBandSplitter.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/AudioEngine.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/PitchDetector.ts`
- `/Users/seijimatsuda/jazz_learning/src/audio/CalibrationPass.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/CanvasRenderer.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/nodes/NodeLayout.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/edges/drawCommunicationEdges.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/edges/drawPocketLine.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/edges/EdgeAnimState.ts`
- `/Users/seijimatsuda/jazz_learning/src/canvas/edges/edgeTypes.ts`
- `/Users/seijimatsuda/jazz_learning/src/components/BandSetupPanel.tsx`
- `/Users/seijimatsuda/jazz_learning/src/components/VisualizerCanvas.tsx`
- `/Users/seijimatsuda/jazz_learning/src/store/useAppStore.ts`
- `/Users/seijimatsuda/jazz_learning/src/App.tsx`
