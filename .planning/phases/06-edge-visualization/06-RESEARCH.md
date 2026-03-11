# Phase 6: Edge Visualization - Research

**Researched:** 2026-03-10
**Domain:** Canvas 2D API — animated line rendering, dash animation, compositing, color interpolation
**Confidence:** HIGH

## Summary

Phase 6 adds edge rendering to the existing Canvas 2D rAF loop in `CanvasRenderer.ts`. All animation is pure Canvas 2D — no new libraries. The edge layer sits between the background clear and node draws, rendered as stroked paths with state-driven line width, dash patterns, opacity, and color.

The technical domain is well-understood: `setLineDash` + `lineDashOffset` for flowing dashes, `quadraticCurveTo` with a perpendicular-normal control point for the pocket line wobble, and pre-parsed RGB constants + channel lerp for zero-alloc color transitions (the same pattern already used in `drawGlow.ts`). One data gap must be filled before rendering: `BeatState` has no `lastSyncEventSec` field — the renderer needs a confirmed-sync timestamp to trigger the EDGE-05 flash.

Three new files are needed: `src/canvas/edges/EdgeAnimState.ts` (per-edge mutable state), `src/canvas/edges/drawPocketLine.ts` (EDGE-01 through EDGE-06), and `src/canvas/edges/drawCommunicationEdges.ts` (EDGE-07 through EDGE-10). A supporting file `src/canvas/edges/edgeTypes.ts` provides the static edge-type classification table (rhythmic/melodic/support) and color constants.

**Primary recommendation:** Implement all edge rendering as standalone pure functions in `src/canvas/edges/` that accept `(ctx, x1, y1, x2, y2, animState, ...)` — matching the pattern established by `drawNode.ts` — then call them from `CanvasRenderer.render()` after the background clear and before node draws.

---

## Standard Stack

This phase uses zero new npm packages. All rendering uses the existing Canvas 2D API.

### Core (already in project)
| Tool | Version | Purpose | Role in Phase 6 |
|------|---------|---------|-----------------|
| Canvas 2D API | Browser native | All drawing | Line strokes, dashes, compositing |
| `lerpExp` (NodeAnimState.ts) | project local | Frame-rate-independent lerp | Smooth edge weight/opacity transitions |
| `createGlowLayer` (glowLayer.ts) | project local | Offscreen glow canvas | Flash pulse glow on pocket line (EDGE-05) |
| `drawGlow` (drawGlow.ts) | project local | Composite glow via 'lighter' | Reuse for sync flash |
| Pre-parsed RGB constants pattern | drawGlow.ts | Zero-alloc color lerp | Tension tinting without string parsing |

### No New Libraries

The Canvas 2D primitives cover all Phase 6 needs:
- `setLineDash` / `lineDashOffset` for flowing dashes (EDGE-02)
- `quadraticCurveTo` for wobble curve (EDGE-03)
- `strokeStyle = rgb(r,g,b)` with pre-parsed RGB lerp for tension tinting (EDGE-09)
- `globalAlpha` for fade-in/out below weight thresholds (EDGE-07)
- `globalCompositeOperation = 'lighter'` for sync flash (EDGE-05)

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── canvas/
│   ├── CanvasRenderer.ts           # existing — add edge draw calls here
│   ├── TensionMeter.ts             # existing
│   ├── nodes/                      # existing Phase 5 files
│   └── edges/                      # NEW — Phase 6 files
│       ├── EdgeAnimState.ts        # per-edge mutable animation state + factory
│       ├── edgeTypes.ts            # static edge classification + color constants
│       ├── drawPocketLine.ts       # EDGE-01 through EDGE-06
│       └── drawCommunicationEdges.ts  # EDGE-07 through EDGE-10
```

### Pattern 1: Per-Edge Animation State (mirrors NodeAnimState pattern)

**What:** Plain mutable object, no classes, updated in-place each frame via lerpExp. One instance per instrument pair (6 pairs total for a quartet).

**When to use:** All animated edge properties that must smooth over time — current weight, current opacity, current tint factor, flash intensity.

```typescript
// Source: mirrors NodeAnimState.ts pattern in this project
export interface EdgeAnimState {
  // Smoothed edge weight [0, 1] — lerpExp toward raw edgeWeights value each frame
  currentWeight: number;

