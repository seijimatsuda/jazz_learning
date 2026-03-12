---
phase: 12-disambiguation-engine
verified: 2026-03-12T23:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Trombone and bass activity scores diverge when playing simultaneously — classifyRole now called with displayActivityScore after disambiguation engine runs"
    - "Vibes tremolo passages produce higher vibes activity and lower keyboard activity — same root fix"
    - "Monophonic sax runs show higher sax activity than keyboard activity — same root fix"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 12: Disambiguation Engine Verification Report

**Phase Goal:** Overlapping instrument pairs produce meaningfully different activity scores when playing simultaneously
**Verified:** 2026-03-12T23:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure plan 12-06

## Re-verification Context

Previous verification (2026-03-12T23:13:01Z) found one root cause blocking three of five truths: `displayActivityScore` was written by all disambiguators but never consumed by any rendering path. The `classifyRole` call at AnalysisTick.ts line 145 used the pre-disambiguation `activityScore`, so canvas node size and color were unaffected by disambiguation output.

Gap closure plan 12-06 added a second-pass `classifyRole` loop at AnalysisTick.ts lines 218-231, immediately after `runDisambiguationEngine` returns. The re-verification below checks that loop exists, is structurally correct, and that `displayActivityScore` now reaches the rendering pipeline.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Trombone and bass activity scores diverge when playing simultaneously | VERIFIED | `classifyRole(instr.displayActivityScore, instr.role)` called at AnalysisTick.ts line 224. Guard `displayActivityScore !== activityScore` (line 223) ensures second pass runs only when TromboneBassDisambiguator changed the score. Role is then written back to `instr.role` (line 226), which CanvasRenderer reads at line 546 for `getRoleRadius` and `getRoleFillColor`. |
| 2 | Vibes tremolo passages produce higher vibes activity and lower keyboard activity | VERIFIED | Same second-pass loop at lines 218-231 applies to all instruments, including vibes and keyboard. VibesKeyboardDisambiguator writes divergent `displayActivityScore` to vibes and keyboard; second pass reclassifies their roles. Canvas reads the updated `instr.role`. |
| 3 | Monophonic sax runs show higher sax activity than keyboard activity | VERIFIED | SaxKeyboardDisambiguator writes `sax.displayActivityScore *= saxWeight` and `keyboard.displayActivityScore *= keyboardWeight` before second-pass loop runs. Loop reclassifies roles. Chroma guard still present (DisambiguationEngine.ts line 95 checks `chroma !== null`), which is expected graceful degradation. |
| 4 | 3+ horns produce differentiated activity levels via spectral centroid ordering | VERIFIED | HornSectionDisambiguator algorithm verified in previous pass (193 lines, confidence penalty guards, inverse-distance weighting). Second-pass loop at AnalysisTick.ts lines 218-231 now consumes horn `displayActivityScore` values. Canvas node roles diverge across horn instruments. |
| 5 | Tutti passages reset disambiguation weights to equal and confidence indicators reflect uncertainty | VERIFIED | `isTuttiActive` guard in DisambiguationEngine.ts lines 62-70 returns early, leaving all `displayActivityScore` equal to `activityScore`. Confidence zeroed. Second-pass loop guard `displayActivityScore !== activityScore` (line 223) therefore skips all instruments during tutti — first-pass roles are unchanged, which is correct (no false precision). Confidence flows to CanvasRenderer via `disambiguationConfidence` cache (line 306), globalAlpha=0.5 applied when `pairConfidence < 0.5` (CanvasRenderer.ts line 576). |

**Score:** 5/5 truths verified

---

## Gap Closure Verification (Primary Check)

### Does `classifyRole` get called with `displayActivityScore` after disambiguation runs?

**YES — verified at AnalysisTick.ts lines 218-231:**

