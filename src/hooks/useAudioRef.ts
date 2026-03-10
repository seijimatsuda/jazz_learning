import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import { type AudioStateRef, createInitialAudioState } from '../audio/types';

/**
 * useAudioRef — stable ref for all audio state.
 *
 * Rules:
 * - NEVER triggers React re-renders (it's a ref, not state)
 * - Web Audio objects (AudioContext, AnalyserNode, AudioBuffer) are non-serializable
 *   and must not live in Zustand or React state
 * - Animation loop reads this ref at 60fps without going through React
 */
export function useAudioRef(): MutableRefObject<AudioStateRef> {
  return useRef<AudioStateRef>(createInitialAudioState());
}