  // Smoothed opacity [0, 1] — lerpExp toward target (0 if weight < 0.3)
  currentOpacity: number;

  // Tension tint factor [0, 1] — lerpExp toward (tension > 0.6 ? ... : 0)
  tintFactor: number;

  // Flash intensity [0, 1] — set to 1.0 on sync event, decays to 0 (EDGE-05)
  flashIntensity: number;

  // Flowing dash offset (pocket line only) — incremented by deltaMs * speed
  dashOffset: number;

  // Wobble phase (pocket line only) — incremented by deltaMs for sin wobble
  wobblePhase: number;

  // Last sync event seen — compared to BeatState.lastSyncEventSec each frame
  lastSeenSyncEventSec: number;
}

export function createEdgeAnimState(): EdgeAnimState {
  return {
    currentWeight: 0,
    currentOpacity: 0,
    tintFactor: 0,
    flashIntensity: 0,
    dashOffset: 0,
    wobblePhase: 0,
    lastSeenSyncEventSec: -1,
  };
}
```

**EdgeAnimState map:** Use a `Record<string, EdgeAnimState>` keyed by the same alphabetical pair key as `edgeWeights` (`'bass_drums'`, `'bass_guitar'`, etc.). Initialize one `createEdgeAnimState()` per pair alongside the existing edge weight map.

### Pattern 2: Static Edge Classification Table

**What:** A lookup table mapping each instrument pair to its edge type (rhythmic | melodic | support) and base color. Computed once at module load, never per frame.

```typescript
// Source: requirements EDGE-08 and project domain logic
export type EdgeType = 'rhythmic' | 'melodic' | 'support';

// Base colors (pre-parsed RGB for zero-alloc tension tinting)
export const EDGE_COLOR: Record<EdgeType, { r: number; g: number; b: number }> = {
  rhythmic: { r: 0x4a, g: 0xde, b: 0x80 }, // #4ade80 green-400
  melodic:  { r: 0xa8, g: 0x5e, b: 0xf8 }, // #a855f7 purple-400 (approx)
  support:  { r: 0x60, g: 0xa5, b: 0xfa }, // #60a5fa blue-400
};

// Tension tint target (amber/orange) — pre-parsed for lerp
export const TENSION_AMBER_RGB = { r: 0xf9, g: 0x73, b: 0x16 }; // #f97316
export const TENSION_RED_RGB   = { r: 0xef, g: 0x44, b: 0x44 }; // #ef4444

