# Phase 10: Band Setup UI and Canvas Layout — Research

**Researched:** 2026-03-11
**Domain:** React UI (instrument selection), HTML5 Canvas 2D (layout, batch rendering, edge culling), iOS Safari performance
**Confidence:** HIGH — all findings sourced directly from the existing codebase and established browser-native patterns.

---

## Summary

Phase 10 has three distinct sub-problems: (1) upgrading `BandSetupPanel.tsx` from a dropdown-add UI to toggle buttons with family grouping, count badge, and 2-8 validation; (2) redesigning `computeNodePositions` in `NodeLayout.ts` to place bass at the gravitational center of a circular layout (CANV-02); and (3) adding edge culling and batch rendering in `drawCommunicationEdges.ts` for iOS performance at 6-8 instruments (CANV-03/04).

The key structural finding: **all canvas infrastructure is already lineup-aware from Phase 9**. `CanvasRenderer` accepts `lineup: string[]`, derives `nodePositions`, `pairs`, and `edgeAnimStates` at construction time, and nothing is hardcoded. Phase 10 changes are therefore well-scoped additions to existing extension points — no architecture changes required.

The critical open decision for this phase is **bass-as-center vs. bass-at-fixed-position**: the existing `computeNodePositions` uses a grid/cluster layout for counts 5-8. CANV-02 requires bass to always be at the gravitational center. This means replacing the grid approach for 5-8 with a true circular arrangement where bass occupies position `(0.5, 0.5)` (canvas center) and all other nodes are arranged in a ring around it. This is a layout algorithm change, not an architecture change.

**Primary recommendation:** Replace the 5-8 grid positions in `NodeLayout.ts` with a `bass-center + ring` algorithm parameterized by count. Bass is placed at `(0.5, 0.5)` canvas center; remaining `n-1` instruments are distributed uniformly on a circle of radius `r`. Ring radius must be validated against the 800x400 2:1 canvas with tension meter at x≈760 and BPM display at y≈380.

---

## Standard Stack

No new libraries needed. This phase uses only what is already installed.

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.0 | BandSetupPanel toggle UI | Already in project |
| TypeScript 5.9 | ~5.9.3 | Strict union enforcement | Already in project |
| Tailwind CSS 4 | ^4.2.1 | Panel styling | Already in project |
| Zustand 5 | ^5.0.11 | `lineup` state, `setLineup` action | Already wired |
| HTML5 Canvas 2D | browser-native | All canvas rendering | Already in CanvasRenderer |

### No new dependencies needed
Phase 10 is entirely self-contained within the existing stack. No npm installs required.

---

## Architecture Patterns

### Existing Extension Points (HIGH confidence — verified from source)

The codebase established these patterns in Phases 5-9 that Phase 10 must follow:

**1. `NodeLayout.ts` is the single source for layout math**
- `computeNodePositions(count: 2|3|4|5|6|7|8): NodePosition[]` — returns fractional `[0,1]` positions
- `buildPairs(instrumentOrder: string[]): PairTuple[]` — generates all non-pocket pairs
- Both called from `CanvasRenderer` constructor and `resize()`
- Phase 10 only modifies `computeNodePositions` cases 5-8 (and possibly 2-4 for bass-center)

**2. `CanvasRenderer` is the lineup integration point**
- Constructor: `new CanvasRenderer(canvas, audioStateRef, lineup: string[])`
- Derives all node/edge state from `lineup` at construction — no mid-playback changes
- `lineup` is locked at file load time (isFileLoaded gate in BandSetupPanel)
- `VisualizerCanvas.tsx` reads `lineup` from Zustand at mount: `useAppStore.getState().lineup`

**3. `BandSetupPanel` already has 8 instruments listed**
- `AVAILABLE_INSTRUMENTS` array already has all 8 (Phase 9 completed)
- Current UI: dropdown add + remove button (BAND-02 satisfied by data, not UX)
- Phase 10 changes: replace dropdown with toggles, add family grouping, count badge, 2-8 validation

**4. `drawCommunicationEdges.ts` already has weight-based opacity**
- Edges with `animState.currentWeight < 0.3` are already culled via early-exit at line 119
- Phase 10 (CANV-04) needs to raise this threshold to `0.4` or add a count-based gate when `lineup.length > 5`
- Batch rendering (CANV-03) means moving all non-animated (static_thin + subtle) edges into a single `ctx.save()/beginPath()/stroke()/restore()` block

