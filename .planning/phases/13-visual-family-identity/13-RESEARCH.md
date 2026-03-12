# Phase 13: Visual Family Identity - Research

**Researched:** 2026-03-12
**Domain:** HTML5 Canvas 2D — ring stroke rendering, family-sorted circular layout, per-edge animation styles
**Confidence:** HIGH (pure canvas work, no new libraries, all patterns directly verified from existing codebase)

---

## Summary

Phase 13 adds three purely visual layers to the existing canvas: family color rings on nodes (VIS-01), family-sorted circular layout (VIS-02), and per-edge animation style differentiation (VIS-03). No new libraries are required and no audio hot-path changes are needed. All three requirements operate on data already available in the render loop.

The existing codebase provides strong anchors for all three features. `instrumentFamilies.ts` already maps every instrument to a family string (`rhythm`, `keyboard`, `strings`, `brass`, `woodwind`). `drawNode.ts` renders a filled circle but currently draws no ring stroke — adding a ring is a direct 4-line canvas extension. `computeNodePositions` distributes ring instruments in angle order derived from their index in `instrumentOrder` — sorting that array by family before computing positions achieves VIS-02 with no layout engine changes. Edge animation for VIS-03 extends `drawCommunicationEdges.ts`, which already knows each edge's `EdgeType` (`rhythmic`, `melodic`, `support`) via `EDGE_TYPE[key]`.

**Primary recommendation:** Implement all three features with pure canvas extensions — no new files for VIS-01/VIS-02/VIS-03, no new libraries, no new state. The planner should create one task per requirement, each modifying a single focused file.

---

## Standard Stack

No new libraries. This phase uses only what is already installed.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| HTML5 Canvas 2D API | Browser native | Ring strokes, animation | All rendering already done here |
| TypeScript | ~5.9.3 (installed) | Type safety for new constants | Already the project language |
| Vite + React | Installed | Build/dev | No changes needed |

### Supporting (already present)
| File | Purpose | Relevance to Phase 13 |
|------|---------|----------------------|
| `src/audio/instrumentFamilies.ts` | `INSTRUMENT_FAMILIES` map | Source of truth for family assignment — use as-is |
| `src/canvas/nodes/drawNode.ts` | Node circle + label rendering | VIS-01: add ring stroke here |
| `src/canvas/nodes/NodeLayout.ts` | `computeNodePositions` | VIS-02: caller sorts `instrumentOrder` by family before passing |
| `src/canvas/edges/drawCommunicationEdges.ts` | All non-pocket edge rendering | VIS-03: add per-type animation variants here |
| `src/canvas/edges/edgeTypes.ts` | `EDGE_TYPE[key]` mapping | VIS-03: `EdgeType` already on every edge pair |
| `src/canvas/CanvasRenderer.ts` | Orchestrates draw loop | VIS-02: reorder `instrumentOrder` in constructor |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure (no new folders)

The phase adds constants and small rendering logic to existing files. No new directories are warranted:

```
src/canvas/
├── nodes/
│   ├── drawNode.ts          # VIS-01: add familyColor param + ring stroke
│   └── NodeLayout.ts        # VIS-02: add family sort helper
├── edges/
│   └── drawCommunicationEdges.ts  # VIS-03: add rhythmic/melodic/support animation variants
└── CanvasRenderer.ts        # VIS-01: pass family color; VIS-02: sort instrumentOrder

src/audio/
└── instrumentFamilies.ts    # VIS-01+VIS-02: extend INSTRUMENT_FAMILIES for family color map
```

---

### Pattern 1: VIS-01 — Family Color Ring Stroke

**What:** After filling the node circle, draw a second `arc` path using `strokeStyle` set to the instrument's family color. Ring width ~3px. The fill color continues to encode role (soloing/comping/holding/silent); the ring encodes family (fixed, not animated).

**When to use:** Every `drawNode` call.

**Current drawNode signature:**
```typescript
// Source: src/canvas/nodes/drawNode.ts
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fillColor: string,
  label: string,
): void
```

**Required change — add `ringColor` param:**
```typescript
// Updated signature (add optional param to avoid touching all existing callers)
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fillColor: string,
  label: string,
  ringColor?: string,   // VIS-01: family color ring, optional so callers without family data still work
): void {
  // -- Filled circle (unchanged) -------------------------------------------
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // -- VIS-01: Family ring stroke -------------------------------------------
  if (ringColor) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // -- Label below circle (unchanged) ---------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + radius + 6);
}
```

