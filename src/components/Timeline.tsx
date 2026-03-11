/**
 * Timeline.tsx — Playback position scrubber and click-to-seek.
 *
 * - Updates at ~10fps via setInterval to show current position
 * - Displays "MM:SS / MM:SS" time readout
 * - Progress bar fills proportionally
 * - Click-to-seek: on click, calculates targetTime from click position,
 *   stops current source if playing and recreates from target offset
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { getCurrentPosition, connectSourceToGraph } from '../audio/AudioEngine';
import { useAppStore } from '../store/useAppStore';

interface TimelineProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Timeline({ audioStateRef }: TimelineProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const { setCurrentTime: storeSetCurrentTime } = useAppStore();
  const duration = audioStateRef.current.transport.duration;

  // Poll position at ~10fps for smooth-enough display
  useEffect(() => {
    const id = setInterval(() => {
      const state = audioStateRef.current;
      if (!state.audioCtx) return;

      const position = getCurrentPosition(state.audioCtx, state.transport);
      setCurrentTime(position);
      storeSetCurrentTime(position);
    }, 100);

    return () => clearInterval(id);
  }, [audioStateRef, storeSetCurrentTime]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const state = audioStateRef.current;
      const { audioCtx, transport, smoothedAnalyser, rawAnalyser } = state;

      if (!audioCtx || !transport.buffer || !smoothedAnalyser || !rawAnalyser) return;

      const bar = barRef.current;
      if (!bar) return;

      const rect = bar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
      const targetTime = ratio * transport.duration;

      // Stop current playback if active
      const wasPlaying = transport.isPlaying;
      if (wasPlaying && transport.sourceNode) {
        try {
          transport.sourceNode.stop();
        } catch {
          // ignore if already stopped
        }
        transport.sourceNode.disconnect();
        state.transport.sourceNode = null;
        state.transport.isPlaying = false;
      }

      // Update pause offset to target
      state.transport.pauseOffset = targetTime;

      // If we were playing, restart from new position
      if (wasPlaying) {
        const source = audioCtx.createBufferSource();
        source.buffer = transport.buffer;
        connectSourceToGraph(audioCtx, source, smoothedAnalyser, rawAnalyser);

        const startTime = audioCtx.currentTime;
        source.start(0, targetTime);

        source.addEventListener('ended', () => {
          if (audioStateRef.current.transport.sourceNode === source) {
            audioStateRef.current.transport.isPlaying = false;
            audioStateRef.current.transport.pauseOffset = 0;
            audioStateRef.current.transport.sourceNode = null;
          }
        });

        state.transport.sourceNode = source;
        state.transport.startTime = startTime;
        state.transport.isPlaying = true;
      }

      setCurrentTime(targetTime);
      console.log(`[Timeline] Seeked to ${targetTime.toFixed(3)}s (was playing: ${wasPlaying})`);
    },
    [audioStateRef]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 w-full px-4">
      {/* Time readout */}
      <div className="flex justify-between text-xs font-mono" style={{ color: '#a78bfa' }}>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Scrubber bar — clickable */}
      <div
        ref={barRef}
        onClick={handleSeek}
        className="w-full rounded-full cursor-pointer relative"
        style={{
          height: '48px',
          backgroundColor: '#13131f',
          border: '1px solid rgba(99,102,241,0.3)',
        }}
        role="slider"
        aria-label="Playback position"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
      >
        {/* Progress fill */}
        <div
          className="h-full rounded-full transition-none"
          style={{
            width: `${progress}%`,
            backgroundColor: 'rgba(99,102,241,0.5)',
            pointerEvents: 'none',
          }}
        />

        {/* Playhead dot */}
        {duration > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(${progress}% - 8px)`,
              width: '16px',
              height: '16px',
              backgroundColor: '#818cf8',
              boxShadow: '0 0 6px rgba(129,140,248,0.8)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