### Pattern 1: Bass-Center Circular Layout

**What:** Bass at canvas center `(0.5, 0.5)`; remaining `n-1` instruments on a circular ring.

**Formula for ring positions:**
```typescript
// For instrument at ring index k (0-indexed, excluding bass), total ringCount = n-1:
const angle = (2 * Math.PI * k / ringCount) - Math.PI / 2; // start at top
const x = 0.5 + ringRadius * Math.cos(angle);
const y = 0.5 + ringRadius * Math.sin(angle);
```

**Ring radius constraints (from existing canvas geometry — verified):**
- Canvas: 800×400 logical pixels (2:1 aspect ratio)
- Tension meter: right edge, x≈760 (width 24px, x=w-40=760)
- BPM display: bottom-left, y≈380 (baseline at h-20=380)
- Role legend: top-left, x=16, y=20
- Node radii: 28px base (INITIAL_BASE_RADIUS), up to ~36px when soloing
- Safe canvas area (excluding overlays): x∈[80, 740], y∈[60, 360]
- Safe fractional area: x∈[0.10, 0.925], y∈[0.15, 0.90]
- Maximum ring radius that fits 8 nodes of 28px: must ensure no node center is closer than ~0.07 to the safe boundary
- A ring radius of `0.35` in x (280px) exceeds the 2:1 canvas height (y would need 0.35, which is 140px from center at 200px center — feasible: 200+140=340 < 360)
- Recommended ring radius: `0.30` (240px in x, 120px in y from center) — fits all 8 safely

**The aspect ratio complication:** Canvas is 2:1 (wider than tall). A circular ring at fractional coords will appear elliptical unless the radius is adjusted per-axis. Two options:
- **Option A (uniform fraction):** Use same `ringRadius` for both x and y → ellipse (wider than tall). Simple, but nodes appear in an oval ring.
- **Option B (aspect-corrected):** Use `ringRadius_x = r` and `ringRadius_y = r * (W/H) * (H/W) = r` — same as A since fractional coords already account for aspect ratio when multiplied by w and h independently.
- **Clarification:** If `x = 0.5 + r * cos(θ)` and `y = 0.5 + r * sin(θ)`, the pixel positions are `px = x * 800` and `py = y * 400`. So a node at r=0.3, θ=0° gets px=440, py=200 (center). At θ=90°, px=400, py=320. The vertical distance (120px) is half the horizontal distance (240px) — ellipse. For a true circle on-screen, use `rx = r` and `ry = r * 0.5` (aspect ratio correction).

**Recommendation:** Use aspect-corrected radii: `rx = 0.34`, `ry = 0.34 * 0.5 = 0.17` for n=8. This gives true circular appearance on the 2:1 canvas. Validate at n=2 and n=8 for readability on 320px iOS width.

**Collision check at n=8:** Ring has 7 nodes (bass at center). Adjacent node arc distance = `2π * rx * canvasW / 7 = 2π * 0.34 * 800 / 7 ≈ 244px`. Node diameter ≈ 56px. No collision at 320px width (scaled): `244 * (320/800) = 97px gap` — readable.

### Pattern 2: BandSetupPanel Toggle UI

**What:** Replace the dropdown `<select>` + add/remove buttons with 8 toggle buttons organized by family group.

**Family grouping** (instrument families for visual organization):
```
Rhythm section: bass, drums
Chords/Melody: keyboard, guitar, vibes
Front line: saxophone, trumpet, trombone
```

**Count constraint (BAND-01):**
- Minimum 2 instruments — disable unchecking when count === 2
- Maximum 8 instruments — all 8 available, cap is architectural (8 instruments total)
- Count badge: show current count (e.g. "4 / 8")

**Vibes + keyboard policy (open decision from STATE.md):**
- REQUIREMENTS.md Out of Scope: "Vibes/keyboard simultaneous selection — Acoustically indistinguishable via FFT — defer to v1.2 with tremolo detection"
- ACTION REQUIRED before Phase 10 ships: decide UI behavior. Options:
  - A) Prevent in UI: disable vibes toggle when keyboard is selected (and vice versa) with tooltip explaining why
  - B) Allow with transparency: let both be selected, show warning badge "⚠ vibes+keyboard overlap" but don't block

