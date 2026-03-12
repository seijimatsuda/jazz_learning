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
 * Computes node positions for 2-8 instruments.
 *
 * Cases 2-4 use hand-tuned coordinates optimized for the 2:1 aspect ratio canvas.
 * Cases 5-8 use pre-computed grid/cluster positions filling the canvas area.
 *
 * @param count - Number of nodes (2 | 3 | 4 | 5 | 6 | 7 | 8)
 * @returns Array of fractional [0,1] positions, one per node
 */
export function computeNodePositions(count: 2 | 3 | 4 | 5 | 6 | 7 | 8): NodePosition[] {
  switch (count) {
    case 2:
      // Horizontal pair — side by side
      return [
        { x: 0.30, y: 0.50 },
        { x: 0.70, y: 0.50 },
      ];
    case 3:
      // Triangle — one on top, two on the bottom row
      return [
        { x: 0.50, y: 0.25 },
        { x: 0.28, y: 0.68 },
        { x: 0.72, y: 0.68 },
      ];
    case 4:
      // Diamond — top, left, right, bottom
      // Maps to INSTRUMENT_ORDER: guitar(top), drums(left), keyboard(right), bass(bottom)
      return [
        { x: 0.50, y: 0.20 }, // top    → guitar
        { x: 0.22, y: 0.50 }, // left   → drums
        { x: 0.78, y: 0.50 }, // right  → keyboard
        { x: 0.50, y: 0.80 }, // bottom → bass
      ];
    case 5:
      return [
        { x: 0.50, y: 0.18 },
        { x: 0.22, y: 0.42 },
        { x: 0.78, y: 0.42 },
        { x: 0.32, y: 0.78 },
        { x: 0.68, y: 0.78 },
      ];
    case 6:
      return [
        { x: 0.20, y: 0.25 },
        { x: 0.50, y: 0.25 },
        { x: 0.80, y: 0.25 },
        { x: 0.20, y: 0.75 },
        { x: 0.50, y: 0.75 },
        { x: 0.80, y: 0.75 },
      ];
    case 7:
      return [
        { x: 0.20, y: 0.22 },
        { x: 0.50, y: 0.22 },
        { x: 0.80, y: 0.22 },
        { x: 0.12, y: 0.72 },
        { x: 0.37, y: 0.72 },
        { x: 0.63, y: 0.72 },
        { x: 0.88, y: 0.72 },
      ];
    case 8:
      return [
        { x: 0.12, y: 0.25 },
        { x: 0.37, y: 0.25 },
        { x: 0.63, y: 0.25 },
        { x: 0.88, y: 0.25 },
        { x: 0.12, y: 0.75 },
        { x: 0.37, y: 0.75 },
        { x: 0.63, y: 0.75 },
        { x: 0.88, y: 0.75 },
      ];
  }
}
