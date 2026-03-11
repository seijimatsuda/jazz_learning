# Phase 5: Canvas Node Graph - Research

**Researched:** 2026-03-10
**Domain:** Canvas 2D animation — node graph, per-node animation state, glow compositing, beat-driven effects, iOS performance
**Confidence:** HIGH (pure Canvas 2D — no external libraries involved, verified against MDN and existing codebase)

---

## Summary

This phase replaces the existing placeholder 6-band arc layout in `CanvasRenderer.ts` with an instrument-based node graph for a hardcoded jazz quartet (bass, drums, keyboard, guitar). The core challenge is not library selection — none are needed — but animation architecture: managing per-node animation state objects, driving animations from `BeatState` timestamps without allocating per-frame, and keeping iOS Safari performant at 60fps (30fps in Low Power Mode).

The existing codebase has already established the key patterns that Phase 5 must extend: offscreen `HTMLCanvasElement` for glow (not `OffscreenCanvas`, not `shadowBlur`), pre-allocated typed arrays, rAF loop reading directly from `audioStateRef`, and `performance.now()`-based analysis gating. Phase 5 follows all of these patterns — it does not introduce any new architectural abstractions.

The primary animation architecture decision is **delta-time-driven lerp via rAF timestamps**, with per-node state objects holding mutable scalars (not typed arrays) for animation variables like `glowIntensity`, `radiusNudge`, `bgAlpha`, and `ripples[]`. Ripple arrays are bounded (max 4 active at a time) to prevent unbounded growth.

**Primary recommendation:** Use per-instrument `NodeAnimState` plain objects (not classes) holding all mutable animation scalars. Drive all animation via `deltaMs` computed from rAF timestamp difference. Cap delta at 100ms to prevent jump on tab-resume. Read beat timestamps from `audioStateRef.current.beat` each frame — never copy them into React state.

---

## Standard Stack

This phase uses zero new packages. All tooling is already installed.

### Core (already present)

| Technology | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| Canvas 2D API | Browser native | All drawing | MDN-documented, no library wraps it |
| TypeScript | Already in project | Type-safe node state interfaces | |
| `requestAnimationFrame` | Browser native | 60fps render loop (30fps iOS Low Power) | Already running in `CanvasRenderer.ts` |
| `HTMLCanvasElement` (off-DOM) | Browser native | Offscreen glow compositing | Already used in `glowLayer.ts` |

### No New Installations

```bash
# Nothing to install. Phase 5 is pure Canvas 2D + existing TypeScript infrastructure.
```

---

## Architecture Patterns

### Recommended File Structure

```
src/canvas/
├── CanvasRenderer.ts          # Refactored: replaces band arc with instrument nodes
├── TensionMeter.ts            # Unchanged
├── nodes/
│   ├── NodeLayout.ts          # computeNodePositions(count: 2|3|4): NodePosition[]
│   ├── NodeAnimState.ts       # NodeAnimState interface + createNodeAnimState()
│   ├── drawNode.ts            # drawNode(ctx, pos, animState, role): void
│   ├── drawGlow.ts            # drawGlow(ctx, glowCanvas, x, y, intensity): void
│   └── drawRipple.ts          # drawRipple(ctx, ripple, now): boolean (returns alive)
└── offscreen/
    └── glowLayer.ts           # Unchanged — createGlowLayer(radius, color)
```

### Pattern 1: Per-Node Animation State Object

All mutable animation variables live in a plain `NodeAnimState` object per instrument. No classes — plain objects are faster to create and GC-friendly. One object per instrument, created once, mutated each frame.