**Toggle button implementation pattern:**
```typescript
// Simple: no CSS-in-JS, use inline styles consistent with existing dark theme
const isSelected = lineup.includes(instrument);
const isDisabled = isFileLoaded || (!isSelected && lineup.length >= 8) || (!isSelected && isVibesKeyboardConflict(instrument, lineup));
```

**Existing styling conventions (from BandSetupPanel.tsx):**
- Background: `#13131f` (panel), `rgba(99,102,241,0.08)` (selected item bg)
- Border: `rgba(99,102,241,0.3)` (indigo-ish)
- Text colors: `#e5e7eb` (primary), `#9ca3af` (secondary), `#6b7280` (disabled)
- Active/selected: `rgba(99,102,241,0.25)` bg, `#a78bfa` text
- Locked state: `opacity reduced`, `cursor: not-allowed`

### Pattern 3: Edge Batch Rendering (CANV-03)

**Current behavior:** `drawCommunicationEdges.ts` calls `ctx.save()` / `ctx.restore()` per edge. For 28 edges at 8 instruments, this is 28 save/restore pairs per frame on iOS.

**Batch pattern:** Group non-animated edges into a single path batch:
```typescript
// Batch all static_thin + subtle edges (same lineWidth group) into one stroke call
ctx.save();
ctx.setLineDash([]);
// Per-opacity edges need individual globalAlpha — true batching requires same alpha
// Alternative: draw all non-animated edges at full opacity, use compositing
ctx.restore();
```

**iOS-specific constraint (HIGH confidence — verified from existing code comments):**
- `Always ctx.save()/ctx.restore() for lineDash isolation (iOS Safari)` — from drawCommunicationEdges.ts line 22
- `setLineDash([])` must be called explicitly before every solid line on iOS (does not reset automatically)
- `globalAlpha` changes must be isolated with save/restore or they leak

**True batching for performance:** Edges in `static_thin` and `subtle` state have different opacities (0.4 and 0.65). True single-stroke batching is only possible if all edges share the same `globalAlpha`. Options:
- **Option A:** Draw all non-animated edges at `globalAlpha = 1.0`, encode opacity in stroke color alpha channel: `rgba(r, g, b, opacity)` as `strokeStyle`. This avoids per-edge `globalAlpha` changes.
- **Option B:** Two passes — one at opacity 0.4 for `static_thin`, one at 0.65 for `subtle`. Still 2 save/restore instead of 28.
- **Option C (simplest for Phase 10):** Reduce save/restore count only for animated vs. non-animated. Skip save/restore entirely for hidden edges (already early-exited). Marginal gain.

**Recommendation:** Option A (encode opacity in rgba strokeStyle). Eliminates `ctx.globalAlpha` changes for non-animated edges. The `ctx.save()/ctx.restore()` only needed for `setLineDash` on animated edges.

### Pattern 4: Edge Auto-Hide Threshold (CANV-04)

**Current:** Edges with `weight < 0.3` are already hidden (early exit in drawCommunicationEdges.ts line 119).

**CANV-04 requirement:** Weak edges auto-hide when `lineup.length > 5`. "Weak" needs definition — reasonable interpretation: raise the hide threshold from 0.3 to 0.45 when instrument count exceeds 5.

**Implementation:** Pass `lineup.length` to `drawCommunicationEdges` and compute a dynamic threshold:
```typescript
const hideThreshold = pairs.length > 10 ? 0.45 : 0.3; // > 10 pairs ≈ > 5 instruments (C(6,2)=15 > 10)
```

Or pass explicitly:
```typescript
function drawCommunicationEdges(..., instrumentCount: number): void {
  const hideThreshold = instrumentCount > 5 ? 0.45 : 0.3;
```

`CanvasRenderer` already has access to `this.instrumentOrder.length` — trivial to pass.

### Anti-Patterns to Avoid