// Edge type per pair (alphabetical key order)
export const EDGE_TYPE: Record<string, EdgeType> = {
  bass_drums:    'rhythmic',
  guitar_keyboard: 'melodic',
  bass_guitar:   'support',
  bass_keyboard: 'support',
  drums_guitar:  'support',
  drums_keyboard:'support',
};
```

### Pattern 3: Flowing Dash Animation (EDGE-02)

**What:** Animate `lineDashOffset` as a scalar that increments each frame. Only update `lineDashOffset`, not `setLineDash` — the dash pattern stays fixed.

**Performance note (HIGH confidence, verified with MDN):** `setLineDash()` should be called once per draw call (inside `ctx.save()`/`ctx.restore()`), not stored globally. `lineDashOffset` is a scalar — updating it per frame has minimal overhead. Canvas 2D spec confirms `save()`/`restore()` snapshots both `setLineDash` list and `lineDashOffset`.

```typescript
// Source: MDN CanvasRenderingContext2D/lineDashOffset + MDN save()
// Called from drawPocketLine per frame
function drawFlowingDash(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  dashOffset: number, // from EdgeAnimState — incremented outside by deltaMs * speed
  lineWidth: number,
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.setLineDash([12, 8]);        // 12px dash, 8px gap — set once per draw
  ctx.lineDashOffset = -dashOffset; // negative = flows forward along path
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore(); // restores lineDash + lineDashOffset to pre-save state
}
```

**Dash offset increment:** `animState.dashOffset = (animState.dashOffset + deltaMs * DASH_SPEED) % (12 + 8)` where `DASH_SPEED ≈ 0.06` px/ms (≈ 3.6 px/frame at 60fps, completing pattern cycle in ~333ms).

### Pattern 4: Pocket Line Wobble (EDGE-03 — weight 0.4–0.7)

**What:** Quadratic bezier with control point displaced perpendicular to the line direction, oscillating via `sin(wobblePhase)`.

**Perpendicular normal formula (HIGH confidence — standard 2D math):**
```
dx = x2 - x1;  dy = y2 - y1
perp = (-dy, dx)  normalized = perp / length
control = midpoint + perp_normalized * wobble_amplitude * sin(wobblePhase)
```

```typescript
// Source: standard 2D vector math + MDN quadraticCurveTo
function drawWobbleLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  wobblePhase: number, // from EdgeAnimState — incremented by deltaMs * WOBBLE_SPEED
  lineWidth: number,
  color: string,
): void {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular normal (rotated 90 degrees)
  const nx = -dy / len;
  const ny =  dx / len;
  const amp = 8; // wobble amplitude in px
  const cpx = mx + nx * amp * Math.sin(wobblePhase);
  const cpy = my + ny * amp * Math.sin(wobblePhase);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cpx, cpy, x2, y2);
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}
```

**Wobble phase increment:** `animState.wobblePhase = (animState.wobblePhase + deltaMs * 0.003) % (Math.PI * 2)` — full cycle ~2.1 seconds.

### Pattern 5: Tension Tinting (EDGE-09) — Zero-Alloc RGB Lerp

**What:** Lerp base edge color toward tension amber/red using pre-parsed RGB constants. Same pattern as `pocketToGlowColor` in `drawGlow.ts`.

```typescript
// Source: drawGlow.ts pocketToGlowColor pattern in this project
function getTintedColor(
  baseColor: { r: number; g: number; b: number },
  tintFactor: number, // 0 = base, 1 = amber/red
  tension: number,
): string {
  // tension > 0.8 → lean toward red, tension 0.6-0.8 → amber
  const targetColor = tension > 0.8 ? TENSION_RED_RGB : TENSION_AMBER_RGB;
  const r = Math.round(lerp(baseColor.r, targetColor.r, tintFactor));
  const g = Math.round(lerp(baseColor.g, targetColor.g, tintFactor));
  const b = Math.round(lerp(baseColor.b, targetColor.b, tintFactor));
  return `rgb(${r},${g},${b})`;
}
```

**Tint factor drive:** `targetTintFactor = tension > 0.6 ? (tension - 0.6) / 0.4 : 0` — linearly mapped from 0.6→1.0 tension to 0→1 tint.

### Pattern 6: Sync Flash (EDGE-05) — Reuse drawGlow

**What:** When `BeatState.lastSyncEventSec` changes, set `animState.flashIntensity = 1.0`, then call `drawGlow` with a bright white/cyan glow canvas centered on the pocket line midpoint. Flash decays via `lerpExp` toward 0.

**Critical gap:** `BeatState` currently has no `lastSyncEventSec` field. This must be added to `src/audio/types.ts` and written by `PocketScorer.updatePocketScore()` whenever a valid sync pair is detected (score > 0 after passing staleness gate).

```typescript
// Addition required to BeatState in types.ts
lastSyncEventSec: number;   // audioCtx.currentTime of last confirmed sync pair, -1 if none
```

```typescript
// In drawPocketLine.ts — flash render
if (animState.flashIntensity > 0.01) {
  // midpoint of pocket line
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  drawGlow(ctx, animState.flashGlowCanvas, mx, my, animState.flashIntensity);
  animState.flashIntensity = lerpExp(animState.flashIntensity, 0, 0.08, deltaMs);
  // snap to 0 when sub-threshold
  if (animState.flashIntensity < 0.02) animState.flashIntensity = 0;
}
```

`animState.flashGlowCanvas` is a pre-created `createGlowLayer(30, '#ffffff')` — created once in `EdgeAnimState` factory, never per frame.

### Pattern 7: Floating Text Label (EDGE-06)

**What:** Draw text centered above the pocket line midpoint. No special library — `ctx.fillText`.

```typescript
// Source: existing drawNode.ts label pattern
const POCKET_LABELS: Record<string, string> = {
  deep:    'deep in the pocket',
  locked:  'locked in',
  loose:   'swinging loose',
  free:    'playing free',
};