**Family color constants — add to `instrumentFamilies.ts`:**
```typescript
// Source: src/audio/instrumentFamilies.ts (extend this file)
// VIS-01: Visual family ring colors — distinct, perceptually separated palette
export const FAMILY_RING_COLOR: Record<string, string> = {
  rhythm:    '#f97316', // orange-500 — bass + drums (warm, grounding)
  brass:     '#fbbf24', // amber-400 — trumpet + trombone (bright metallic)
  woodwind:  '#34d399', // emerald-400 — saxophone (airy, cool)
  keyboard:  '#818cf8', // indigo-400 — keyboard + vibes (harmonic, cool)
  strings:   '#e879f9', // fuchsia-400 — guitar (plucked, distinct)
};
```

**CanvasRenderer integration — lookup per instrument:**
```typescript
// Source: CanvasRenderer.ts render loop — in the per-node draw block
import { INSTRUMENT_FAMILIES, FAMILY_RING_COLOR } from '../audio/instrumentFamilies';

// Inside per-node loop (after role/fillColor resolved):
const family = INSTRUMENT_FAMILIES[instrument] ?? 'rhythm';
const ringColor = FAMILY_RING_COLOR[family] ?? '#64748b';
drawNode(ctx, x, y, animState.currentRadius, fillColor, label, ringColor);
```

**Key constraints from existing code:**
- `drawNode` currently has NO `ctx.save()/restore()` for the fill path. The ring stroke must NOT change `lineWidth` permanently. Either add `ctx.save()/restore()` around the ring OR reset `lineWidth` after. Given the existing pattern avoids save/restore for the fill path (per the docstring), the simplest fix is: save before ring, restore after ring — keeping the fill path untouched.
- Phase 12 confidence indicator sets `ctx.globalAlpha = 0.5` BEFORE calling `drawNode`. The ring inherits this alpha, which is correct behavior — a dimmed node should have a dimmed ring.

---

### Pattern 2: VIS-02 — Family-Sorted Circular Layout

**What:** `CanvasRenderer` currently puts bass at index 0 (center) and the remaining instruments on the ring in their original `lineup` order. To cluster families, sort the ring instruments by family before placing them.

**Layout conventions (must preserve):**
- Position 0 = canvas center = bass slot. Bass stays at center.
- Ring positions 1..n-1 are assigned in order of angle starting at 12 o'clock.
- `buildPairs` generates edge pair keys from `instrumentOrder` array indices.
- The `bass_drums` pocket line lookup is `instrumentOrder.indexOf('drums')` — drums must still be findable by name.

**Approach:** Sort ring instruments (all except bass at index 0) by a family sort key before calling `computeNodePositions`. Family groupings for visual clustering:

```typescript
// Source: CanvasRenderer.ts constructor
// VIS-02: Family sort order for ring position clustering
const FAMILY_SORT_ORDER: Record<string, number> = {
  rhythm:   0,  // drums (bass is always center, not on ring)
  keyboard: 1,  // keyboard, vibes
  strings:  2,  // guitar
  melodic:  2,  // (guitar alternative)
  woodwind: 3,  // saxophone
  brass:    4,  // trumpet, trombone
};

// In constructor, after bass is moved to index 0:
const ringInstruments = this.instrumentOrder.slice(1); // everything except bass at [0]
ringInstruments.sort((a, b) => {
  const fa = INSTRUMENT_FAMILIES[a] ?? 'rhythm';
  const fb = INSTRUMENT_FAMILIES[b] ?? 'rhythm';
  return (FAMILY_SORT_ORDER[fa] ?? 99) - (FAMILY_SORT_ORDER[fb] ?? 99);
});
this.instrumentOrder = ['bass', ...ringInstruments]; // bass stays at [0]
```

**Critical: pairs, edgeAnimStates, and nodeAnimStates are all built AFTER `instrumentOrder` is set.** The sort happens in the constructor at the point where `instrumentOrder` is first finalized — before `buildPairs`, `createNodeAnimState` loop, and edge state creation. The existing code already does this reordering for bass; the family sort is a second reorder of the remaining instruments.