- **Don't use `OffscreenCanvas` for iOS:** Current code uses `document.createElement('canvas')` for offscreen (glowLayer.ts) with explicit iOS 16 compat note. Do not switch to `OffscreenCanvas` API.
- **Don't read `lineup` from Zustand inside `CanvasRenderer`:** The renderer is not a React component and must not call `useAppStore`. Lineup is passed at construction time only.
- **Don't recompute layout per frame:** `nodePositions` are computed once at construction and on resize — never in the rAF loop.
- **Don't use `shadowBlur`:** Existing performance constraint applies — use pre-created offscreen glow canvases (`createGlowLayer`) and `ctx.drawImage`.
- **Don't allocate per frame:** No `new Float32Array` / `new Uint8Array` / `new Array` in the rAF callback.
- **Don't change CanvasRenderer mid-playback:** `lineup` is locked at file load. `VisualizerCanvas` creates renderer once at mount; lineup changes after file load are prevented by `isFileLoaded` gate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular layout math | Custom trigonometry library | Inline `Math.cos/sin` — 3 lines | Already established pattern in codebase, zero deps |
| Toggle button with validation | External component library | Inline React + existing styling pattern | Consistency with existing dark theme; no new dependencies |
| Edge opacity interpolation | Custom lerp | `lerpExp` from `NodeAnimState.ts` — already imported | Already used for weight smoothing in drawCommunicationEdges |
| iOS Canvas batching | WebGL | Canvas 2D with rgba strokeStyle | WebGL is overkill; rgba encoding achieves batching within existing 2D context |

---

## Common Pitfalls

### Pitfall 1: Aspect Ratio Breaking Circular Layout
**What goes wrong:** Using same fractional radius for x and y on a 2:1 canvas produces an ellipse (nodes are 240px apart horizontally, 120px apart vertically). The layout "looks right" in code but nodes appear cramped vertically.
**Why it happens:** `x * 800` and `y * 400` scale differently. A 0.3 fractional radius means 240px in x but 120px in y.
**How to avoid:** Use `rx = r` and `ry = r * (height/width) = r * 0.5` for circular appearance. For `rx=0.34`, `ry=0.17` gives true visual circle on 800x400.
**Warning signs:** At 8 instruments, nodes appear vertically crowded but horizontally spaced.

### Pitfall 2: Bass Index Assumption in Circular Layout
**What goes wrong:** Assuming bass is always at a specific ring index (e.g., index 3) and hard-coding its center position. Different lineups will have bass at different indices in the `lineup` array.
**Why it happens:** `lineup` order is user-defined (they toggle instruments in arbitrary order). Bass could be `lineup[0]` or `lineup[6]`.
**How to avoid:** In `computeNodePositions`, return positions indexed by slot. In `CanvasRenderer`, place bass at the center position by finding its index: `const bassIdx = this.instrumentOrder.indexOf('bass')`. The position array slot for `bassIdx` should be `{x: 0.5, y: 0.5}`. Non-bass instruments fill the ring slots in their order within the non-bass subarray.
**Warning signs:** Bass appears at a ring position instead of center when it's added as a non-first instrument.

**Implementation note:** `computeNodePositions` takes a `count`, not the instrument names. The bass-center constraint requires either:
- (A) Passing `instrumentOrder: string[]` to `computeNodePositions` so it can place bass at center — requires signature change
- (B) Returning a structure like `{bassSlot: 0, positions: NodePosition[]}` where slot 0 is always center, and `CanvasRenderer` maps bass to slot 0 during construction — requires positional convention
- (C) `CanvasRenderer` reorders `instrumentOrder` so bass is always at index 0, then returns center position at index 0 — positions[0] = `{x:0.5, y:0.5}` always

**Recommendation:** Option C — `CanvasRenderer` sorts `instrumentOrder` at construction to put bass first (if present). `computeNodePositions` returns position[0] = center, positions[1..n-1] = ring. This is invisible to the caller and requires no signature change to `computeNodePositions`.

### Pitfall 3: VisualizerCanvas Stale Lineup
**What goes wrong:** `VisualizerCanvas.tsx` reads lineup from Zustand at mount (`useEffect(() => { ... }, [audioStateRef])`). If lineup changes after mount but before file load, the `CanvasRenderer` is already created with the old lineup.
**Why it happens:** Current `useEffect` depends only on `audioStateRef`, not `lineup`. The renderer is created once at mount.
**How to avoid:** The existing architecture handles this correctly — `lineup` is locked at file load, and the canvas is only shown after file load (`{isFileLoaded && <VisualizerCanvas .../>}` in App.tsx line 191-198). So the renderer is only created when `isFileLoaded` becomes true, at which point `lineup` is already locked. No fix needed — but must verify the `isFileLoaded` gate still holds after Phase 10 UI changes.
**Warning signs:** Canvas shows default 4-instrument layout despite custom lineup selection.