function getPocketLabel(pocketScore: number): string {
  if (pocketScore > 0.7) return POCKET_LABELS.deep;
  if (pocketScore > 0.5) return POCKET_LABELS.locked;
  if (pocketScore > 0.3) return POCKET_LABELS.loose;
  return POCKET_LABELS.free;
}
```

Draw above midpoint: `ctx.fillText(label, mx, my - 14)`.

### Pattern 8: Weight-to-Visual Mapping (EDGE-07)

**What:** Map raw edge weight [0,1] to line width, opacity, and dash state. All thresholds from requirements.

```typescript
// Source: requirements EDGE-07
type EdgeVisualState = 'hidden' | 'static_thin' | 'subtle' | 'animated';

function getEdgeVisualState(weight: number): EdgeVisualState {
  if (weight < 0.3) return 'hidden';
  if (weight < 0.4) return 'static_thin';  // thin static
  if (weight < 0.7) return 'subtle';       // medium subtle
  return 'animated';                        // thick animated
}

const EDGE_LINE_WIDTH: Record<EdgeVisualState, number> = {
  hidden: 0,
  static_thin: 1.5,
  subtle: 3,
  animated: 5,
};

const EDGE_TARGET_OPACITY: Record<EdgeVisualState, number> = {
  hidden: 0,
  static_thin: 0.4,
  subtle: 0.65,
  animated: 0.9,
};
```

### Pattern 9: CanvasRenderer Integration

Edges are drawn **after the background clear, before nodes**, so nodes render on top. Add to `CanvasRenderer.render()`:

```typescript
// After background fill, before the node loop
// (edges render behind nodes)
if (analysis) {
  drawPocketLine(ctx, bassPos, drumsPos, animState.pocketEdge, beat, tension, deltaMs);
  drawCommunicationEdges(ctx, this.nodePositions, this.edgeAnimStates, analysis, tension, deltaMs);
}
```

### Anti-Patterns to Avoid

- **Creating new objects inside render():** No `new CanvasGradient`, no color string building via template literals with per-channel Math.round — pre-parse RGB and use `getTintedColor()`.
- **Calling `setLineDash()` conditionally mid-path:** Always `setLineDash([])` to clear, or wrap in `ctx.save()`/`ctx.restore()`. The iOS Safari bug (lineDash state not resetting) is neutralized by save/restore — spec-confirmed behavior.
- **Using `shadowBlur`:** Already banned project-wide. Use `drawGlow` + `createGlowLayer` for all glow effects.
- **Updating `flashGlowCanvas` per frame:** Create it once in `createEdgeAnimState()`, reuse forever.
- **Per-frame `createLinearGradient` for gradient-colored edges:** Use RGB channel lerp instead — `createLinearGradient` objects should not be created per frame.
- **Opacity fade via `globalAlpha` + solid color on every edge:** Gate with `currentOpacity < 0.01` early return to skip stroke entirely for hidden edges.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frame-rate-independent lerp | Custom decay function | `lerpExp` from `NodeAnimState.ts` | Already verified, delta-time correct |
| Glow/flash compositing | shadowBlur | `drawGlow` + `createGlowLayer` from existing project | iOS-safe, already proven |
| Color interpolation | CSS color-mix or new library | Pre-parsed RGB + `lerp` channels | Zero alloc, already the project pattern |
| Animated dashes | Custom subdivision/manual dash | `setLineDash` + `lineDashOffset` | Native browser API, GPU-composited |

**Key insight:** All the utilities needed for edge rendering already exist in this codebase. The task is applying them to lines rather than circles.

---

## Common Pitfalls

### Pitfall 1: lineDash State Leak Between Draw Calls

**What goes wrong:** Drawing flowing dashes on the pocket line, then forgetting to reset `setLineDash([])` before drawing communication edges. Communication edges appear dashed.

**Why it happens:** Canvas 2D state is global on the context. `lineDashOffset` and `setLineDash` persist between calls.

**How to avoid:** Wrap every `drawPocketLine` and `drawCommunicationEdges` call in `ctx.save()` / `ctx.restore()`. The spec explicitly states save/restore snapshots the dash list and dash offset — confirmed HIGH confidence.

**Warning signs:** All edges on screen show the same dash pattern as the pocket line.

### Pitfall 2: Per-Frame createLinearGradient for Tension Tinting

**What goes wrong:** Creating a `createLinearGradient` between the two node positions every frame to achieve the color shift, thinking it's like CSS. This allocates a gradient object every rAF tick.

**Why it happens:** Gradient-colored lines "feel" like they need a gradient object. But for a single color with tint, channel lerp is sufficient.

**How to avoid:** Use pre-parsed RGB constants and channel-wise `lerp()` — produces a single solid color per frame. Only create `createLinearGradient` objects in setup code (like `TensionMeter.buildGradient`), never in `render()`.

**Warning signs:** Memory climbing on iOS Safari, frame rate dropping below 40fps during tension changes.

### Pitfall 3: Missing `lastSyncEventSec` Field in BeatState

**What goes wrong:** The flash trigger for EDGE-05 reads `beat.lastSyncEventSec` but the field doesn't exist in `BeatState`. TypeScript will error at compile time (if typed) or produce `undefined` at runtime.

**Why it happens:** `PocketScorer.ts` computes sync pairs but never surfaces a "confirmed sync" timestamp — only updates the rolling average. The field must be explicitly added.

**How to avoid:** Add `lastSyncEventSec: number` to `BeatState` in `types.ts` (initialized to `-1`) and write it in `updatePocketScore()` whenever `score > 0` and the pair passes staleness.

**Warning signs:** `animState.lastSeenSyncEventSec` never changes from `-1`; EDGE-05 flash never fires.

### Pitfall 4: Edge Draw Order (Edges Behind Nodes)

**What goes wrong:** Drawing edges after nodes causes edge lines to overdraw node circles. Pocket line appears to cross over bass and drums nodes rather than terminating at their borders.

**Why it happens:** `CanvasRenderer.render()` currently ends with node draws. Adding edge draws after the node loop places them on top.

**How to avoid:** Insert edge draw calls immediately after the background clear, before the node loop.

**Warning signs:** Edge lines are visible crossing over the filled node circles.

### Pitfall 5: Pocket Line Always Visible with Opacity 0

**What goes wrong:** The pocket line is marked "always visible" (EDGE-01) but the opacity animation code drives it to 0 below weight 0.3.

**Why it happens:** Re-using the same opacity mapping as communication edges (which DO hide below 0.3) for the pocket line.

**How to avoid:** `drawPocketLine` must never read from the weight-based opacity table. It always draws with full line opacity; only the visual state (dash/wobble/static) changes.

**Warning signs:** Pocket line disappears during quiet sections with no bass/drums activity.

### Pitfall 6: Wobble Amplitude on Static State

**What goes wrong:** The wobble animation continues on the pocket line even when `pocketScore < 0.4`, making it look active when it should be "thin gray-blue static" (EDGE-04).

**Why it happens:** `wobblePhase` keeps incrementing regardless of pocket state.

**How to avoid:** In the `static` case (pocketScore < 0.4), draw a plain `moveTo/lineTo` stroke (not `quadraticCurveTo`). Stop incrementing `wobblePhase` in the static state, or always use quadratic with `amp = 0` when static.

**Warning signs:** Pocket line visually wobbles even during "playing free" state.

---

## Code Examples

### Edge Animation State Initialization in CanvasRenderer

```typescript
// Source: mirrors existing nodeAnimStates pattern in CanvasRenderer.ts
// Added to CanvasRenderer constructor
private edgeAnimStates: Record<string, EdgeAnimState> = {};