**When bass is absent:** Same guard as existing code — if bass is not in lineup, `instrumentOrder` stays as-is (no center anchor), then sort ring instruments by family.

---

### Pattern 3: VIS-03 — Per-Edge Animation Style by Communication Type

**What:** `drawCommunicationEdges` already knows `EdgeType` for every pair via `EDGE_TYPE[key]`. Currently all `animated` edges (weight >= 0.7) use the same flowing-dash style. VIS-03 differentiates based on `EdgeType`:

| EdgeType | Animation | Description |
|----------|-----------|-------------|
| `rhythmic` | Beat pulse | opacity spikes on `lastDrumOnsetSec` change, decays lerpExp |
| `melodic` | Gradient flow | lineDash flowing + linear gradient strokeStyle along the edge |
| `support` | Opacity breathe | slow sine wave on opacity, period ~2s independent of BPM |

**Implementation approach for each:**

**Rhythmic (beat-pulse):**
Beat onset data is on `state.beat.lastDrumOnsetSec`. This is read in CanvasRenderer but not passed to `drawCommunicationEdges`. Options:
1. Pass `lastDrumOnsetSec` as a new parameter to `drawCommunicationEdges`.
2. Store a module-level `rhythmicPulse` scalar (driven by CanvasRenderer) and pass it as a parameter.

Option 2 (pass a scalar `beatPulseIntensity: number` = `this.beatPulse / 4` normalized to [0,1]) is cleanest — no new EdgeAnimState fields needed, uses the already-computed `this.beatPulse` from the global onset detection.

```typescript
// In drawCommunicationEdges — for rhythmic animated edges:
// opacity boost = animState.currentOpacity + beatPulseIntensity * 0.3
// lineWidth boost = lineWidth + beatPulseIntensity * 2
ctx.globalAlpha = Math.min(1.0, e.opacity + beatPulseIntensity * 0.3);
ctx.lineWidth = e.lineWidth + beatPulseIntensity * 2;
```

**Melodic (gradient flow):**
Instead of `ctx.strokeStyle = rgb(...)`, use `ctx.createLinearGradient(startX, startY, endX, endY)`. This is a per-frame allocation — but only for animated edges with weight >= 0.7, which is typically 1-3 edges. Given the strict NO-per-frame-allocation rule in the codebase, the planner needs to decide: pre-allocate a gradient object that gets reconfigured, or accept the small allocation for animated melodic edges only.

**Recommended approach:** Create the gradient inline but only when the edge is `animated` and `melodic`. At most ~3 melodic edges at weight >= 0.7 in any lineup. The `createLinearGradient` call creates a gradient object; its two `addColorStop` calls are the cost. This is significantly cheaper than offscreen canvas creation and consistent with how the existing `flashGlowCanvas` canvases are pre-allocated per-edge.

A cleaner zero-alloc alternative: pre-allocate a `gradientCanvas` offscreen per melodic edge (similar to `flashGlowCanvas`) with a horizontal gradient, then draw it rotated to align with the edge. This avoids per-frame `createLinearGradient` but adds significant complexity. **Recommend the inline gradient approach** since melodic animated edges are rare at any given moment.

```typescript
// Source pattern for melodic animated edges in drawCommunicationEdges:
ctx.save();
const grad = ctx.createLinearGradient(e.startX, e.startY, e.endX, e.endY);
grad.addColorStop(0,   `rgba(${e.colorR},${e.colorG},${e.colorB},0)`);
grad.addColorStop(0.3 + (e.dashOffset / 20) % 0.4, `rgba(${e.colorR},${e.colorG},${e.colorB},${e.opacity})`);
grad.addColorStop(1,   `rgba(${e.colorR},${e.colorG},${e.colorB},0)`);
ctx.strokeStyle = grad;
ctx.lineWidth = e.lineWidth;
ctx.setLineDash([12, 8]);
ctx.lineDashOffset = -e.dashOffset;
ctx.beginPath();
ctx.moveTo(e.startX, e.startY);
ctx.lineTo(e.endX, e.endY);
ctx.stroke();
ctx.restore();
```

**Support (opacity breathe):**
Add a `supportBreathePhase` field to `EdgeAnimState` (scalar, cheap). Advance it per-frame in `drawCommunicationEdges`. Map `sin(phase)` to opacity range `[0.5, 0.9]`.

