/**
 * NodeLayout.ts — Instrument node position layout engine.
 *
 * Computes fractional [0,1] canvas positions for a given number of instrument
 * nodes. Positions are computed once and cached by CanvasRenderer — only
 * recomputed on resize (positions are fractional so the values are identical,
 * but explicit recomputation ensures future layout changes propagate).
 *
 * INSTRUMENT_ORDER maps node indices to instrument names for the default quartet
 * diamond layout: [0]=top, [1]=left, [2]=right, [3]=bottom
 * Bass (bottom) and drums (left) are adjacent — the Phase 6 pocket line
 * connects them for the rhythm-section relationship.
 *
 * Note: CanvasRenderer now uses its own instrumentOrder derived from the lineup
 * passed at construction time. INSTRUMENT_ORDER here represents the default
 * quartet layout and is kept for backward compatibility.
 */

/**
 * Fractional canvas position: x and y in [0, 1] relative to logical canvas dims.
 * Multiply by canvas width/height to get pixel coordinates.
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Instrument order for the default diamond layout.
 * Index maps directly to the NodePosition array returned by computeNodePositions(4).
 *   0 = top    → guitar
 *   1 = left   → drums
 *   2 = right  → keyboard
 *   3 = bottom → bass
 *
 * Bass (bottom) and drums (left) are adjacent, enabling the Phase 6 pocket line.
 *
 * @deprecated CanvasRenderer now uses its own instrumentOrder derived from the
 * lineup passed at construction time. This constant represents the default quartet
 * layout only. Use buildPairs() and computeNodePositions() with lineup.length.
 */
export const INSTRUMENT_ORDER: string[] = ['guitar', 'drums', 'keyboard', 'bass'];

/** Tuple: [indexA, indexB, edgeKey] for each non-pocket instrument pair. */
export type PairTuple = [number, number, string];

/**
 * Generates all non-pocket pair tuples from any instrument list.
 *
 * Produces one [idxA, idxB, key] entry for each unique (i, j) pair where i < j,
 * excluding the bass_drums pocket line (handled by drawPocketLine).
 * The key uses canonical alphabetical ordering of instrument names.
 *
 * @param instrumentOrder - Array of instrument name strings for the current lineup
 * @returns Array of [indexA, indexB, pairKey] tuples for communication edges
 */
export function buildPairs(instrumentOrder: string[]): PairTuple[] {
  const n = instrumentOrder.length;
  const pairs: PairTuple[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = instrumentOrder[i];
      const b = instrumentOrder[j];
      const [nameA, nameB] = a < b ? [a, b] : [b, a];
      const key = `${nameA}_${nameB}`;
      if (key === 'bass_drums') continue; // pocket line handled separately
      pairs.push([i, j, key]);
    }
  }
  return pairs;
}

/**
 * Computes node positions for 2-8 instruments with bass-center layout.
 *
 * Convention: position[0] = canvas center (for bass). Positions[1..n-1] =
 * elliptical ring around center. CanvasRenderer must reorder its instrumentOrder
 * to put bass at index 0 before calling this function.
 *
 * Ring uses aspect-corrected radii (rx=0.34, ry=0.17) for true visual circularity
 * on the 2:1 aspect ratio canvas (800x400 logical pixels).
 *
 * When bass is absent: CanvasRenderer does NOT reorder, so position[0] just maps
 * to the first instrument in the lineup. The center position still works visually —
 * it becomes a non-bass anchor at center.
 *
 * @param count - Number of nodes (2 | 3 | 4 | 5 | 6 | 7 | 8)
 * @returns Array of fractional [0,1] positions, one per node
 */
export function computeNodePositions(count: 2 | 3 | 4 | 5 | 6 | 7 | 8): NodePosition[] {
  // Position 0 = center (bass slot). CanvasRenderer reorders bass to index 0.
  // Positions 1..count-1 = elliptical ring around center.
  // Ring uses aspect-corrected radii: rx=0.34, ry=0.17 for true visual circle on 800x400 canvas.

  if (count === 2) {
    // Special case: center + one peer offset to the right (no ring needed)
    return [
      { x: 0.50, y: 0.50 },  // center (bass)
      { x: 0.75, y: 0.50 },  // peer
    ];
  }

  // General case: center + (count-1) instruments on elliptical ring
  const positions: NodePosition[] = [{ x: 0.50, y: 0.50 }]; // center (bass)
  const ringCount = count - 1;

  // Aspect-corrected radii for true visual circle on 2:1 canvas
  // rx=0.34 gives 272px on 800px canvas; ry=0.17 gives 68px on 400px canvas (68*2=136px visual)
  // At 320px iOS width: rx*320=109px, adjacent gap at 7 nodes ≈ 97px center-to-center — readable
  const rx = 0.34;
  const ry = 0.17;

  for (let k = 0; k < ringCount; k++) {
    const angle = (2 * Math.PI * k / ringCount) - Math.PI / 2; // start at top (12 o'clock)
    positions.push({
      x: 0.50 + rx * Math.cos(angle),
      y: 0.50 + ry * Math.sin(angle),
    });
  }

  return positions;
}
