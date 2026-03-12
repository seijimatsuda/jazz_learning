/**
 * edgeTypes.ts — Static edge classification table and color constants.
 *
 * Defines the three semantic edge types (rhythmic, melodic, support) and
 * maps all instrument pairs to their type. Color constants are pre-parsed
 * as RGB channel objects for zero-alloc channel interpolation in per-frame
 * rendering code.
 *
 * EDGE_TYPE maps: 'instrumentA_instrumentB' (canonical alphabetical order)
 *   bass_drums     → rhythmic  (pocket line — the visual spine, EDGE-01)
 *   guitar_keyboard → melodic  (harmonic conversation)
 *   all others     → support   (structural connections)
 *
 * Also exports getTintedColor — tension-driven color lerp utility (EDGE-09).
 */

import { lerp } from '../nodes/NodeAnimState';

// ---------------------------------------------------------------------------
// EdgeType
// ---------------------------------------------------------------------------

/** The three semantic categories of instrument graph edges. */
export type EdgeType = 'rhythmic' | 'melodic' | 'support';

// ---------------------------------------------------------------------------
// EDGE_COLOR — pre-parsed RGB for zero-alloc channel interpolation
// ---------------------------------------------------------------------------

/**
 * Per-EdgeType base colors in pre-parsed RGB channels.
 *
 * rhythmic: #4ade80 (Tailwind green-400)  — bass/drums pocket line
 * melodic:  #a855f7 (Tailwind purple-400) — guitar/keyboard harmonic line
 * support:  #60a5fa (Tailwind blue-400)   — structural connections
 */
export const EDGE_COLOR: Record<EdgeType, { r: number; g: number; b: number }> = {
  rhythmic: { r: 0x4a, g: 0xde, b: 0x80 },   // #4ade80 green-400
  melodic:  { r: 0xa8, g: 0x55, b: 0xf7 },   // #a855f7 purple-400
  support:  { r: 0x60, g: 0xa5, b: 0xfa },   // #60a5fa blue-400
};

// ---------------------------------------------------------------------------
// Tension color constants — pre-parsed RGB
// ---------------------------------------------------------------------------

/**
 * Amber color for tension-high edges.
 * Matches Tailwind orange-500 (#f97316).
 */
export const TENSION_AMBER_RGB = { r: 0xf9, g: 0x73, b: 0x16 };

/**
 * Red color for peak tension edges.
 * Matches Tailwind red-500 (#ef4444).
 */
export const TENSION_RED_RGB = { r: 0xef, g: 0x44, b: 0x44 };

/**
 * Blue color for tension resolution flash (EDGE-10).
 * Matches Tailwind blue-200 (#bfdbfe).
 */
export const RESOLUTION_BLUE_RGB = { r: 0xbf, g: 0xdb, b: 0xfe };

// ---------------------------------------------------------------------------
// getTintedColor — tension-driven color lerp (EDGE-09)
// ---------------------------------------------------------------------------

/**
 * Returns a CSS rgb() string that lerps a base color toward the tension
 * target color (amber above 0.8 threshold, red above 0.8 threshold).
 *
 * Uses TENSION_AMBER_RGB for tension <= 0.8 and TENSION_RED_RGB for > 0.8.
 * The tintFactor [0,1] controls how far the base color shifts toward the target.
 *
 * @param baseR      - Base color red channel [0,255]
 * @param baseG      - Base color green channel [0,255]
 * @param baseB      - Base color blue channel [0,255]
 * @param tintFactor - Interpolation factor [0,1]
 * @param tension    - Current tension value [0,1]; selects amber vs red target
 * @returns CSS rgb() string for use as strokeStyle
 */
export function getTintedColor(
  baseR: number, baseG: number, baseB: number,
  tintFactor: number,
  tension: number,
): string {
  const target = tension > 0.8 ? TENSION_RED_RGB : TENSION_AMBER_RGB;
  const r = Math.round(lerp(baseR, target.r, tintFactor));
  const g = Math.round(lerp(baseG, target.g, tintFactor));
  const b = Math.round(lerp(baseB, target.b, tintFactor));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// EDGE_TYPE — canonical pair → type mapping
// ---------------------------------------------------------------------------

/**
 * Maps instrument pair strings (alphabetical order, underscore separator)
 * to their EdgeType.
 *
 * All 28 pairs for 8 instruments — C(8,2) = 28 (v1.1, 8-instrument support):
 *
 * Original 6 pairs (4-instrument v1.0):
 *   bass_drums      → rhythmic  (pocket line)
 *   guitar_keyboard → melodic   (harmonic conversation)
 *   bass_guitar     → support
 *   bass_keyboard   → support
 *   drums_guitar    → support
 *   drums_keyboard  → support
 *
 * New 22 pairs (v1.1 additions):
 *   bass + new instruments, drums + new instruments, cross-melodic pairs
 */
export const EDGE_TYPE: Record<string, EdgeType> = {
  bass_drums:      'rhythmic',
  guitar_keyboard: 'melodic',
  bass_guitar:     'support',
  bass_keyboard:   'support',
  drums_guitar:    'support',
  drums_keyboard:  'support',

  // --- New instrument pairs (v1.1 — 8-instrument support) ---

  // Bass + new instruments (support — bass anchors rhythm section)
  bass_saxophone:   'support',
  bass_trombone:    'support',
  bass_trumpet:     'support',
  bass_vibes:       'support',

  // Drums + new instruments (support — drums + front line)
  drums_saxophone:  'support',
  drums_trombone:   'support',
  drums_trumpet:    'support',
  drums_vibes:      'support',

  // Keyboard + new instruments
  keyboard_saxophone:  'melodic',
  keyboard_trombone:   'support',
  keyboard_trumpet:    'melodic',
  keyboard_vibes:      'melodic',

  // Guitar + new instruments
  guitar_saxophone:    'melodic',
  guitar_trombone:     'support',
  guitar_trumpet:      'melodic',
  guitar_vibes:        'melodic',

  // Front-line horn pairs (melodic — core jazz voicing)
  saxophone_trombone:  'melodic',
  saxophone_trumpet:   'melodic',
  trumpet_trombone:    'melodic',

  // Vibes + front line
  saxophone_vibes:     'melodic',
  trombone_vibes:      'support',
  trumpet_vibes:       'melodic',
};