```typescript
// New field in EdgeAnimState (VIS-03):
supportBreathePhase: number;  // initialized to 0

// In drawCommunicationEdges render loop for support animated edges:
animState.supportBreathePhase = (animState.supportBreathePhase + deltaMs * 0.0025) % (Math.PI * 2);
const breatheOpacity = 0.5 + ((Math.sin(animState.supportBreathePhase) + 1) / 2) * 0.4;
ctx.globalAlpha = breatheOpacity;
ctx.strokeStyle = `rgb(${e.colorR},${e.colorG},${e.colorB})`;
```

---

### Anti-Patterns to Avoid

- **Animating the ring color:** The family ring color is FIXED (identity, not state). Don't lerp or change it frame-to-frame. The fill color (role) already animates — the ring must be a stable visual anchor.
- **Calling `ctx.save()/restore()` per non-animated edge for the ring:** All non-animated edges are batched in a single pass (CANV-03). Adding per-edge save/restore breaks this optimization. The ring is drawn in the **node** pass, not the edge pass.
- **Reordering `instrumentOrder` after `buildPairs`:** The pair keys are strings like `'bass_drums'` — they don't depend on array indices. But `nodeAnimStates` and node positions ARE index-dependent. The family sort MUST happen before `computeNodePositions`, `createNodeAnimState` loop, and `buildPairs` — all of which happen after `instrumentOrder` is set in the existing constructor.
- **Changing `INSTRUMENT_FAMILIES` values:** Phase 12 disambiguators read this map for spectral reasoning. Adding new constants like `FAMILY_RING_COLOR` is safe; modifying existing family strings would break Phase 12.
- **Using `OffscreenCanvas` for gradient pre-rendering:** The codebase explicitly uses `document.createElement('canvas')` (not `OffscreenCanvas`) for iOS 16 compatibility. Don't use OffscreenCanvas anywhere.
- **shadowBlur for the ring glow:** The codebase has a strict `NO shadowBlur` rule (CanvasRenderer.ts header comment). Family rings must use plain strokes, not shadow blur.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Family assignment | Custom lookup table | `INSTRUMENT_FAMILIES` in `instrumentFamilies.ts` | Already covers all 8 instruments, used by Phase 12 |
| Edge type per pair | Custom pair classifier | `EDGE_TYPE[key]` in `edgeTypes.ts` | Already covers all 28 pairs for 8-instrument lineup |
| Beat timing for rhythmic pulse | New beat tracker | `state.beat.lastDrumOnsetSec` + existing `this.beatPulse` scalar | CanvasRenderer already computes a global beat pulse every frame |
| Lerp / easing utilities | New animation math | `lerpExp` / `lerp` from `NodeAnimState.ts` | Frame-rate-independent lerp already in use everywhere |
| Offscreen glow canvas | New glow system | `createGlowLayer` from `offscreen/glowLayer.ts` | If any family ring needs glow, use this pattern |

**Key insight:** All data needed for Phase 13 is already computed in the render pipeline. The phase is purely about wiring existing data into new visual outputs — not about adding data processing.

---

## Common Pitfalls

### Pitfall 1: Ring stroke affects ctx state outside drawNode

**What goes wrong:** `drawNode` currently skips `ctx.save()/restore()` for the fill path (documented intentionally). Adding `ctx.lineWidth = 3` for the ring without save/restore will bleed into the next draw call.

**Why it happens:** The fill path leaves `fillStyle` changed — callers accept this. But `lineWidth` is different: it's shared state that will affect the next `ctx.stroke()` call, which may be an edge.

**How to avoid:** Wrap the ring stroke block in `ctx.save()/ctx.restore()`:
```typescript
if (ringColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
```

**Warning signs:** Edges appear with unexpected thickness (3px or whatever the ring lineWidth is) after nodes are drawn.

---

### Pitfall 2: Family sort breaks pair-key lookup after reorder

**What goes wrong:** Edge animation states are keyed by pair strings like `'bass_drums'`. These keys are built from instrument names (alphabetical canonical order), NOT from array indices. Reordering `instrumentOrder` does not break edge key lookup. BUT: `nodeAnimStates[i]` IS index-bound — index i in `nodeAnimStates` corresponds to index i in `instrumentOrder`. If the family sort changes which index an instrument occupies, `nodeAnimStates` must be created AFTER the sort.