### Pitfall 4: iOS setLineDash State Leakage
**What goes wrong:** On iOS Safari, calling `setLineDash([12, 8])` for animated edges and then forgetting to call `setLineDash([])` for subsequent static edges causes all edges to render as dashed.
**Why it happens:** iOS Safari's Canvas 2D implementation does not reset `lineDash` between paths without explicit reset. This is documented in the existing codebase comments.
**How to avoid:** Keep `ctx.save()/ctx.restore()` wrapping any edge that uses `setLineDash`. The batch rendering optimization (CANV-03) must maintain this isolation.
**Warning signs:** Static edges appear dashed on iPhone but not on desktop Chrome.

### Pitfall 5: 2-8 Minimum Count Validation
**What goes wrong:** User can uncheck all instruments down to 0, causing `computeNodePositions(0)` to be called with an invalid count. TypeScript union `2|3|4|5|6|7|8` would catch this at compile time if enforced, but Zustand `lineup` is typed as `string[]`.
**Why it happens:** The TypeScript type for `lineup` in the store is `string[]` (not `[string, string, ...string[]]`). `computeNodePositions` takes `count: 2|3|4|5|6|7|8` but `lineup.length` is typed as `number`. The cast `as 2|3|4|5|6|7|8` in CanvasRenderer (line 147) is unchecked at runtime.
**How to avoid:** Enforce minimum count in `BandSetupPanel` — disable unchecking when `lineup.length <= 2`. Add a runtime guard in `computeNodePositions` or CanvasRenderer: if count < 2 or count > 8, log warning and return empty array.
**Warning signs:** Canvas goes blank or crashes when lineup is reduced to 1 instrument.

---

## Code Examples

Verified patterns from the existing codebase (no external sources needed):

### Bass-Center Circular Layout (NodeLayout.ts pattern)
```typescript
// Source: derived from existing computeNodePositions + canvas geometry analysis
// For count n >= 2 with bass at center:
// positions[0] = bass center = {x: 0.5, y: 0.5}
// positions[1..n-1] = ring around center
// CanvasRenderer must reorder instrumentOrder to put bass at index 0 before calling this

export function computeNodePositions(count: 2 | 3 | 4 | 5 | 6 | 7 | 8): NodePosition[] {
  if (count === 2) {
    // Special case: no ring, just two positions (bass center + one peer)
    return [
      { x: 0.50, y: 0.50 }, // bass (center)
      { x: 0.70, y: 0.50 }, // peer (right of center)
    ];
  }

  // General case: bass at center + (count-1) instruments on elliptical ring
  const positions: NodePosition[] = [{ x: 0.50, y: 0.50 }]; // bass
  const ringCount = count - 1;
  const rx = 0.34; // ring x-radius (fractional) — validated: 0.34 * 800 = 272px
  const ry = 0.17; // ring y-radius (fractional) — 272/800*400 = 136px → true visual circle

  for (let k = 0; k < ringCount; k++) {
    const angle = (2 * Math.PI * k / ringCount) - Math.PI / 2; // start at top
    positions.push({
      x: 0.5 + rx * Math.cos(angle),
      y: 0.5 + ry * Math.sin(angle),
    });
  }
  return positions;
}
```

### CanvasRenderer bass-first reordering (constructor pattern)
```typescript
// Source: CanvasRenderer.ts constructor pattern — place bass at index 0
// In CanvasRenderer constructor, after receiving lineup:
const bassIdx = lineup.indexOf('bass');
if (bassIdx > 0) {
  // Move bass to front: [others..., bass] → [bass, others...]
  this.instrumentOrder = [
    'bass',
    ...lineup.filter(i => i !== 'bass'),
  ];
} else {
  this.instrumentOrder = [...lineup];
}
// Then compute positions and pairs from this.instrumentOrder
this.nodePositions = computeNodePositions(this.instrumentOrder.length as 2|3|4|5|6|7|8);
this.pairs = buildPairs(this.instrumentOrder);
```