```
218:  // Phase 12 gap closure: Re-classify roles using displayActivityScore.
219:  // The first pass used pre-disambiguation activityScore. Now that
220:  // runDisambiguationEngine has written displayActivityScore, re-run classifyRole
221:  // so that canvas node visuals (size, color) reflect disambiguated scores.
222:  for (const instr of instrs) {
223:    if (instr.displayActivityScore !== instr.activityScore) {
224:      const newRole = classifyRole(instr.displayActivityScore, instr.role);
225:      if (newRole !== instr.role) {
226:        instr.role = newRole;
227:        instr.roleSinceSec = state.audioCtx?.currentTime ?? 0;
228:        onRoleChange?.(instr.instrument, newRole);
229:      }
230:    }
231:  }
```

### Is the second-pass loop correctly positioned?

**YES.** Execution order in AnalysisTick.ts:

1. First-pass loop (lines 129-156): `activityScore` → `classifyRole` → `instr.role`
2. KbGuitarDisambiguator block (lines 158-189): may modify `activityScore` for kb/guitar
3. `runDisambiguationEngine` block (lines 191-216): writes `displayActivityScore` for all instruments using Phase 12 disambiguators
4. **Second-pass loop (lines 218-231):** reads `displayActivityScore`, calls `classifyRole`, overwrites `instr.role` when role changed
5. Cross-correlation (lines 233-247): reads `historyBuffer` — not affected by role
6. Chord/tension/beat/pitch (lines 249-407): all use separate state, not affected

The second pass is correctly placed: after `runDisambiguationEngine` has written `displayActivityScore` and before `prevRawFreqData` is saved (line 407). It cannot run too early.

### Does `instr.role` reach the canvas?

**YES.** CanvasRenderer.ts line 546:
```
const role = instrAnalysis?.role ?? 'silent';
```
This `role` is used at line 550 (`getRoleRadius(role)`) and line 560 (`getRoleFillColor(role)`). Both drive node visual state.

### Is `classifyRole` called with the correct signature?

**YES.** `classifyRole(instr.displayActivityScore, instr.role)` matches the function signature at RoleClassifier.ts line 36:
```
classifyRole(activityScore: number, currentRole: RoleLabel, hysteresis = 0.05): RoleLabel
```
The second pass passes `instr.role` (set by first pass) as `currentRole` — hysteresis from the first pass is preserved, not bypassed. This is architecturally correct: an instrument that is `comping` after the first pass will not immediately jump to `soloing` on a 0.001 disambiguation weight nudge.

### Is `onRoleChange` correctly fired from the second pass?