// In constructor, after nodeAnimStates are created:
const pairs = [
  ['bass', 'drums'], ['bass', 'guitar'], ['bass', 'keyboard'],
  ['drums', 'guitar'], ['drums', 'keyboard'], ['guitar', 'keyboard'],
];
for (const [a, b] of pairs) {
  const key = [a, b].sort().join('_');
  this.edgeAnimStates[key] = createEdgeAnimState();
}
```

### Pocket Line State Machine

```typescript
// Source: requirements EDGE-01..EDGE-06 — implemented in drawPocketLine.ts
// pocketScore thresholds drive visual state
function getPocketLineState(pocketScore: number): 'tight' | 'loose' | 'free' {
  if (pocketScore > 0.7) return 'tight';   // thick green flowing dash (EDGE-02)
  if (pocketScore > 0.4) return 'loose';   // medium yellow wobble (EDGE-03)
  return 'free';                            // thin gray-blue static (EDGE-04)
}

const POCKET_LINE_WIDTH = { tight: 4, loose: 2.5, free: 1.5 };
const POCKET_LINE_COLOR = { tight: '#4ade80', loose: '#fde68a', free: '#94a3b8' };
```

### Resolution Flash (EDGE-10)

```typescript
// Resolution flash: tension drops below 0.3 triggers brief blue-white flash on all edges
// Source: mirrors EDGE-05 pattern but driven by tension.currentTension cross-threshold

