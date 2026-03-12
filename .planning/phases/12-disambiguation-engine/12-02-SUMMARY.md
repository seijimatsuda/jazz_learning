---
phase: 12-disambiguation-engine
plan: 02
subsystem: audio
tags: [spectral-features, fft, chroma, entropy, disambiguation, typescript]

# Dependency graph
requires:
  - phase: none
    provides: standalone math utilities — no prior phase dependencies
provides:
  - computeSpectralFlatness: zero-safe geometric/arithmetic mean ratio over band-limited FFT bins
  - computeBandCentroid: frequency-weighted centroid in Hz over a bin range
  - chromaEntropy: Shannon entropy of 12-element chroma vector
affects:
  - 12-03-PLAN.md (horn disambiguator uses computeSpectralFlatness + computeBandCentroid)
  - 12-04-PLAN.md (piano disambiguator uses chromaEntropy)
  - all remaining Phase 12 disambiguators

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-safe geometric mean: skip zero bins before Math.log to avoid -Infinity propagation"
    - "Band-limited feature extraction: all functions take lowBin/highBin to isolate instrument registers"
    - "Pure function pattern: no imports, no state, scalar-only locals — safe to call from any AudioWorklet context"

key-files:
  created:
    - src/audio/SpectralFeatures.ts
  modified: []

key-decisions:
  - "Skip zero bins in computeSpectralFlatness (not clamp to epsilon) — skipping gives a more conservative count and avoids inflating the geometric mean with noise floor values"
  - "chromaEntropy returns raw entropy in [0, log2(12)], not normalized — callers can normalize if needed, preserves information"
  - "computeBandCentroid returns 0 (not NaN) on silence — safe default for threshold comparisons downstream"

patterns-established:
  - "Zero-safe log accumulation: iterate, skip zeros, accumulate into logSum/linSum/count"
  - "Band-limited FFT iteration: for (let i = lowBin; i <= highBin; i++) with hz = (i * sampleRate) / fftSize"

# Metrics
duration: 1min
completed: 2026-03-12
---

# Phase 12 Plan 02: SpectralFeatures.ts Summary

**Three pure spectral extractors replacing Meyda's broken Math.log(0) flatness bug, adding band-limited centroid in Hz and 12-bin chroma Shannon entropy**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-12T22:53:02Z
- **Completed:** 2026-03-12T22:53:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- computeSpectralFlatness correctly handles zero-valued FFT bins (Meyda silently returns 0 due to Math.log(0) = -Infinity)
- computeBandCentroid returns frequency-weighted centroid in Hz, restricted to a caller-specified bin range for per-register analysis
- chromaEntropy computes Shannon entropy of a 12-element chroma vector for monophonic vs. chordal discrimination
- All three functions are pure: no imports, no side effects, no heap allocations beyond scalar locals

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SpectralFeatures.ts with all three extractors** - `2b0f03d` (feat)

**Plan metadata:** (to be added)

## Files Created/Modified
- `src/audio/SpectralFeatures.ts` - Three pure spectral feature extractors for Phase 12 disambiguation

## Decisions Made
- Skip zero bins in computeSpectralFlatness rather than clamping to epsilon: skipping gives a more accurate geometric mean over the audible signal, avoids inflating with noise floor values
- chromaEntropy returns raw entropy in [0, log2(12)], not normalized: preserves information and lets each disambiguator normalize as needed
- computeBandCentroid returns 0 on silence: safe default for threshold comparisons, avoids NaN propagation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SpectralFeatures.ts is ready for import by all Phase 12 disambiguators
- computeSpectralFlatness replaces the broken Meyda call in horn/brass disambiguation (Plan 03)
- computeBandCentroid enables trombone/sax/trumpet ordering by register centroid (Plan 03)
- chromaEntropy enables piano vs. bass disambiguation by chordal density (Plan 04)
- Thresholds for flatness and entropy cutoffs still require empirical calibration on real jazz recordings (known concern from STATE.md)

---
*Phase: 12-disambiguation-engine*
*Completed: 2026-03-12*
