import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { connectSourceToGraph } from '../audio/AudioEngine';

export function useSeek(audioStateRef: MutableRefObject<AudioStateRef>): {
  seekTo: (timeSec: number) => void;
} {
  const seekTo = useCallback((timeSec: number) => {
    const state = audioStateRef.current;
    const { audioCtx, transport, smoothedAnalyser, rawAnalyser } = state;
    if (!audioCtx || !transport.buffer || !smoothedAnalyser || !rawAnalyser) return;

    const targetTime = Math.max(0, Math.min(timeSec, transport.duration));
    const wasPlaying = transport.isPlaying;

    if (wasPlaying && transport.sourceNode) {
      try { transport.sourceNode.stop(); } catch { /* already stopped */ }
      transport.sourceNode.disconnect();
      state.transport.sourceNode = null;
      state.transport.isPlaying = false;
    }

    state.transport.pauseOffset = targetTime;

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
  }, [audioStateRef]);

  return { seekTo };
}