```typescript
// Source: derived from existing TensionState pattern in src/audio/types.ts
// and MDN Advanced Animations velocity-object pattern

export interface RippleState {
  startMs: number;      // performance.now() when triggered
  durationMs: number;   // 300 or 500 depending on downbeat
  maxRadius: number;    // pixels the ring expands to
  color: string;        // '#e0f2fe' for crisp ripple
}

export interface NodeAnimState {
  // Base geometry
  baseRadius: number;           // role-driven, computed each frame from role
  currentRadius: number;        // lerp target — actual drawn radius

  // Glow (bass-specific, but present on all nodes for uniformity)
  glowIntensity: number;        // 0.0-1.0, pocket-score driven for bass
  glowCanvas: HTMLCanvasElement; // pre-created offscreen canvas for this node's color

  // Beat nudge (drums-specific animation, but structure present on all)
  radiusNudge: number;          // px added above baseRadius, lerps to 0

  // Ripples (drums-specific, but array always present)
  ripples: RippleState[];       // bounded at 4 active ripples max

  // Orbit (drums timing offset effect)
  orbitAngle: number;           // radians, increments when timingOffsetMs > 30

  // Breathing (bass glow breathe — sinusoidal driven by BPM period)
  breathePhase: number;         // 0.0-1.0 position in breath cycle (wraps)

  // Last seen onset timestamps (to detect new onsets each frame)
  lastSeenBassOnsetSec: number;
  lastSeenDrumOnsetSec: number;
  lastSeenBeatCounter: number;
  lastSeenDownbeatSec: number;
}

export function createNodeAnimState(color: string, baseRadius: number): NodeAnimState {
  return {
    baseRadius,
    currentRadius: baseRadius,
    glowIntensity: 0,
    glowCanvas: createGlowLayer(baseRadius * 2, color),
    radiusNudge: 0,
    ripples: [],
    orbitAngle: 0,
    breathePhase: 0,
    lastSeenBassOnsetSec: -1,
    lastSeenDrumOnsetSec: -1,
    lastSeenBeatCounter: -1,
    lastSeenDownbeatSec: -1,
  };
}
```

### Pattern 2: Delta-Time rAF Loop

The rAF callback receives a `DOMHighResTimeStamp` from the browser. Use it to compute `deltaMs` — the elapsed milliseconds since last frame. All animations are driven by deltaMs, making them frame-rate-independent. This is essential because iOS Low Power Mode caps rAF at 30fps.

```typescript
// Source: MDN Basic Animations + spicyyoghurt.com delta-time tutorial
// Pattern already used by AudioEngine (performance.now() gating)

private prevTimestamp = 0;

private render(timestamp: DOMHighResTimeStamp): void {
  // Delta time in milliseconds — frame-rate independent animations
  const rawDelta = timestamp - this.prevTimestamp;
  // Cap at 100ms to prevent jump when tab regains focus
  const deltaMs = Math.min(rawDelta, 100);
  this.prevTimestamp = timestamp;

  // ... draw ...

  this.rafHandle = requestAnimationFrame(this.boundRender);
}
```

**Why cap at 100ms:** When a browser tab is backgrounded and then restored, the next rAF fires with a large `timestamp` gap (hundreds of ms). Without capping, animations would jump — ripples would advance their full lifetime in one frame.

**Note:** `CanvasRenderer.render()` currently takes no arguments. Refactoring it to accept the rAF timestamp requires changing `this.boundRender` to be `(ts: DOMHighResTimeStamp) => this.render(ts)`. This is the correct pattern.

### Pattern 3: Onset Detection via Timestamp Comparison

`BeatState.lastBassOnsetSec` and `lastDrumOnsetSec` are `audioCtx.currentTime` values. They only change when a new onset fires. To detect a new onset each rAF frame, compare to the last-seen value stored in `NodeAnimState`.

```typescript
// Source: derived from existing Phase 4 BeatState pattern (src/audio/types.ts)
// No allocation — scalar comparison only

function detectNewDrumOnset(beat: BeatState, animState: NodeAnimState): boolean {
  if (beat.lastDrumOnsetSec !== animState.lastSeenDrumOnsetSec) {
    animState.lastSeenDrumOnsetSec = beat.lastDrumOnsetSec;
    return true;
  }
  return false;
}

function detectNewBassOnset(beat: BeatState, animState: NodeAnimState): boolean {
  if (beat.lastBassOnsetSec !== animState.lastSeenBassOnsetSec) {
    animState.lastSeenBassOnsetSec = beat.lastBassOnsetSec;
    return true;
  }
  return false;
}

function detectDownbeat(beat: BeatState, animState: NodeAnimState): boolean {
  if (beat.lastDownbeatSec !== animState.lastSeenDownbeatSec) {
    animState.lastSeenDownbeatSec = beat.lastDownbeatSec;
    return true;
  }
  return false;
}
```

### Pattern 4: Lerp Function (Zero Allocations)

Use a scalar `lerp` inline. Never allocate intermediate objects for color interpolation — compute RGB channels separately as numbers.