**Why it happens:** The constructor creates `nodeAnimStates` in a single loop `instrumentOrder.map(() => createNodeAnimState(...))`. If sort happens before this loop, everything is correct. If sort happens after, indices are mismatched.

**How to avoid:** Family sort must be the FIRST thing that modifies `instrumentOrder` in the constructor, before any data structures keyed by instrument index are created.

**Warning signs:** Bass animation (breathing glow) appears on the wrong node, or drums ripples trigger on a non-drum node.

---

### Pitfall 3: Gradient allocation per animated melodic edge causes jank

**What goes wrong:** `ctx.createLinearGradient()` allocates a new object every frame for every animated melodic edge. At 60fps with 2 melodic edges, this is 120 allocations/second. Most JS engines handle this fine, but on low-end iOS it can cause occasional GC pauses visible as frame drops.

**Why it happens:** The codebase pre-allocates everything (the entire `edgeRenderBuf` module-level buffer exists for this reason). Inline gradient creation breaks that discipline.

**How to avoid:** Limit melodic gradient animation to edges in `animated` state (weight >= 0.7). These are typically 0-2 edges at any time. Accept the allocation for now with a comment noting the constraint. If performance problems appear on iOS, pre-bake gradient into a per-edge offscreen canvas.

**Warning signs:** Frame rate drops on iOS when multiple melodic edges are simultaneously in `animated` state.

---

### Pitfall 4: `supportBreathePhase` missing from EdgeAnimState init

**What goes wrong:** New field added to `EdgeAnimState` interface but factory function `createEdgeAnimState()` not updated. TypeScript will catch this at compile time, but only if `supportBreathePhase` is non-optional in the interface.

**How to avoid:** Make the field required (not optional) in `EdgeAnimState` interface, add it to `createEdgeAnimState()` factory with initial value `0`. TypeScript will enforce it.

---

### Pitfall 5: Family color ring obscures the role fill color

**What goes wrong:** A 3px ring at the exact node radius covers part of the visual circle. At small radii (silent nodes: 18px), a 3px ring represents ~17% of the visual diameter — noticeable.

**How to avoid:** Stroke the ring centered at `radius + 1.5` (the stroke extends ±1.5px from center, so drawing at `radius + 1.5` places the outer edge of the ring at `radius + 3` — fully outside the fill). Use `ctx.arc(x, y, radius + 1.5, ...)` for the ring path.

**Warning signs:** The fill circle appears smaller than it did before Phase 13 (because the ring is covering the fill edge).

---

### Pitfall 6: VIS-02 layout doesn't cluster adjacent instruments visually on the elliptical canvas

**What goes wrong:** `computeNodePositions` places ring instruments at equal angular spacing. With 7 instruments and 6 on the ring, adjacent positions are 60° apart. Instruments from the same family will be adjacent in the angle sequence if sorted correctly, but the 2:1 aspect ratio canvas means the visual spacing is NOT equal — horizontal positions are much farther apart than vertical ones.

**Why it happens:** `rx=0.34, ry=0.17` creates an ellipse. Adjacent instruments at top/bottom of the ellipse appear closer visually than adjacent instruments at left/right.

**How to avoid:** This is an inherent property of the elliptical layout — it's by design and already understood by the existing code. The visual clustering is "good enough" for the goal (same-family instruments are adjacent in the arc), even if exact visual spacing varies. No fix needed, just be aware.

---

## Code Examples

### VIS-01: Adding a ring stroke to drawNode

```typescript
// Source: src/canvas/nodes/drawNode.ts — modified drawNode function
export function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fillColor: string,
  label: string,
  ringColor?: string,  // VIS-01: optional family color ring
): void {
  // -- Filled circle ---------------------------------------------------------
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // -- VIS-01: Family ring stroke (outside fill, save/restore for lineWidth isolation)
  if (ringColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);  // +1.5 so ring is outside fill
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // -- Label below circle ----------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + radius + 6);
}
```

### VIS-02: Family sort in CanvasRenderer constructor

