# Phase 14: Tech Debt and Polish — Research

**Researched:** 2026-03-12
**Domain:** Codebase cleanup — TypeScript/React/Canvas rendering pipeline
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

This phase targets three specific debt items identified in the v1.1 audit. All three are
small, surgical changes with no external library dependencies. Research consisted entirely
of reading the actual source files to locate the exact code that must change and understand
its surrounding invariants.

**DEBT-01** is a single-line removal. The `?? 'support'` nullish coalescing fallback on
`EDGE_TYPE[key]` in `drawCommunicationEdges.ts` at line 214 can never trigger for
any key produced by `buildPairs()`, because `buildPairs()` generates only canonical
alphabetical keys that are all enumerated in `EDGE_TYPE`. The fallback is dead code and
misleads readers into thinking EDGE_TYPE might have gaps.

**DEBT-02** is a guard block to add before line 214 in `drawCommunicationEdges.ts`. The
`key` in each PairTuple comes from `buildPairs()` which uses `instrumentOrder` strings
from the CanvasRenderer constructor. If `instrumentOrder` ever contains a non-string, an
empty string, or a name not separated by a single underscore, `EDGE_TYPE[key]` returns
`undefined`. The fix is a validation check on `key` format before the EDGE_TYPE lookup,
logging a warning and skipping the pair via `continue`.

**DEBT-03** is a `useEffect` dependency and runtime update pattern fix in
`VisualizerCanvas.tsx`. Currently `lineup` is read from the Zustand store exactly once
(`useAppStore.getState().lineup` on mount) and passed into the `CanvasRenderer`
constructor. `CanvasRenderer` stores it as `this.instrumentOrder` and never re-reads
Zustand. This means hot-swapping between recordings with different lineups (without a
React remount) would silently use stale node layout, pairs, and edge anim states.
The fix requires either making the `useEffect` re-run when `lineup` changes (by adding
`lineup` to the dependency array) or adding a `setLineup(lineup: string[])` method to
`CanvasRenderer` that re-derives `instrumentOrder`, `nodePositions`, `pairs`, and
`edgeAnimStates`.

**Primary recommendation:** All three changes are self-contained within two files.
Do DEBT-01 and DEBT-02 together in `drawCommunicationEdges.ts`. Do DEBT-03 entirely
in `VisualizerCanvas.tsx`.

---

## File Locations

| File | Line(s) of Interest | Debt Item |
|------|---------------------|-----------|
| `src/canvas/edges/drawCommunicationEdges.ts` | Line 214 | DEBT-01, DEBT-02 |
| `src/components/VisualizerCanvas.tsx` | Lines 34–38, 120 | DEBT-03 |
| `src/canvas/nodes/NodeLayout.ts` | `buildPairs()` function | Context for key format |
| `src/store/useAppStore.ts` | `lineup` state and `setLineup` action | DEBT-03 context |

---

## DEBT-01: Fallback Operator `?? 'support'`

### Current code (line 214)
```typescript
const edgeType: EdgeType = EDGE_TYPE[key] ?? 'support';
```

### Why the fallback never triggers
`key` is the third element of each `PairTuple`, produced exclusively by `buildPairs()` in
`NodeLayout.ts`. `buildPairs()` constructs the key as:
```typescript
const [nameA, nameB] = a < b ? [a, b] : [b, a];
const key = `${nameA}_${nameB}`;
```

Where `a` and `b` are entries from `instrumentOrder` — the sorted lineup array passed to
`CanvasRenderer`. Every instrument name that can appear in `instrumentOrder` is a member
of the 8-instrument set: `bass, drums, guitar, keyboard, saxophone, trombone, trumpet, vibes`.
All C(8,2) = 28 pairs are fully enumerated in `EDGE_TYPE` in `edgeTypes.ts` (lines 116–159).
The `bass_drums` pair is filtered out by `buildPairs()` before being passed here.

**Conclusion:** For any valid lineup, `EDGE_TYPE[key]` always resolves. The `?? 'support'`
fallback is unreachable for valid data.

### Fix
Remove the `?? 'support'` fallback, assert the type explicitly:
```typescript
const edgeType: EdgeType = EDGE_TYPE[key]!;
```
Or use a proper guard (see DEBT-02 which covers the malformed key case).

---

## DEBT-02: Crash Guard for Malformed Pair Keys

### What malformed keys could look like
`buildPairs()` constructs keys from `instrumentOrder` strings. Malformed keys could arise if:
- An instrument name in `instrumentOrder` is an empty string (`''`)
- An instrument name contains no characters or unexpected characters (e.g., a number, object)
- A name is duplicated in the lineup (would produce `guitar_guitar`)
- A name is spelled differently than the enum keys (e.g., `'Saxophone'` with capital S)