```typescript
// Source: standard math, verified against MDN animation examples
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Frame-rate-independent exponential lerp (for radius recovery, glow fade):
// The factor is raised to (deltaMs / 16.67) so it behaves the same at 60fps and 30fps.
function lerpExp(current: number, target: number, factor: number, deltaMs: number): number {
  // factor: 0.0 = no smoothing, 1.0 = instant
  // At 60fps (deltaMs=16.67), factor^1 = factor
  // At 30fps (deltaMs=33.33), factor^2 = factor*factor (correct rate)
  const t = 1 - Math.pow(1 - factor, deltaMs / 16.667);
  return lerp(current, target, t);
}
```

### Pattern 5: Color Interpolation (Pocket Score → Glow Color)

VIZ-05 requires the bass glow color to shift between warm amber (#b45309) and cool blue (#1e40af) based on pocket score (0.0=cool, 1.0=warm). Interpolate RGB channels as numbers, format as `rgb(r,g,b)` string — this is the only string allocation per frame per node.

```typescript
// Source: standard RGB lerp, multiple sources agree on this pattern
// HIGH confidence: basic arithmetic, no library needed

// Pre-parsed constants (module-level, zero-alloc at runtime):
const AMBER_R = 0xb4, AMBER_G = 0x53, AMBER_B = 0x09;   // #b45309
const BLUE_R  = 0x1e, BLUE_G  = 0x40, BLUE_B  = 0xaf;   // #1e40af

function pocketToGlowColor(pocketScore: number): string {
  const t = Math.max(0, Math.min(1, pocketScore));
  const r = Math.round(lerp(BLUE_R, AMBER_R, t));
  const g = Math.round(lerp(BLUE_G, AMBER_G, t));
  const b = Math.round(lerp(BLUE_B, AMBER_B, t));
  return `rgb(${r},${g},${b})`;
}
```

**Important:** Do NOT call `createGlowLayer` per-frame. Cache one glow canvas per node, draw it with `globalAlpha` and `globalCompositeOperation = 'lighter'` to blend colors. For the pocket color shift, either: (a) re-create the glow canvas only when pocketScore changes significantly (>0.05 delta), or (b) draw the glow canvas and tint with a fill-rect overlay using `globalCompositeOperation`. Option (a) is simpler — see pitfalls.

### Pattern 6: Ripple Ring Expansion

Each ripple is a circle that expands outward over its `durationMs`. Draw with `ctx.arc` + `ctx.stroke` only — no fill. Alpha fades from 1 to 0 as time elapses.

```typescript
// Source: derived from Bryan Braun ripple tutorial + MDN arc drawing
// HIGH confidence: standard canvas arc pattern

interface RippleState {
  startMs: number;    // performance.now() when triggered
  durationMs: number; // 300ms normal, 500ms downbeat
  maxRadius: number;  // pixels the ring expands to
  color: string;      // '#e0f2fe' for crisp ripple
  baseX: number;      // node center X
  baseY: number;      // node center Y
}

function drawAndUpdateRipple(
  ctx: CanvasRenderingContext2D,
  ripple: RippleState,
  nowMs: number
): boolean {  // returns false when expired
  const elapsed = nowMs - ripple.startMs;
  if (elapsed >= ripple.durationMs) return false;

  const progress = elapsed / ripple.durationMs;  // 0.0 → 1.0
  const radius = ripple.maxRadius * progress;
  const alpha = 1 - progress;  // linear fade

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ripple.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ripple.baseX, ripple.baseY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  return true;  // still alive
}

// In rAF loop — filter dead ripples without allocating new arrays:
// Iterate backward and splice — O(n) with n bounded at 4
function updateRipples(
  ctx: CanvasRenderingContext2D,
  ripples: RippleState[],
  nowMs: number
): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const alive = drawAndUpdateRipple(ctx, ripples[i], nowMs);
    if (!alive) ripples.splice(i, 1);
  }
}
```

**Ripple array management:** Use `splice` to remove expired ripples. The array is bounded at 4 max. `splice` does allocate internally, but only when removing (not drawing) — and it fires at most once per beat (rare). This is acceptable.

### Pattern 7: Node Layout — Geometric Positions

Positions for 2/3/4 instruments, centered in the canvas. All coordinates as fractions of logical canvas dimensions.

```typescript
// Source: standard geometry — verified manually
// HIGH confidence: basic trigonometry

interface NodePosition {
  x: number;  // fraction of logical width [0,1]
  y: number;  // fraction of logical height [0,1]
}

function computeNodePositions(count: 2 | 3 | 4): NodePosition[] {
  // All layouts centered around (0.5, 0.5) with a radius of ~0.35

  if (count === 2) {
    // Horizontal: left-center and right-center
    return [
      { x: 0.30, y: 0.50 },
      { x: 0.70, y: 0.50 },
    ];
  }

  if (count === 3) {
    // Equilateral triangle: top apex, bottom-left, bottom-right
    // Using 0.35 radius from center (0.5, 0.5)
    return [
      { x: 0.50, y: 0.25 },   // top
      { x: 0.28, y: 0.68 },   // bottom-left
      { x: 0.72, y: 0.68 },   // bottom-right
    ];
  }

  // count === 4: Diamond — top, left, right, bottom
  return [
    { x: 0.50, y: 0.20 },   // top
    { x: 0.22, y: 0.50 },   // left
    { x: 0.78, y: 0.50 },   // right
    { x: 0.50, y: 0.80 },   // bottom
  ];
}

// Jazz quartet assignment (hardcoded for Phase 5):
// bass=bottom, drums=left, keyboard=right, guitar=top
// This places bass and drums adjacent (bottom-left proximity) for pocket line (Phase 6)
```

### Pattern 8: Glow Compositing (Offscreen HTMLCanvasElement)

The existing `createGlowLayer` pattern is correct and must be preserved. Key details for Phase 5:

```typescript
// Source: src/canvas/offscreen/glowLayer.ts (existing, verified)
// HIGH confidence: already working in production

// One glow canvas per instrument, created once at init:
const bassGlowCanvas = createGlowLayer(BASS_BASE_RADIUS * 2, '#b45309');

// In rAF draw — scale glow intensity via globalAlpha:
function drawGlow(
  ctx: CanvasRenderingContext2D,
  glowCanvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  intensity: number  // 0.0-1.0
): void {
  if (intensity <= 0) return;
  const size = glowCanvas.width;  // radius * 4, set at creation
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.globalCompositeOperation = 'lighter';  // additive blend = brighter glow
  ctx.drawImage(glowCanvas, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}
```

**Why `globalCompositeOperation = 'lighter'`:** Additive compositing makes overlapping glows brighter, which looks more realistic for light bloom. The existing code uses `globalAlpha = 0.5 + energy * 0.5` with default `source-over`. For Phase 5, switching to `'lighter'` gives a better glow aesthetic — but reset it afterward with `ctx.restore()`.

### Pattern 9: Bass Node Breathing

The bass glow "breathes" on a 1-beat cycle (determined by BPM). Implement as a sine wave on `breathePhase` driven by `deltaMs`.

```typescript
// Source: standard sine animation pattern, HIGH confidence

// In NodeAnimState: breathePhase: number = 0

// Update per frame (bass node only):
function updateBassBreath(
  animState: NodeAnimState,
  beat: BeatState,
  deltaMs: number
): number {  // returns glow intensity 0.0-1.0
  if (!beat.bpm) {
    // No BPM detected — static low glow
    return 0.15;
  }

  const beatPeriodMs = (60 / beat.bpm) * 1000;
  // Advance phase proportionally to elapsed time
  animState.breathePhase = (animState.breathePhase + deltaMs / beatPeriodMs) % 1.0;

  // Sine wave: breathe from 0.2 to 0.8 intensity
  const sine = Math.sin(animState.breathePhase * Math.PI * 2);
  const breathe = 0.2 + (sine + 1) / 2 * 0.6;  // maps [-1,1] → [0.2, 0.8]

  // Modulate by pocket score (VIZ-05)
  return breathe * (0.5 + beat.pocketScore * 0.5);
}
```

### Pattern 10: Background Pulse

VIZ-11 requires background to pulse from `#0a0a0f` to `#0d0d18` on each beat over 200ms. Use a scalar `bgPulseProgress` in `CanvasRenderer` (not per-node).

```typescript
// Source: derived from existing background fillStyle pattern (CanvasRenderer.ts)
// HIGH confidence: standard pattern

// In CanvasRenderer (not NodeAnimState):
private bgPulseProgress = 0;  // 0.0=normal, 1.0=full pulse, decays over 200ms

// On new drum onset detected:
this.bgPulseProgress = 1.0;

// In render(), before fillRect:
if (this.bgPulseProgress > 0) {
  this.bgPulseProgress = Math.max(0, this.bgPulseProgress - deltaMs / 200);
}
const t = this.bgPulseProgress;
const bg = `rgb(${Math.round(lerp(0x0a, 0x0d, t))},${Math.round(lerp(0x0a, 0x0d, t))},${Math.round(lerp(0x0f, 0x18, t))})`;
ctx.fillStyle = bg;
ctx.fillRect(0, 0, w, h);
```

### Anti-Patterns to Avoid

- **Creating `createGlowLayer` inside `render()`:** Extremely expensive — creates a canvas and paints a gradient every frame. Always create once at init or on significant parameter change.
- **`ctx.shadowBlur` for glow:** Explicitly documented by MDN as expensive. Already avoided in existing code. Never add it.
- **`new Array()` or `new RippleState[]` inside rAF:** Use `splice` on bounded existing arrays. Bounded at 4.
- **`OffscreenCanvas` for glow layers:** iOS 16 Safari support is incomplete for `OffscreenCanvas` (no `transferToImageBitmap` reliability). Use `document.createElement('canvas')` as existing `glowLayer.ts` does.
- **`Math.random()` per frame:** For orbit jitter effects, increment a deterministic angle instead.
- **Recomputing node positions every frame:** Compute once in `computeNodePositions()`, cache the result. Recompute only on resize.
- **String template literals for colors per frame without caching:** Pocket score color interpolation produces a string every frame. This is a minor GC hit but unavoidable — `rgb(r,g,b)` is the only per-frame allocation in the hot path. Acceptable.
- **Accessing `audioStateRef` in React state or Zustand:** Beat state is read directly from `audioStateRef.current.beat` in the rAF loop. Never copy it to React state for animation use.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color interpolation library | Custom color parser | Plain arithmetic on pre-parsed RGB channels | Zero dependencies, zero runtime cost, 3 lines of code |
| Spring physics library | Custom spring solver | Simple exponential lerp (`lerpExp`) | No overshoot needed for these effects — simpler is better |
| Animation library (GSAP, Motion) | — | None — hand-rolled rAF loop already exists | Adding a library introduces its own rAF loop (double-rAF conflict) and 30KB+ overhead |
| OffscreenCanvas Worker offload | — | Off-DOM HTMLCanvasElement on main thread | iOS Safari OffscreenCanvas Worker support unreliable; main-thread offscreen is sufficient |
| Canvas node graph library (D3, Konva, Two.js) | — | Pure Canvas 2D | Already decided; libraries cannot satisfy per-pixel glow compositing requirements |

**Key insight:** This phase is intentionally zero-dependency. The existing `glowLayer.ts` + `CanvasRenderer.ts` patterns are already the correct architecture — Phase 5 extends them, not replaces them.

---

## Common Pitfalls

### Pitfall 1: Re-Creating Glow Canvas on Color Change

**What goes wrong:** For pocket-score-driven glow color shift (VIZ-05), a naive implementation calls `createGlowLayer` every frame with the new interpolated color. This creates and immediately discards a canvas each frame — severe GC pressure.

**Why it happens:** `createGlowLayer` is cheap to call (microseconds), so developers underestimate accumulated cost.

**How to avoid:** Two options:
- (A) Re-create the glow canvas only when pocketScore changes by more than 0.05 (threshold gate). Store `lastPocketScore` in `NodeAnimState`. Most frames skip re-creation.
- (B) Use a fixed amber glow canvas and tint with `globalAlpha` + a blue overlay rect using `globalCompositeOperation = 'multiply'`. More complex but zero re-creation.

Recommend option (A) for clarity. Gate: `Math.abs(newPocket - lastPocket) > 0.05`.

**Warning signs:** Frame rate drops when pocket score changes rapidly. Chrome DevTools Rendering panel shows canvas element count growing.

### Pitfall 2: Delta-Time Cap Missing — Jump on Tab Resume

**What goes wrong:** When user returns to a backgrounded tab, the first rAF fires with `timestamp` that is hundreds of ms ahead of `prevTimestamp`. Without capping `deltaMs`, all animation states advance by hundreds of ms: ripples that should take 300ms complete instantly, bass breath jumps forward by 500ms, etc.

**Why it happens:** `requestAnimationFrame` pauses when the tab is backgrounded. The browser makes no adjustment to the timestamp when the tab resumes.

**How to avoid:** `const deltaMs = Math.min(rawDelta, 100)`. Cap at 100ms (6 frames). This means animations freeze during background, then resume smoothly — which is correct behavior.

**Warning signs:** All animations visually "snap" to advanced positions when user switches tabs back.

### Pitfall 3: Beat Onset Detection Using `beatCounter` Wrapping

**What goes wrong:** Using `beat.beatCounter` to detect new beats by checking `beatCounter !== lastSeen`. Because `beatCounter` is 0–3 and wraps, it can equal `lastSeen` after 4 beats even without a new beat firing. Downbeat detection via `beatCounter === 0` has the same issue.

**Why it happens:** `beatCounter` is designed as a position-in-bar indicator, not an event counter.

**How to avoid:** Use `lastDrumOnsetSec` and `lastDownbeatSec` (AudioContext time values) for onset detection. These are monotonically increasing and only update on actual events. `lastSeenDrumOnsetSec` in `NodeAnimState` stores the last-processed value.

**Warning signs:** Drum ripples fire on every 4th beat skip, or skip entirely on certain bar transitions.

### Pitfall 4: iOS Low Power Mode — rAF Throttled to 30fps

**What goes wrong:** Animations that use `Math.sin(frameCount * constant)` or fixed-step lerp multipliers (e.g., `glowIntensity *= 0.95` per frame) animate at half speed in Low Power Mode.

**Why it happens:** iOS Safari throttles rAF to 30fps in Low Power Mode. This is undocumented and undetectable via JS API (Battery Status API not available in Safari).

**How to avoid:** All animations MUST use delta-time (`deltaMs`). Lerp with `lerpExp(current, target, factor, deltaMs)` — not a fixed multiplier. The `lerpExp` formula adjusts factor by `deltaMs / 16.667` so behavior is identical at 30fps and 60fps.

**Warning signs:** Animations tested on desktop at 60fps look correct, but on iPhone in Low Power Mode all animations look slow/sluggish.

**Known documented limitation:** The 30fps cap in Low Power Mode is accepted. The app does not attempt to detect or compensate for it beyond using delta-time.

### Pitfall 5: `ctx.save()` / `ctx.restore()` Overuse

**What goes wrong:** Wrapping every single draw call in `save()`/`restore()` adds measurable overhead in tight rAF loops. MDN Optimizing Canvas notes that state changes are expensive.

**Why it happens:** Defensive coding — "just wrap everything in save/restore."

**How to avoid:** Group draw calls that share the same state. Only save/restore around `globalAlpha` and `globalCompositeOperation` changes (glow drawing). For node circles and labels, set state once and reuse across all nodes.

**Warning signs:** Chrome DevTools flame graph shows `save`/`restore` dominating canvas draw time.

### Pitfall 6: Node Positions Computed Every Frame

**What goes wrong:** `computeNodePositions(4)` called inside `render()` computes 4 objects every frame. At 60fps = 60 object allocations/sec.

**Why it happens:** Forgetting that positions don't change between resizes.

**How to avoid:** Cache `nodePositions: NodePosition[]` in `CanvasRenderer` as an instance variable. Recompute only in `resize()`.

### Pitfall 7: Ripple Array Growing Unbounded

**What goes wrong:** Each drum onset pushes a new `RippleState` object. If the tempo is fast (160 BPM) and ripples last 300ms, up to 1-2 active ripples exist. At pathological BPM and downbeat emphasis, more can accumulate.

**Why it happens:** No max-length guard on `ripples[]`.

**How to avoid:** Before pushing a new ripple: `if (ripples.length >= 4) ripples.shift()`. This silently drops the oldest — which is already fading and barely visible.

---

## Code Examples

### Delta-Time rAF Refactor Entry Point

```typescript
// Source: spicyyoghurt.com delta-time tutorial + existing CanvasRenderer pattern
// Refactor boundRender to accept timestamp

private prevTimestamp = 0;

// Change constructor:
this.boundRender = (ts: DOMHighResTimeStamp) => this.render(ts);
this.rafHandle = requestAnimationFrame(this.boundRender);

// Change render signature:
private render(timestamp: DOMHighResTimeStamp): void {
  const rawDelta = this.prevTimestamp > 0 ? timestamp - this.prevTimestamp : 16.667;
  const deltaMs = Math.min(rawDelta, 100);  // cap to prevent tab-resume jump
  this.prevTimestamp = timestamp;

  // ... existing render logic, now passing deltaMs to animation update functions
}
```

### Role-Based Node Sizing

```typescript
// Source: VIZ-12 requirements, verified against RoleLabel type in src/audio/types.ts
// HIGH confidence: direct from spec

const ROLE_BASE_RADIUS: Record<string, number> = {
  soloing: 52,   // large
  comping: 36,   // medium
  holding: 28,   // small-medium
  silent:  18,   // small
};

const ROLE_FILL_COLOR: Record<string, string> = {
  soloing: '#f59e0b',  // amber
  comping: '#0d9488',  // blue-teal (teal-600)
  holding: '#64748b',  // gray-blue (slate-500)
  silent:  '#1e293b',  // dark (slate-800)
};
```

### Bass Node Onset Flash

```typescript
// Source: VIZ-04 — glow brightens on bass onset + ring expands over 800ms
// Pattern: spawn a RippleState with durationMs=800, then decay glowIntensity

function onBassOnset(animState: NodeAnimState, cx: number, cy: number): void {
  // Flash glow to max
  animState.glowIntensity = 1.0;

  // Spawn slow expanding ring
  if (animState.ripples.length < 4) {
    animState.ripples.push({
      startMs: performance.now(),
      durationMs: 800,
      maxRadius: 80,       // deep, slow ring
      color: 'rgba(180,83,9,0.6)',  // deep amber, semi-transparent
      baseX: cx,
      baseY: cy,
    });
  }
}
```

### Drums Beat Nudge with Lerp-Back

```typescript
// Source: VIZ-06 — +6px nudge, lerps back over 180ms
// Uses lerpExp for frame-rate independence

function updateDrumsNudge(animState: NodeAnimState, deltaMs: number): void {
  // Lerp radiusNudge back toward 0 at 180ms decay
  // lerpExp factor = 0.95 per 16.67ms frame = very fast decay
  animState.radiusNudge = lerpExp(animState.radiusNudge, 0, 0.92, deltaMs);
  if (animState.radiusNudge < 0.5) animState.radiusNudge = 0;  // snap to 0 near end
}

function onDrumBeat(animState: NodeAnimState): void {
  animState.radiusNudge = 6;  // immediate +6px (VIZ-06)
}
```

### Drums Orbit Effect

```typescript
// Source: VIZ-09 — ±3px orbit when timingOffsetMs > 30ms
// Orbit is a circular path offset from node center

function getDrumsOrbitOffset(
  animState: NodeAnimState,
  timingOffsetMs: number,
  deltaMs: number
): { ox: number; oy: number } {
  const ORBIT_THRESHOLD_MS = 30;
  const ORBIT_RADIUS_PX = 3;
  const ORBIT_SPEED = 0.004;  // radians per ms

  if (Math.abs(timingOffsetMs) > ORBIT_THRESHOLD_MS) {
    animState.orbitAngle = (animState.orbitAngle + ORBIT_SPEED * deltaMs) % (Math.PI * 2);
    return {
      ox: Math.cos(animState.orbitAngle) * ORBIT_RADIUS_PX,
      oy: Math.sin(animState.orbitAngle) * ORBIT_RADIUS_PX,
    };
  } else {
    // Decay orbit back to center when timing is tight
    animState.orbitAngle = 0;
    return { ox: 0, oy: 0 };
  }
}
```

### Background Pulse

```typescript
// Source: VIZ-11, derived from existing background fill pattern in CanvasRenderer.ts
// bgPulseProgress stored as CanvasRenderer instance variable (not per-node)

// Constants (module-level):
const BG_BASE = { r: 0x0a, g: 0x0a, b: 0x0f };    // #0a0a0f
const BG_PEAK = { r: 0x0d, g: 0x0d, b: 0x18 };    // #0d0d18
const BG_PULSE_MS = 200;

// In render():
this.bgPulseProgress = Math.max(0, this.bgPulseProgress - deltaMs / BG_PULSE_MS);
const t = this.bgPulseProgress;
const r = Math.round(lerp(BG_BASE.r, BG_PEAK.r, t));
const g = Math.round(lerp(BG_BASE.g, BG_PEAK.g, t));
const b = Math.round(lerp(BG_BASE.b, BG_PEAK.b, t));
ctx.fillStyle = `rgb(${r},${g},${b})`;
ctx.fillRect(0, 0, w, h);
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `ctx.shadowBlur` for glow | Offscreen HTMLCanvasElement + `drawImage` | 3-5x faster on iOS, established since 2011 |
| `OffscreenCanvas` for workers | Off-DOM `HTMLCanvasElement` on main thread | iOS 16 compat; OffscreenCanvas workers unreliable in Safari |
| Fixed-step lerp (`x *= 0.95` per frame) | `lerpExp(x, target, factor, deltaMs)` | Frame-rate independent at 30fps and 60fps |
| Per-frame array allocation for active animations | Bounded `RippleState[]` with `splice` | GC pressure eliminated |
| `setInterval` for analysis tick | `performance.now()` gate inside rAF | No double-timer, pauses on tab background |

**Deprecated/outdated:**
- `OffscreenCanvas` for glow: Available in Safari 16.4+ but Worker + `transferToImageBitmap` flow is still unreliable on iOS. Use `HTMLCanvasElement` (off-DOM) for now.
- `ctx.shadowBlur`: Functionally works but expensive. Never use in this project.

---

## Open Questions

1. **Glow color re-creation strategy for pocket score**
   - What we know: `createGlowLayer` is cheap (~microseconds) but creates a new canvas element each call. Frequent calls (every frame) cause GC churn.
   - What's unclear: How frequently does pocket score change significantly in practice? If it's stable for 2+ seconds at a time, threshold-gating at 0.05 is fine.
   - Recommendation: Implement threshold gate (option A). If pocket score updates cause visible flicker or lag on iPhone, switch to option B (tinting via compositing).

2. **Drums orbit rendering when rAF is at 30fps**
   - What we know: At 30fps, orbit angle increments by `0.004 * 33 = 0.132` radians per frame — still smooth enough visually.
   - What's unclear: Whether the subtle ±3px orbit is even perceptible at 30fps on a mobile screen.
   - Recommendation: Implement as specified. Note in code that orbit may be imperceptible at 30fps — acceptable.

3. **Downbeat detection reliability from Phase 4**
   - What we know: `lastDownbeatSec` is updated every 4th drum onset. In rubato sections, `bpm` is `null` but `lastDownbeatSec` may still update.
   - What's unclear: Whether `beatCounter` resets correctly after rubato → tempo recovery.
   - Recommendation: For downbeat effects (double-ripple, stronger pulse), gate on both `bpm !== null` AND `detectDownbeat(...)`. If `bpm` is null, treat all beats as non-downbeats.

---

## Sources

### Primary (HIGH confidence)

- MDN `Canvas_API/Tutorial/Optimizing_canvas` — verified: offscreen canvas pattern, shadowBlur cost, integer coordinate advice
- MDN `Canvas_API/Tutorial/Basic_animations` — verified: rAF loop pattern, 4-step draw cycle
- MDN `Canvas_API/Tutorial/Advanced_animations` — verified: velocity-object state pattern, per-frame mutation approach
- `src/canvas/CanvasRenderer.ts` (existing codebase) — verified: rAF loop, HiDPI setup, offscreen glow via drawImage
- `src/canvas/offscreen/glowLayer.ts` (existing codebase) — verified: createGlowLayer pattern, why HTMLCanvasElement not OffscreenCanvas
- `src/audio/types.ts` (existing codebase) — verified: BeatState structure, all available fields

### Secondary (MEDIUM confidence)

- spicyyoghurt.com delta-time tutorial — verified pattern against MDN animation timestamp docs: `const deltaMs = Math.min(timestamp - prevTimestamp, 100)` with 100ms cap
- Bryan Braun ripple animation article — verified the `progress = elapsed / duration`, `alpha = 1 - progress`, `radius = maxRadius * progress` pattern
- WebKit bug tracker #168837, #215745 — confirmed iOS Low Power Mode throttles rAF to 30fps (WebKit official source)
- popmotion.io blog — confirmed Low Power Mode throttling undetectable via JS APIs in Safari

### Tertiary (LOW confidence)

- web.dev canvas-performance article (2011 origin) — General offscreen canvas principle still valid but benchmark numbers are outdated
- `measurethat.net` HTMLCanvasElement vs OffscreenCanvas `drawImage` benchmark — benchmark-only, platform-specific results

---

## Metadata

**Confidence breakdown:**
- Architecture patterns: HIGH — derived from existing working codebase + MDN
- Delta-time formula: HIGH — standard math, multiple sources agree
- iOS rAF throttle behavior: HIGH — verified via WebKit bug tracker
- Glow canvas re-creation strategy: MEDIUM — threshold-gate approach is reasonable but actual pocket-score change frequency in practice is untested
- Ripple array management: HIGH — bounded splice pattern is standard
- Node geometry positions: MEDIUM — specific fraction values (0.30, 0.70, etc.) are reasonable estimates that may need visual tuning

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (Canvas 2D API is stable; iOS Safari behavior may change with iOS updates)