```typescript
// Source: src/canvas/CanvasRenderer.ts constructor — after bass reorder
// Family sort order: rhythm (drums) first, then keyboard family, strings, woodwind, brass
import { INSTRUMENT_FAMILIES } from '../audio/instrumentFamilies';

const FAMILY_SORT_ORDER: Record<string, number> = {
  rhythm:   0,
  keyboard: 1,
  strings:  2,
  woodwind: 3,
  brass:    4,
};

// Reorder: bass to index 0, then family-sort remaining instruments
const bassIdx = lineup.indexOf('bass');
const withoutBass = lineup.filter(i => i !== 'bass');
withoutBass.sort((a, b) => {
  const fa = INSTRUMENT_FAMILIES[a] ?? 'rhythm';
  const fb = INSTRUMENT_FAMILIES[b] ?? 'rhythm';
  return (FAMILY_SORT_ORDER[fa] ?? 99) - (FAMILY_SORT_ORDER[fb] ?? 99);
});
this.instrumentOrder = bassIdx >= 0 ? ['bass', ...withoutBass] : withoutBass;

// All subsequent data structure creation now uses the family-sorted instrumentOrder
this.nodePositions = computeNodePositions(...);
this.nodeAnimStates = this.instrumentOrder.map(...);
this.pairs = buildPairs(this.instrumentOrder);
```

### VIS-03: Beat pulse on rhythmic edges (pass beatPulseIntensity)

```typescript
// Source: src/canvas/edges/drawCommunicationEdges.ts — new parameter
export function drawCommunicationEdges(
  ctx: CanvasRenderingContext2D,
  // ... existing params ...
  beatPulseIntensity: number,  // VIS-03: [0,1] normalized beat pulse from CanvasRenderer.beatPulse / 4
): void { ... }

// In animated-edge draw pass for rhythmic type:
if (edgeType === 'rhythmic') {
  ctx.globalAlpha = Math.min(1.0, e.opacity + beatPulseIntensity * 0.3);
  ctx.lineWidth = e.lineWidth + beatPulseIntensity * 2;
}

// In CanvasRenderer.ts, call site:
drawCommunicationEdges(
  ctx, nodePositions, nodeRadii, pairs, edgeAnimStates, edgeWeights,
  w, h, currentTension, deltaMs, this.instrumentOrder.length,
  this.beatPulse / 4,  // VIS-03: normalize to [0,1] for edge intensity
);
```

### VIS-03: Support edge opacity breathe

```typescript
// In EdgeAnimState.ts — add new field:
export interface EdgeAnimState {
  // ... existing fields ...
  supportBreathePhase: number;  // VIS-03: phase for support edge opacity breathing
}

// In createEdgeAnimState factory:
export function createEdgeAnimState(): EdgeAnimState {
  return {
    // ... existing fields ...
    supportBreathePhase: 0,  // VIS-03
  };
}

// In drawCommunicationEdges animated pass for support type:
if (edgeType === 'support') {
  animState.supportBreathePhase = (animState.supportBreathePhase + deltaMs * 0.0025) % (Math.PI * 2);
  const breatheOpacity = 0.5 + ((Math.sin(animState.supportBreathePhase) + 1) / 2) * 0.4;
  ctx.save();
  ctx.globalAlpha = breatheOpacity;
  ctx.strokeStyle = `rgb(${e.colorR},${e.colorG},${e.colorB})`;
  ctx.lineWidth = e.lineWidth;
  ctx.setLineDash([12, 8]);
  ctx.lineDashOffset = -e.dashOffset;
  ctx.beginPath();
  ctx.moveTo(e.startX, e.startY);
  ctx.lineTo(e.endX, e.endY);
  ctx.stroke();
  ctx.restore();
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shadowBlur` for glow effects | Offscreen canvas + `drawImage` | Phase 5 (this project) | No regression — continue using offscreen canvas pattern |
| `OffscreenCanvas` | `document.createElement('canvas')` | Phase 5 (iOS 16 compat decision) | Any new offscreen canvas must use `document.createElement` not `OffscreenCanvas` |
| Inline gradient per-frame for edges | Current: plain `rgb()` strokeStyle | Phase 6 (this project) | Melodic gradient (VIS-03) is a new inline allocation — acceptable at low frequency |

**No deprecated APIs involved.** All Canvas 2D APIs used here (arc, stroke, createLinearGradient, lineDashOffset) are stable and well-supported on all target platforms.