In all these cases, `EDGE_TYPE[key]` returns `undefined`.

### What currently happens
`EDGE_TYPE[key] ?? 'support'` silently renders the edge as `support` type with no warning.
After DEBT-01 removes the fallback, `EDGE_TYPE[key]!` would give TypeScript a lie and
`undefined` would propagate to `EDGE_COLOR[edgeType]`, which would be `EDGE_COLOR[undefined]`
— returning `undefined` and causing `baseColor.r` to throw `TypeError: Cannot read property 'r' of undefined`, crashing the canvas render loop.

### Required guard
Add before the `EDGE_TYPE` lookup in Pass 1 (currently line ~214):

```typescript
// DEBT-02: guard malformed pair keys
const KEY_PATTERN = /^[a-z]+_[a-z]+$/;
if (!KEY_PATTERN.test(key)) {
  console.warn(`[drawCommunicationEdges] Malformed pair key skipped: ${JSON.stringify(key)}`);
  continue;
}
if (!(key in EDGE_TYPE)) {
  console.warn(`[drawCommunicationEdges] Unknown pair key skipped: ${key}`);
  continue;
}
const edgeType: EdgeType = EDGE_TYPE[key];
```

### Where exactly to add it
Pass 1 loop body starts at line 137. The `EDGE_TYPE[key]` lookup is at line 214 (Step 6).
The guard should go at the top of Step 6, before the lookup. After the guard, `EDGE_TYPE[key]`
is safe to access without `??` or `!`.

---

## DEBT-03: Reactive Lineup Reading in VisualizerCanvas

### Current pattern (single-read on mount)
```typescript
useEffect(() => {
  // ...
  // Read lineup from Zustand store at mount time — line 35
  const lineup = useAppStore.getState().lineup;

  // CanvasRenderer stores lineup as this.instrumentOrder — never re-reads
  const renderer = new CanvasRenderer(canvas, audioStateRef, lineup);
  // ...
}, [audioStateRef]);   // lineup NOT in dependency array — line 120
```

`CanvasRenderer` has no public method to accept a new lineup. Its `instrumentOrder`,
`nodePositions`, `pairs`, and `edgeAnimStates` are all set in the constructor and never
updated again.

### Why this is brittle
The BandSetupPanel locks the lineup after `isFileLoaded` becomes true (line 38 of
`BandSetupPanel.tsx`). So in the current UX, the lineup cannot change once a file is loaded,
which means the VisualizerCanvas is mounted only when `isFileLoaded` is true (App.tsx line 206)
— at a point when the lineup is already locked.