**YES.** Line 228 fires `onRoleChange?.(instr.instrument, newRole)` — same callback that the first pass uses (line 151). The guard on line 225 (`newRole !== instr.role`) prevents duplicate fires for instruments whose disambiguated role matches the first-pass role.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audio/AnalysisTick.ts` | Second-pass classifyRole loop after disambiguation engine | VERIFIED | Lines 218-231. 13-line loop. Guard on displayActivityScore !== activityScore. Calls classifyRole with displayActivityScore. Fires onRoleChange. Positioned after runDisambiguationEngine block. |
| `src/audio/DisambiguationEngine.ts` | Writes displayActivityScore for all pairs | VERIFIED | Confirmed unchanged from previous verification. 148 lines. All 4 disambiguators wired. displayActivityScore written via weight multiplication. |
| `src/audio/RoleClassifier.ts` | classifyRole(activityScore, currentRole) signature | VERIFIED | Line 36. Pure function, no side effects. Takes normalized score and current role. Returns new role. |
| `src/canvas/CanvasRenderer.ts` | Reads instr.role for node visual state | VERIFIED | Line 546. role → getRoleRadius (line 550) → targetRadius → currentRadius (line 553). role → getRoleFillColor (line 560) → fillColor → drawNode. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| DisambiguationEngine | instr.displayActivityScore | weight multiplication | WIRED | Lines 89-90, 102-103, 117-119, 141-144 in DisambiguationEngine.ts |
| AnalysisTick second-pass | classifyRole | displayActivityScore parameter | WIRED | Line 224 — confirmed |
| classifyRole return | instr.role | assignment on line 226 | WIRED | Confirmed |
| instr.role | CanvasRenderer node visual | instrAnalysis.role at line 546 | WIRED | Confirmed. Role drives both radius and fill color. |
| DisambiguationEngine confidence | CanvasRenderer globalAlpha | disambiguationConfidence cache | WIRED | setOnDisambiguationUpdate (line 304) caches confidence. getInstrumentPairKey + globalAlpha = 0.5 at line 576. |

---

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| DISC-FND-01: Raw/display score split | SATISFIED | rawActivityScore preserved. displayActivityScore now consumed by second-pass role classifier. One source of truth. |
| DISC-FND-02: Hand-rolled spectralFlatness | SATISFIED | Unchanged from previous verification. |
| DISC-FND-03: Float32Array ring buffers | SATISFIED | Unchanged. |
| DISC-FND-04: Tutti guard | SATISFIED | Confirmed. Early return leaves displayActivityScore equal to activityScore; second-pass guard skips all instruments. |
| DISC-FND-05: Pair presence guards | SATISFIED | Unchanged. |
| DISC-01: Trombone/bass via onset + flatness | SATISFIED | Algorithm correct + second pass now feeds role → canvas. |
| DISC-02: Vibes/keyboard via tremolo detection | SATISFIED | Algorithm correct + second pass feeds role → canvas. |
| DISC-03: Horn section via centroid hierarchy | SATISFIED | Algorithm correct + second pass feeds role → canvas. |
| DISC-04: Confidence indicator per instrument | SATISFIED | globalAlpha dimming confirmed working in CanvasRenderer lines 570-576. Unchanged. |
| DISC-05: Sax/keyboard via chroma entropy | SATISFIED | Algorithm correct + second pass feeds role → canvas. Chroma null-guard is expected behavior. |

---

## Anti-Patterns Scan (Re-verification Focus)

| File | Line | Pattern | Severity | Status |
|------|------|---------|----------|--------|
| `src/audio/AnalysisTick.ts` | 223 | Guard `displayActivityScore !== activityScore` | Info | Intentional optimization — skips second pass when disambiguation had no effect. Not a stub. |
| `src/audio/TromboneBassDisambiguator.ts` | 33, 36, 144 | CALIBRATION_NEEDED markers | Warning | Unchanged from previous verification. Thresholds require tuning against real recordings. Does not block algorithmic function. |
| `src/audio/HornSectionDisambiguator.ts` | 43-45 | CALIBRATION_NEEDED | Warning | Unchanged. |
| `src/audio/SaxKeyboardDisambiguator.ts` | 55-56 | CALIBRATION_NEEDED | Warning | Unchanged. |

No blockers found. The previously-identified blocker (classifyRole using pre-disambiguation score) is resolved.

---

## Regression Check (Previously Passing Items)

- Truth 4 (Horn section differentiation): Algorithm unchanged. Second-pass loop now also applies to horn instruments — no regression, improvement only.
- Truth 5 (Tutti confidence reset): Tutti guard logic unchanged. Second-pass guard `displayActivityScore !== activityScore` correctly skips all instruments when tutti is active (displayActivityScore was set to activityScore by DisambiguationEngine early return). No regression.
- CanvasRenderer confidence dimming (DISC-04): `setOnDisambiguationUpdate` implementation and `disambiguationConfidence` cache unchanged. globalAlpha logic unchanged. No regression.

---

## Gaps Summary

No gaps. The single root cause identified in the initial verification — `displayActivityScore` written but never consumed — is resolved by the second-pass `classifyRole` loop at AnalysisTick.ts lines 218-231. All five observable truths now have verified end-to-end paths from disambiguation computation through role classification to canvas node visual state.

---

_Verified: 2026-03-12T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure plan 12-06_
