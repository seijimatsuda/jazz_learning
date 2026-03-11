/**
 * VisualizerCanvas.tsx — React component wrapping the canvas element.
 *
 * Responsibilities:
 * - Renders the <canvas> element with a fixed aspect ratio
 * - Creates CanvasRenderer on mount, destroys on unmount
 * - Handles resize via ResizeObserver so HiDPI stays correct at all sizes
 * - Receives audioStateRef as a prop (no React state access in animation loop)
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { CanvasRenderer } from '../canvas/CanvasRenderer';

interface VisualizerCanvasProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

export function VisualizerCanvas({ audioStateRef }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create renderer — starts rAF loop immediately
    const renderer = new CanvasRenderer(canvas, audioStateRef);
    rendererRef.current = renderer;

    // Resize observer keeps HiDPI scaling correct when element resizes
    const observer = new ResizeObserver(() => {
      renderer.resize();
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [audioStateRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '400px',
        display: 'block',
        borderRadius: '12px',
        border: '1px solid rgba(99,102,241,0.25)',
        backgroundColor: '#0a0a0f',
      }}
      aria-label="Jazz frequency visualizer"
    />
  );
}