However, the "Or try with an example track" button in App.tsx (`loadExample()` function,
lines 123–173) calls `useAppStore.getState().setLineup(info.lineup)` before `loadAudioBuffer`.
If `VisualizerCanvas` were to remain mounted across example-load events (which it currently
doesn't because `isFileLoaded` toggles), the lineup could change without a remount.

The more relevant scenario is: if a user loads File A (lineup A), the `VisualizerCanvas`
mounts and captures lineup A. If there were ever a "load new file" flow that doesn't unmount
`VisualizerCanvas` but changes the lineup in Zustand, the renderer would silently use the
old lineup. Currently the component unmounts and remounts on each load via the conditional
render, but this is an implicit dependency that isn't obvious.

### The "reactive" fix
Two valid approaches:

**Option A — Add `lineup` to `useEffect` dependency array:**
```typescript
const lineup = useAppStore((s) => s.lineup);   // reactive subscription

useEffect(() => {
  // ... create renderer with current lineup value
  const renderer = new CanvasRenderer(canvas, audioStateRef, lineup);
  // ...
  return () => { /* cleanup */ };
}, [audioStateRef, lineup]);   // re-runs when lineup changes
```
This destroys and recreates the `CanvasRenderer` whenever lineup changes. Works correctly,
is simple, and is safe because the rAF loop is stopped in `renderer.destroy()`. The
downside is that any in-flight visual state (weights, opacity, breathe phases) is reset
on lineup change. This is acceptable — a lineup change is a major configuration event.

**Option B — Add a `setLineup()` method to `CanvasRenderer`:**
```typescript
setLineup(lineup: string[]): void {
  // re-derive instrumentOrder, nodePositions, pairs, edgeAnimStates
}
```
This preserves the renderer instance and all non-lineup visual state. More complex —
must handle edge anim state teardown/creation, family sort re-run, pair rebuild.
Not required by the success criteria — Option A is sufficient.

### Recommendation
Option A is the correct fix for DEBT-03. The success criterion states "lineup configuration
is read reactively from state" — subscribing via `useAppStore(s => s.lineup)` and adding
it to the `useEffect` dependency array achieves exactly that. The `CanvasRenderer` destroy
+ recreate on lineup change is correct and complete.

### Important: current App.tsx conditional prevents silent mismatch today
`VisualizerCanvas` is only rendered when `isFileLoaded` is true (App.tsx line 206). Since
`isFileLoaded` is never reset to false after being set true in the current codebase
(the `reset()` action does reset it, but no UI element calls `reset()`), a remount only
happens on page reload. The debt is latent, not currently active — but fixing it now is
the right call for robustness.

---

## Architecture Patterns

### Pattern: Zustand `getState()` vs hook subscription
- `useAppStore.getState().foo` — point-in-time read, not reactive. Used in callbacks and
  imperative code outside React components. Does NOT subscribe to changes.
- `useAppStore((s) => s.foo)` — reactive selector, subscribes to changes in the component.
  Re-renders the component when `foo` changes.

In `VisualizerCanvas.tsx`, the `useEffect` currently uses `getState()` (non-reactive).
Switching to the hook selector and adding the value to the `useEffect` dependency array
is the standard Zustand + React pattern for reactive effect re-runs.

### Pattern: CanvasRenderer lifecycle
`CanvasRenderer` is an imperative class (not a React component). It owns:
- `this.instrumentOrder` — set in constructor, never changed
- `this.pairs` — built from `instrumentOrder` in constructor
- `this.edgeAnimStates` — keyed by pair string, created in constructor
- `this.nodeAnimStates` — one per instrument, created in constructor

Any lineup change requires a full `destroy()` + `new CanvasRenderer(...)` cycle.
`destroy()` cancels the rAF loop. The existing `useEffect` cleanup already calls
`renderer.destroy()` — adding `lineup` to the dep array makes it trigger correctly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reactive lineup in useEffect | Custom subscription / imperative listener | Standard Zustand hook + dep array | Already built into Zustand's API |
| Key format validation | Complex regex parser | Simple `/^[a-z]+_[a-z]+$/` test + `key in EDGE_TYPE` check | Keys are ASCII lowercase instrument names — simple pattern is sufficient |

---

## Common Pitfalls

### Pitfall 1: Removing `??` without adding a guard first
**What goes wrong:** If DEBT-01 removes `?? 'support'` before DEBT-02 adds the guard,
any malformed key (even one that would previously have silently fallen back) will now
produce `EDGE_COLOR[undefined]` → `undefined.r` → runtime TypeError in the rAF loop.
The canvas goes blank and the rAF loop may stop.

**How to avoid:** Implement DEBT-02's guard and DEBT-01's removal in the same commit,
or always implement DEBT-02 first.

### Pitfall 2: Adding `lineup` to `useEffect` deps without reading it reactively
**What goes wrong:** TypeScript and ESLint's `react-hooks/exhaustive-deps` rule will
flag it if `lineup` is read inside the effect via `getState()` but not passed as a dep.
Conversely, reading it via `getState()` inside the effect and adding `lineup` as a dep
means the dep reference never changes (since it's not a reactive value in scope).

**How to avoid:** Read `lineup` as a reactive Zustand selector at the component level
(`const lineup = useAppStore(s => s.lineup)`) so it exists as a prop-like variable in
scope, then reference it in both the effect body and the dependency array.

### Pitfall 3: Forgetting to call `renderer.destroy()` covers the CanvasRenderer cleanup
**What goes wrong:** If the `useEffect` cleanup fails to call `destroy()` before creating
a new renderer (triggered by lineup dep change), two rAF loops run simultaneously —
canvas flickers and memory leaks.

**How to avoid:** The existing cleanup in `VisualizerCanvas` already calls
`renderer.destroy()` and `rendererRef.current = null`. Adding `lineup` to the dep array
does not change this — the existing cleanup handles teardown. No additional work needed.

### Pitfall 4: `buildPairs()` key collision if instrument names contain underscores
**What goes wrong:** If an instrument name ever contained `_` (e.g., `'bass_guitar'` as
a single instrument name), the canonical key format `nameA_nameB` would be ambiguous.
**Status:** All 8 valid instrument names are single lowercase words with no underscores.
The guard regex `/^[a-z]+_[a-z]+$/` would still pass, but `EDGE_TYPE[key]` would fail.
The `key in EDGE_TYPE` check handles this correctly.

---

## Code Examples

### DEBT-01 + DEBT-02 combined change (Pass 1, Step 6 in drawCommunicationEdges.ts)

```typescript
// Source: direct codebase inspection, drawCommunicationEdges.ts line 214

// --- BEFORE ---
const edgeType: EdgeType = EDGE_TYPE[key] ?? 'support';
const baseColor = EDGE_COLOR[edgeType];

// --- AFTER ---
// DEBT-02: guard malformed pair keys — log warning and skip
const KEY_PATTERN = /^[a-z]+_[a-z]+$/;
if (!KEY_PATTERN.test(key) || !(key in EDGE_TYPE)) {
  console.warn(`[drawCommunicationEdges] Skipping invalid pair key: ${JSON.stringify(key)}`);
  continue;
}
// DEBT-01: ?? 'support' fallback removed — all valid lineup keys resolve in EDGE_TYPE
const edgeType: EdgeType = EDGE_TYPE[key];
const baseColor = EDGE_COLOR[edgeType];
```

### DEBT-03 change in VisualizerCanvas.tsx

```typescript
// Source: direct codebase inspection, VisualizerCanvas.tsx lines 23–120

// --- BEFORE (component body) ---
export function VisualizerCanvas({ audioStateRef, onCanvasReady }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    // ...
    const lineup = useAppStore.getState().lineup;  // point-in-time read
    const renderer = new CanvasRenderer(canvas, audioStateRef, lineup);
    // ...
  }, [audioStateRef]);   // lineup missing from deps

// --- AFTER ---
export function VisualizerCanvas({ audioStateRef, onCanvasReady }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const lineup = useAppStore((s) => s.lineup);   // reactive subscription

  useEffect(() => {
    // ...
    // lineup comes from outer scope (reactive) — no getState() call needed
    const renderer = new CanvasRenderer(canvas, audioStateRef, lineup);
    // ...
  }, [audioStateRef, lineup]);   // re-runs when lineup changes
```

---

## State of the Art

| Old Pattern | Current Pattern After Fix | Impact |
|-------------|--------------------------|--------|
| `EDGE_TYPE[key] ?? 'support'` | Guard + `EDGE_TYPE[key]` | Dead code removed; malformed keys produce warning+skip instead of silent wrong behavior |
| `useAppStore.getState().lineup` on mount | `useAppStore(s => s.lineup)` reactive selector | Lineup changes trigger renderer recreate; no stale state |

---

## Open Questions

1. **Is there a future "load new file without page reload" UX planned?**
   - What we know: Today `isFileLoaded` stays true once set and the BandSetupPanel locks.
   - What's unclear: If a "load new file" flow is added later without a hard reset, the
     DEBT-03 fix becomes immediately necessary. The fix is forward-compatible.
   - Recommendation: Implement DEBT-03 regardless — it is cheap and defensive.

2. **Should the KEY_PATTERN regex be defined at module level (not inside the loop)?**
   - What we know: Regex literals are compiled once per parse in V8; defining inside a loop
     does not cause repeated compilation in modern JS engines.
   - What's unclear: ESLint `no-constant-regexp-in-loop` rules may warn.
   - Recommendation: Define `KEY_PATTERN` as a module-level constant (outside the function)
     to avoid any potential lint warnings and to make the pattern reusable.

---

## Sources

### Primary (HIGH confidence)
- Direct file read: `src/canvas/edges/drawCommunicationEdges.ts` — complete Pass 1–4 logic
- Direct file read: `src/canvas/edges/edgeTypes.ts` — complete EDGE_TYPE table (28 pairs)
- Direct file read: `src/components/VisualizerCanvas.tsx` — mount/cleanup lifecycle
- Direct file read: `src/canvas/CanvasRenderer.ts` — constructor, instrumentOrder, pairs
- Direct file read: `src/canvas/nodes/NodeLayout.ts` — buildPairs() key construction
- Direct file read: `src/store/useAppStore.ts` — lineup state and setLineup action
- Direct file read: `src/App.tsx` — VisualizerCanvas conditional render, loadExample()

---

## Metadata

**Confidence breakdown:**
- DEBT-01 (fallback removal): HIGH — EDGE_TYPE has all 28 pairs; buildPairs excludes bass_drums; confirmed by reading both files
- DEBT-02 (crash guard): HIGH — failure mode is clear from EDGE_COLOR access pattern; guard approach is standard TypeScript defensive coding
- DEBT-03 (reactive lineup): HIGH — Zustand hook vs getState() semantics are well-understood; dep array pattern is standard React

**Research date:** 2026-03-12
**Valid until:** Stable (internal codebase; no external library dependency; valid until files change)