### Toggle button with family grouping (BandSetupPanel pattern)
```typescript
// Source: extrapolated from existing BandSetupPanel.tsx styling patterns
const INSTRUMENT_FAMILIES = [
  { label: 'Rhythm', instruments: ['bass', 'drums'] },
  { label: 'Chords / Melody', instruments: ['keyboard', 'guitar', 'vibes'] },
  { label: 'Front Line', instruments: ['saxophone', 'trumpet', 'trombone'] },
];

// Per-toggle state:
const isSelected = lineup.includes(instrument);
const wouldViolateMin = isSelected && lineup.length <= 2;
const wouldViolateMax = !isSelected && lineup.length >= 8;
const isVibesKbConflict = !isSelected && (
  (instrument === 'vibes' && lineup.includes('keyboard')) ||
  (instrument === 'keyboard' && lineup.includes('vibes'))
);
const isDisabled = isFileLoaded || wouldViolateMin || wouldViolateMax; // conflict is warn only
```

### Dynamic edge threshold (CANV-04)
```typescript
// Source: drawCommunicationEdges.ts pattern — add parameter, compute threshold
export function drawCommunicationEdges(
  // ... existing params ...
  instrumentCount: number, // NEW: lineup.length from CanvasRenderer
): void {
  const hideThreshold = instrumentCount > 5 ? 0.45 : 0.30;
  // Replace `if (w < 0.3)` with `if (w < hideThreshold)`
```

