/**
 * TransportControls.tsx — Play / Pause button for audio playback.
 *
 * Manages AudioBufferSourceNode lifecycle:
 *   Play:  Creates new source, calls connectSourceToGraph, starts from pauseOffset
 *   Pause: Computes elapsed time, updates pauseOffset, stops and cleans up source
 *
 * AudioBufferSourceNodes are single-use (can only call .start() once). A new
 * node must be created for each play call.
 *
 * Disabled while calibration is running.
 */

import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { connectSourceToGraph } from '../audio/AudioEngine';
import { useAppStore } from '../store/useAppStore';

interface TransportControlsProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

export function TransportControls({ audioStateRef }: TransportControlsProps) {
  const isCalibrating = useAppStore((s) => s.isCalibrating);
  const isFileLoaded = useAppStore((s) => s.isFileLoaded);
  const isCalibrated = audioStateRef.current.isCalibrated;

  // Use a render-triggering flag: we need the button label to update.
  // We rely on a force-re-render pattern via the store's currentTime updates,
  // but for immediate play/pause label we track a local state via the transport ref.
  // The Timeline's setInterval drives re-renders at 10fps, which is sufficient.
  // For instant feedback we read transport state directly on render.
  const transport = audioStateRef.current.transport;
  const isPlaying = transport.isPlaying;

  const disabled = isCalibrating || !isFileLoaded || !isCalibrated;

  function handlePlay() {
    const state = audioStateRef.current;
    const { audioCtx, transport, smoothedAnalyser, rawAnalyser } = state;

    if (!audioCtx || !transport.buffer || !smoothedAnalyser || !rawAnalyser) {
      console.warn('[TransportControls] Cannot play — audio state not initialized.');
      return;
    }

    if (transport.isPlaying) return;

    // AudioContext may be suspended on iOS after tab background
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((err) => console.error('[TransportControls] resume failed:', err));
    }

    // AudioBufferSourceNodes are single-use — create a fresh one each play
    const source = audioCtx.createBufferSource();
    source.buffer = transport.buffer;

    // Connect: source → smoothed → destination, source → raw (silent tap)
    connectSourceToGraph(audioCtx, source, smoothedAnalyser, rawAnalyser);

    // Start from saved offset (0 on first play, or wherever we paused)
    const offset = Math.min(transport.pauseOffset, transport.duration);
    const startTime = audioCtx.currentTime;

    source.start(0, offset);

    // Handle natural end of track
    source.addEventListener('ended', () => {
      // Only clean up if this is still the active source (not a seek that replaced it)
      if (audioStateRef.current.transport.sourceNode === source) {
        audioStateRef.current.transport.isPlaying = false;
        audioStateRef.current.transport.pauseOffset = 0;
        audioStateRef.current.transport.sourceNode = null;
      }
    });

    // Update transport state on the ref
    state.transport.sourceNode = source;
    state.transport.startTime = startTime;
    state.transport.isPlaying = true;

    console.log(`[TransportControls] Playing from offset ${offset.toFixed(3)}s`);
  }

  function handlePause() {
    const state = audioStateRef.current;
    const { audioCtx, transport } = state;

    if (!audioCtx || !transport.isPlaying || !transport.sourceNode) return;

    // Compute elapsed time and save as new pauseOffset
    const elapsed = audioCtx.currentTime - transport.startTime;
    const newOffset = Math.min(transport.pauseOffset + elapsed, transport.duration);

    state.transport.pauseOffset = newOffset;
    state.transport.isPlaying = false;

    try {
      transport.sourceNode.stop();
    } catch {
      // May already be stopped if track ended naturally
    }

    transport.sourceNode.disconnect();
    state.transport.sourceNode = null;

    console.log(`[TransportControls] Paused at ${newOffset.toFixed(3)}s`);
  }

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Play button */}
      <button
        onClick={handlePlay}
        disabled={disabled || isPlaying}
        className="
          w-14 h-14
          rounded-full
          text-white text-xl
          font-bold
          transition-all duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-indigo-400
        "
        style={{
          backgroundColor: disabled || isPlaying ? '#1e1e2e' : '#4f46e5',
          border: '1px solid rgba(99,102,241,0.5)',
        }}
        aria-label="Play"
        title="Play"
      >
        ▶
      </button>

      {/* Pause button */}
      <button
        onClick={handlePause}
        disabled={disabled || !isPlaying}
        className="
          w-14 h-14
          rounded-full
          text-white text-xl
          font-bold
          transition-all duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-indigo-400
        "
        style={{
          backgroundColor: disabled || !isPlaying ? '#1e1e2e' : '#4f46e5',
          border: '1px solid rgba(99,102,241,0.5)',
        }}
        aria-label="Pause"
        title="Pause"
      >
        ⏸
      </button>
    </div>
  );
}
