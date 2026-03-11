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
import { INSTRUMENT_ORDER } from '../canvas/nodes/NodeLayout';
import { useAppStore } from '../store/useAppStore';

interface VisualizerCanvasProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
  /** Called once when the canvas element mounts. Used by App.tsx for PNG export. */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export function VisualizerCanvas({ audioStateRef, onCanvasReady }: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Notify parent that the canvas element is available (e.g. for PNG export)
    onCanvasReady?.(canvas);

    // Create renderer — starts rAF loop immediately
    const renderer = new CanvasRenderer(canvas, audioStateRef);
    rendererRef.current = renderer;

    // Wire role change callback — pushes role label updates to Zustand for UI consumption.
    // Only fires when role actually changes (not every tick), so Zustand re-renders are minimal.
    renderer.setOnRoleChange((instrument, role) => {
      useAppStore.getState().setInstrumentRole(instrument, role);
    });

    // Wire chord change callback — pushes chord/tension updates to Zustand for UI consumption.
    // Only fires when displayedChordIdx changes (not every tick), so Zustand re-renders are minimal.
    renderer.setOnChordChange((chord, confidence, fn, _tension, chordIdx) => {
      useAppStore.getState().setChordInfo(chord, confidence, fn, chordIdx);
    });

    // Wire per-tick tension update — keeps ChordDisplay tension readout smooth
    renderer.setOnTensionUpdate((tension) => {
      useAppStore.getState().setTension(tension);
    });

    // Wire beat update callback — pushes BPM, pocket score, and timing offset to Zustand
    // Only fires when BPM or pocket score actually changes (not every tick)
    renderer.setOnBeatUpdate((bpm, pocket, offset) => {
      useAppStore.getState().setBeatInfo(bpm, pocket, offset);
    });

    // Wire melody update callback — pushes keyboard/guitar melodic state to Zustand (Phase 8)
    // Fires every tick when pitch state is initialized (keyboard+guitar in lineup).
    // callResponse is non-null only when a call-and-response event is detected (MEL-03).
    renderer.setOnMelodyUpdate((kbMelodic, gtMelodic, callResponse) => {
      useAppStore.getState().setMelodyState(kbMelodic, gtMelodic);
      if (callResponse !== null) {
        useAppStore.getState().addCallResponseEntry(callResponse);
      }
    });

    // Resize observer keeps HiDPI scaling correct when element resizes
    const observer = new ResizeObserver(() => {
      renderer.resize();
    });
    observer.observe(canvas);

    // Click handler — detect which node was clicked (if any) and update selectedInstrument in Zustand
    const handleCanvasClick = (e: MouseEvent) => {
      const r = rendererRef.current;
      if (!r) return;

      const { positions } = r.getNodeLayout();
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      // Convert CSS pixels to fractional canvas coordinates [0,1]
      const fx = clickX / rect.width;
      const fy = clickY / rect.height;

      const hitRadius = 0.06; // ~48px on 800px canvas
      for (let i = 0; i < positions.length; i++) {
        const dx = fx - positions[i].x;
        const dy = fy - positions[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          useAppStore.getState().setSelectedInstrument(INSTRUMENT_ORDER[i]);
          return;
        }
      }
      // Clicked outside all nodes — close detail panel
      useAppStore.getState().setSelectedInstrument(null);
    };

    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
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
