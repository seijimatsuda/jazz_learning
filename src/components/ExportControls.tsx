import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { useAppStore } from '../store/useAppStore';

interface ExportControlsProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

// Detect iOS Safari — a.download is unsupported; use window.open instead
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;

/**
 * triggerDownload — cross-platform file download helper.
 * On iOS Safari, a.download is not supported so we open in a new tab instead.
 */
function triggerDownload(url: string, filename: string) {
  if (isIOS) {
    window.open(url, '_blank');
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * exportSessionJSON — serializes all analysis data and annotations to a JSON file.
 * Reads from both audioStateRef (audio hot-path data) and Zustand store (UI state).
 */
function exportSessionJSON(audioStateRef: MutableRefObject<AudioStateRef>) {
  const state = audioStateRef.current;
  const store = useAppStore.getState();

  const payload = {
    exportedAt: new Date().toISOString(),
    fileName: store.fileName,
    duration: state.transport.duration,
    detectedKey: store.detectedKey,
    detectedKeyMode: store.detectedKeyMode,
    currentBpm: store.currentBpm,
    chordLog: state.chord?.chordLog ?? [],
    callResponseLog: store.callResponseLog,
    tensionHeatmap: state.tensionHeatmap ? Array.from(state.tensionHeatmap) : [],
    annotations: store.annotations,
    pocketScore: store.pocketScore,
    timingOffsetMs: store.timingOffsetMs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `jazz-session-${Date.now()}.json`);
  // Revoke after short delay to allow download to start
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * exportCanvasPNG — captures the visualizer canvas as a PNG image.
 */
function exportCanvasPNG(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `jazz-visualizer-${Date.now()}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
}

/**
 * ExportControls — Export JSON session data and PNG canvas screenshot.
 * Only enabled when a file is loaded.
 */
export function ExportControls({ audioStateRef, canvasRef }: ExportControlsProps) {
  const isFileLoaded = useAppStore((s) => s.isFileLoaded);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => exportSessionJSON(audioStateRef)}
          disabled={!isFileLoaded}
          className="
            px-3 py-1.5
            rounded text-sm font-medium text-white
            transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-indigo-400
          "
          style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
          onMouseEnter={(e) => {
            if (isFileLoaded) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(99,102,241,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1a1a2e';
          }}
          aria-label="Export session as JSON"
        >
          Export JSON
        </button>

        <button
          onClick={() => exportCanvasPNG(canvasRef.current)}
          disabled={!isFileLoaded}
          className="
            px-3 py-1.5
            rounded text-sm font-medium text-white
            transition-all duration-150
            disabled:opacity-40 disabled:cursor-not-allowed
            focus:outline-none focus:ring-2 focus:ring-indigo-400
          "
          style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
          onMouseEnter={(e) => {
            if (isFileLoaded) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(99,102,241,0.2)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1a1a2e';
          }}
          aria-label="Export visualizer as PNG"
        >
          Export PNG
        </button>
      </div>

      {/* iOS note — visible on iOS devices to explain the different download behavior */}
      {isIOS && isFileLoaded && (
        <p className="text-xs" style={{ color: '#6b7280' }}>
          iOS: file will open in new tab
        </p>
      )}
    </div>
  );
}