// Track last known tension for threshold crossing detection
if (this.prevTension > 0.3 && tension.currentTension <= 0.3) {
  // Tension resolved — flash all active edges blue-white
  for (const key of Object.keys(this.edgeAnimStates)) {
    const w = analysis.edgeWeights[key] ?? 0;
    if (w >= 0.3) { // only flash visible edges
      this.edgeAnimStates[key].resolutionFlashIntensity = 1.0;
    }
  }
}
this.prevTension = tension.currentTension;
```

The resolution flash uses a **cool blue-white** glow canvas: `createGlowLayer(30, '#bfdbfe')` (blue-200), distinct from the pocket sync flash `createGlowLayer(30, '#ffffff')` (white).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `shadowBlur` for glow | Offscreen canvas + `drawImage` with `'lighter'` composite | Project-wide from Phase 5 | No shadowBlur means zero GPU stall on iOS Safari |
| D3.js for graph edges | Pure Canvas 2D API | Phase 1 architecture decision | Direct pixel control, no layout engine overhead |
| `OffscreenCanvas` | `document.createElement('canvas')` | Phase 5 decision (iOS 16 compat) | HTMLCanvasElement fully supported on iOS 15+ |

**No deprecated APIs in use.** All Canvas 2D APIs used (`setLineDash`, `lineDashOffset`, `quadraticCurveTo`, `globalAlpha`, `globalCompositeOperation`) are stable and well-supported on iOS Safari 15+.

---

## Open Questions

1. **Pocket line endpoint termination — terminate at node edge or center?**
   - What we know: `NodePosition` gives fractional canvas coords (node center). Node radius varies by role (18–52px).
   - What's unclear: Should the pocket line terminate at the node circumference (cleaner) or center (simpler)?
   - Recommendation: Terminate at node edge by subtracting `currentRadius * direction_vector` from each endpoint. Requires reading `nodeAnimStates[bassIdx].currentRadius` and `nodeAnimStates[drumsIdx].currentRadius` in `drawPocketLine`.

2. **`EdgeAnimState.resolutionFlashIntensity` vs `flashIntensity` — one field or two?**
   - What we know: EDGE-05 (sync flash on pocket line) and EDGE-10 (resolution flash on all edges) are different events with different colors (white vs blue-white).
   - What's unclear: Whether a single `flashIntensity` field with a `flashColor` variant is cleaner, or two separate fields.
   - Recommendation: Two separate fields — `flashIntensity` (sync/white) and `resolutionFlashIntensity` (tension-resolve/blue-white) — avoids conditional color logic mid-draw.

3. **Is `confirmed sync event` exactly when `updatePocketScore` writes a score > 0?**
   - What we know: `PocketScorer.updatePocketScore` gates on staleness (500ms), pair gap (200ms), and pocket window (80ms). A score > 0 means the pair passed the 80ms window.
   - What's unclear: The requirement says "confirmed sync event" — unclear if a high score threshold (e.g. > 0.5) is intended vs any successful pair.
   - Recommendation: Trigger flash on any score > 0 (any pair within 80ms window). The score magnitude already drives the visual label, so the flash is an "any sync" event.

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs: `CanvasRenderingContext2D/setLineDash` — API parameters, performance note on not calling per frame
- MDN Web Docs: `CanvasRenderingContext2D/lineDashOffset` — scalar property, efficient to update per frame, verified save/restore snapshots it
- MDN Web Docs: `CanvasRenderingContext2D/save` — explicitly states "current dash list" and `lineDashOffset` are part of saved state
- MDN Web Docs: `CanvasRenderingContext2D/quadraticCurveTo` — control point API, wobble pattern verified
- MDN Web Docs: `CanvasRenderingContext2D/createLinearGradient` — gradient applies to strokeStyle; coordinates are canvas-global; do not create per frame
- Project source: `src/canvas/nodes/drawGlow.ts` — pre-parsed RGB pattern for zero-alloc color interpolation
- Project source: `src/canvas/nodes/NodeAnimState.ts` — lerpExp, EdgeAnimState interface design basis
- Project source: `src/canvas/offscreen/glowLayer.ts` — createGlowLayer API for flash glow canvases
- Project source: `src/audio/types.ts` — BeatState, AnalysisState, edgeWeights confirmed structure
- Project source: `src/audio/PocketScorer.ts` — confirmed sync event logic; `lastSyncEventSec` field absent
- Project source: `src/audio/CrossCorrelationTracker.ts` — edge weight key format `'instrA_instrB'` (alphabetical)

### Secondary (MEDIUM confidence)
- Standard 2D vector math: perpendicular normal `(-dy, dx)` from direction vector — widely documented, confirmed by multiple math references

### Tertiary (LOW confidence)
- WebSearch: iOS Safari `setLineDash` reset bug (older reports, iPad2 era) — neutralized by `ctx.save()`/`ctx.restore()`, which spec-guarantees dash state restoration per MDN. Not a current concern for iOS 15+.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all Canvas 2D APIs verified via MDN; existing project patterns confirmed by source reading
- Architecture: HIGH — mirrors established project patterns (NodeAnimState, drawGlow, drawNode); file structure follows existing convention
- Pitfalls: HIGH for lineDash/save-restore (MDN-verified), HIGH for missing BeatState field (confirmed by source inspection); MEDIUM for perf details (no benchmark data for iOS 15+/16 specific Canvas 2D performance)

**Research date:** 2026-03-10
**Valid until:** 2026-09-10 (Canvas 2D API is stable; valid for 6 months)
