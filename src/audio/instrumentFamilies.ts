/**
 * instrumentFamilies.ts — Instrument family constants and pair detection helpers.
 *
 * Provides pure helper functions for the Phase 12 disambiguation engine.
 * All functions are side-effect-free and perform zero allocations except
 * the module-level constants defined here.
 *
 * Used by disambiguators to:
 *   - Identify which instruments are present in a lineup
 *   - Detect pairs that require disambiguation (e.g., trombone/bass, vibes/keyboard)
 *   - Guard against tutti suppression (DISC-FND-04)
 */

/**
 * Maps each instrument name to its sonic family.
 * Used by disambiguators to reason about spectral overlap between families.
 */
export const INSTRUMENT_FAMILIES: Record<string, string> = {
  bass: 'rhythm',
  drums: 'rhythm',
  keyboard: 'keyboard',
  guitar: 'strings',
  saxophone: 'woodwind',
  trumpet: 'brass',
  trombone: 'brass',
  vibes: 'keyboard',
};

/**
 * Maps each instrument family to its visual ring color.
 * Used by CanvasRenderer to draw a colored ring stroke outside each node's fill circle,
 * giving instant family identification (VIS-01).
 *
 * Colors chosen for perceptual distinctiveness on a dark background:
 *   rhythm   → orange-500 (drums, bass — foundational rhythm section)
 *   brass    → amber-400  (trumpet, trombone — warm metallic)
 *   woodwind → emerald-400 (saxophone — cool reed tone)
 *   keyboard → indigo-400  (keyboard, vibes — harmonic/chordal cluster)
 *   strings  → fuchsia-400 (guitar — bright string color)
 */
export const FAMILY_RING_COLOR: Record<string, string> = {
  rhythm:   '#f97316', // orange-500
  brass:    '#fbbf24', // amber-400
  woodwind: '#34d399', // emerald-400
  keyboard: '#818cf8', // indigo-400
  strings:  '#e879f9', // fuchsia-400
};

/**
 * The set of horn instruments counted for horn section disambiguation.
 * Trombone, saxophone, and trumpet share the mid-frequency range and
 * require spectral shape analysis to separate.
 */
export const HORN_INSTRUMENTS = new Set(['trombone', 'saxophone', 'trumpet']);

/**
 * Checks whether both instruments in a pair are present in the current lineup.
 *
 * @param instruments - Array of instrument objects with an `instrument` name field
 * @param a - First instrument name
 * @param b - Second instrument name
 * @returns true if both a and b appear in the instruments array
 */
export function hasInstrumentPair(
  instruments: Array<{ instrument: string }>,
  a: string,
  b: string,
): boolean {
  return instruments.some(i => i.instrument === a) && instruments.some(i => i.instrument === b);
}

/**
 * Counts how many horn instruments are present in the current lineup.
 *
 * @param instruments - Array of instrument objects with an `instrument` name field
 * @returns Number of instruments in HORN_INSTRUMENTS present in the lineup
 */
export function countHorns(instruments: Array<{ instrument: string }>): number {
  return instruments.filter(i => HORN_INSTRUMENTS.has(i.instrument)).length;
}

/**
 * Tutti detection guard — returns true when all instruments are simultaneously active.
 *
 * Implements DISC-FND-04: during tutti passages, disambiguation is unreliable because
 * every instrument is loud. When isTuttiActive returns true, disambiguators should
 * skip weight adjustments and let scores pass through unchanged.
 *
 * @param instruments - Array of instrument objects with a `rawActivityScore` field
 * @param threshold   - Activity score threshold above which an instrument is "active" (default 0.6)
 * @returns true if every instrument's rawActivityScore exceeds the threshold
 */
export function isTuttiActive(
  instruments: Array<{ rawActivityScore: number }>,
  threshold = 0.6,
): boolean {
  return instruments.every(i => i.rawActivityScore > threshold);
}