---

## Open Questions

1. **Guitar family classification for VIS-02 clustering**
   - What we know: `INSTRUMENT_FAMILIES` maps `guitar` to `'strings'` (for sonic disambiguation). For visual clustering, guitar semantically belongs with keyboard as a harmonic/chordal instrument in the jazz context.
   - What's unclear: Should VIS-02 use the existing `INSTRUMENT_FAMILIES` values (separating guitar from keyboard), or use a visual-specific override that groups guitar with keyboard?
   - Recommendation: Keep existing `INSTRUMENT_FAMILIES` unchanged (Phase 12 depends on it). Create a separate `VISUAL_FAMILY_SORT_ORDER` constant in Phase 13 that places `strings` adjacent to `keyboard` in the sort order (sort value 1.5 or both at 1). This clusters guitar near keyboard without breaking Phase 12.

2. **VIS-03: What happens when bass_drums pocket line (rhythmic) should also pulse?**
   - What we know: `drawPocketLine.ts` handles bass_drums separately from `drawCommunicationEdges.ts`. VIS-03 spec says "rhythmic edges pulse with the beat" — the pocket line is already the primary rhythmic edge.
   - What's unclear: Does VIS-03 apply to the pocket line, or only to the communication edges in `drawCommunicationEdges`?
   - Recommendation: The pocket line already has multiple visual animations (flowing dashes, wobble, sync flash). Applying VIS-03 beat-pulse to it may be redundant. Planner should scope VIS-03 to `drawCommunicationEdges` only, leaving `drawPocketLine` unchanged.

3. **VIS-01: Role legend update**
   - What we know: `drawRoleLegend` shows filled circles for role colors. After Phase 13, nodes have BOTH a fill (role) and a ring (family). The legend doesn't explain the ring.
   - What's unclear: Should the legend be extended to explain family rings? The spec (VIS-01, VIS-02, VIS-03) doesn't mention the legend.
   - Recommendation: Out of scope for Phase 13 per requirements. Planner should explicitly mark legend update as deferred.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/canvas/CanvasRenderer.ts` — confirmed existing draw loop structure, beatPulse scalar, instrument ordering
- Direct code inspection: `src/canvas/nodes/drawNode.ts` — confirmed current signature, no ring stroke, no save/restore
- Direct code inspection: `src/canvas/nodes/NodeLayout.ts` — confirmed `computeNodePositions` takes only count, sorting happens at caller level
- Direct code inspection: `src/canvas/edges/drawCommunicationEdges.ts` — confirmed CANV-03 batching, EdgeType lookup, animated-edge isolation pattern
- Direct code inspection: `src/canvas/edges/edgeTypes.ts` — confirmed `EDGE_TYPE` covers all 28 pairs, `EdgeType` = rhythmic/melodic/support
- Direct code inspection: `src/canvas/edges/EdgeAnimState.ts` — confirmed scalar field pattern, no existing per-type animation fields
- Direct code inspection: `src/audio/instrumentFamilies.ts` — confirmed `INSTRUMENT_FAMILIES` maps all 8 instruments, guitar = 'strings'
- Direct code inspection: `src/canvas/offscreen/glowLayer.ts` — confirmed `document.createElement('canvas')` pattern for iOS compat
- MDN Web Docs (training knowledge, HIGH confidence for stable APIs): `ctx.arc`, `ctx.stroke`, `ctx.createLinearGradient`, `ctx.lineDashOffset` — all stable since HTML5 Canvas spec

### Secondary (MEDIUM confidence)
- Canvas 2D `createLinearGradient` allocation cost on iOS: Training knowledge + general JS GC behavior. Performance impact at 0-3 allocations/frame should be negligible on modern hardware. Not verified with specific iOS benchmarks.

### Tertiary (LOW confidence)
- None — all Phase 13 implementation decisions are grounded in direct code inspection of the existing codebase.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new libraries, everything is existing canvas APIs already in use
- Architecture: HIGH — all patterns verified directly from codebase; ring stroke, family sort, and edge animation are straightforward extensions of existing patterns
- Pitfalls: HIGH — derived from reading actual code constraints (CANV-03 batching, constructor ordering, no-shadowBlur rule, iOS compat)

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable HTML5 Canvas APIs, no external dependencies)
