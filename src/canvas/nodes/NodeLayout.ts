/**
 * NodeLayout.ts — Instrument node position layout engine.
 *
 * Computes fractional [0,1] canvas positions for a given number of instrument
 * nodes. Positions are computed once and cached by CanvasRenderer — only
 * recomputed on resize (positions are fractional so the values are identical,
 * but explicit recomputation ensures future layout changes propagate).
 *
 * INSTRUMENT_ORDER maps node indices to instrument names for the diamond layout:
 *   [0]=top, [1]=left, [2]=right, [3]=bottom
 * Bass (bottom) and drums (left) are adjacent — the Phase 6 pocket line
 * connects them for the rhythm-section relationship.
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
 * Instrument order for the diamond layout.
 * Index maps directly to the NodePosition array returned by computeNodePositions(4).
 *   0 = top    → guitar
 *   1 = left   → drums
 *   2 = right  → keyboard
 *   3 = bottom → bass
 *
 * Bass (bottom) and drums (left) are adjacent, enabling the Phase 6 pocket line.
 */
export const INSTRUMENT_ORDER: string[] = ['guitar', 'drums', 'keyboard', 'bass'];

/**
 * Computes node positions for 2, 3, or 4 instruments.
 *
 * @param count - Number of nodes (2 | 3 | 4)
 * @returns Array of fractional [0,1] positions, one per node
 */
export function computeNodePositions(count: 2 | 3 | 4): NodePosition[] {
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
  }
}