### Batch rendering non-animated edges (CANV-03)
```typescript
// Source: derived from existing ctx.save/restore pattern in drawCommunicationEdges.ts
// Two-pass approach: solid lines first (no dash state), then animated lines

// Pass 1: all non-animated edges (static_thin + subtle) in rgba color encoding
ctx.setLineDash([]); // once, not per-edge
for (const [idxA, idxB, key] of pairs) {
  const animState = edgeAnimStates[key];
  if (!animState || animState.currentOpacity < 0.01) continue;
  if (animState.visualState === 'animated') continue; // handled in pass 2
  // Encode opacity in color string — avoids globalAlpha changes
  ctx.strokeStyle = `rgba(${r},${g},${b},${animState.currentOpacity})`;
  ctx.lineWidth = animState.lineWidth;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
}

// Pass 2: animated edges (need setLineDash, must save/restore)
for (const [idxA, idxB, key] of pairs) {
  if (animState.visualState !== 'animated') continue;
  ctx.save();
  ctx.setLineDash([12, 8]);
  // ... existing animated edge code ...
  ctx.restore();
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 10 |
|--------------|------------------|---------------------|
| Hardcoded 4-instrument PAIRS IIFE | `buildPairs(lineup)` at construction (Phase 9) | Phase 10 can use `this.pairs` without changes |
| Fixed grid positions for 5-8 | Pre-computed cluster grid (Phase 9) | Phase 10 replaces these with bass-center circular |
| Dropdown add/remove for lineup | Same (Phase 9 partially upgraded UI) | Phase 10 replaces with full toggle UI |
| No edge culling by count | Edge opacity < 0.3 hides (Phase 6) | Phase 10 adds count-based threshold raise |

---

## Open Questions

### 1. Bass-not-in-lineup case for CANV-02
- **What we know:** CANV-02 says "bass always occupies gravitational center." But bass might not be in the lineup (valid 2-instrument lineup without bass).
- **What's unclear:** What position should be center when bass is absent? Options: (A) some other "anchor" instrument takes center (drums?), (B) layout falls back to non-center arrangement (current grid), (C) center is always empty when no bass.
- **Recommendation:** If bass is absent, use the existing non-center layout (current behavior). CANV-02 only applies "when bass is present." This is consistent with the pocket line guard pattern (Phase 9): pocket line only drawn when both bass AND drums are present.

### 2. Vibes + keyboard policy (BLOCKER from STATE.md)
- **What we know:** Acoustically indistinguishable (share 250-2000 Hz band). REQUIREMENTS.md lists it as "Out of Scope" for v1.1.
- **What's unclear:** Should the UI prevent selection or warn? This is a product decision.
- **Recommendation:** Disable in UI (Option A above) — show tooltip "Vibes and keyboard share the same frequency range — use one or the other." This is the conservative choice that avoids confusing analysis output. Can be unlocked in v1.2 with tremolo disambiguation. This matches the Out of Scope language in REQUIREMENTS.md ("defer to v1.2 with tremolo detection").

### 3. iOS empirical performance test (CANV-03, from STATE.md)
- **What we know:** At 8 instruments, 28 edges exist with quadratic growth. Current code does 28 save/restore pairs per frame.
- **What's unclear:** Whether this actually causes stuttering on real iOS hardware — needs empirical test early in execution.
- **Recommendation:** Implement CANV-03 batch rendering as part of the plan but explicitly schedule an iOS test as the first verification step. Do not defer the test to end of phase.

### 4. Ring radius at 320px viewport width
- **What we know:** On 320px iOS screen, canvas CSS width is 320px, height is 400px (fixed CSS height, currently hardcoded in `VisualizerCanvas.tsx` as `height: '400px'`). At 320px width, ring of `rx=0.34` gives 0.34*320=109px radius. Node diameter ~56px. Adjacent node minimum gap at 8 instruments: `2π*109/7 ≈ 97px`. That's 97px center-to-center, 41px gap between node edges. Readable but tight.
- **What's unclear:** Whether 320px width is the real minimum or if 375px (iPhone SE/mini) is the practical minimum.
- **Recommendation:** Validate at 375px. If 320px is needed, reduce rx slightly to 0.30 for counts 7-8.

---

## Sources

### Primary (HIGH confidence)
- `src/canvas/nodes/NodeLayout.ts` — computeNodePositions, buildPairs, PairTuple; all patterns verified from source
- `src/canvas/CanvasRenderer.ts` — constructor lineup integration, geometry constants, rAF loop patterns
- `src/canvas/edges/drawCommunicationEdges.ts` — edge weight thresholds, visual state machine, iOS save/restore notes
- `src/canvas/edges/EdgeAnimState.ts` — animation state structure, factory
- `src/canvas/offscreen/glowLayer.ts` — iOS OffscreenCanvas compat note
- `src/components/BandSetupPanel.tsx` — current UI, AVAILABLE_INSTRUMENTS, styling conventions
- `src/components/VisualizerCanvas.tsx` — mount behavior, Zustand lineup read, click detection
- `src/store/useAppStore.ts` — lineup state shape, setLineup action
- `.planning/STATE.md` — open decisions, blockers
- `.planning/REQUIREMENTS.md` — BAND-01/02, CANV-01/02/03/04, Out of Scope for vibes+keyboard
- `09-03-SUMMARY.md` — layout decisions D-09-03-1/2/3, Phase 9 patterns established

### Secondary (MEDIUM confidence)
- Canvas 2D batch rendering pattern: encoding opacity in `rgba()` strokeStyle to avoid `globalAlpha` changes — well-known canvas optimization technique, consistent with existing codebase zero-alloc constraints.
- iOS Safari `setLineDash` state leakage: confirmed by existing codebase comment ("Always ctx.save()/ctx.restore() for lineDash isolation (iOS Safari)").

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all verified from package.json and source
- Architecture: HIGH — all patterns verified directly from existing source files
- Pitfalls: HIGH — canvas/iOS pitfalls verified from existing code comments and source patterns
- Circular layout math: HIGH — trigonometry is deterministic; canvas geometry measurements verified from CanvasRenderer source
- iOS performance: MEDIUM — batch rendering pattern is sound; empirical device validation still needed (flagged as blocker)

**Research date:** 2026-03-11
**Valid until:** 60 days — this is all codebase-internal, no external library versions to expire

---

## Phase 10 Plan Readiness

Based on research, the three plans align well with technical scope:

**10-01: BandSetupPanel** — Replace dropdown with toggle grid, add family grouping, count badge, 2-8 validation, vibes+keyboard conflict warning. All in `BandSetupPanel.tsx`. No wiring changes — Zustand `setLineup` already handles any lineup.

**10-02: Circular layout engine and VisualizerCanvas wiring** — Modify `computeNodePositions` in `NodeLayout.ts` to implement bass-center + ring. Add bass-first reordering in `CanvasRenderer` constructor. No interface changes needed for `drawCommunicationEdges` or `VisualizerCanvas`.

**10-03: Edge batching, dynamic threshold, and node scaling** — Add `instrumentCount` parameter to `drawCommunicationEdges`, implement two-pass batch rendering (CANV-03), raise hide threshold when count > 5 (CANV-04). Node scaling (if required) would adjust `INITIAL_BASE_RADIUS` or role radii based on count. Empirical iOS test must happen in this plan.
