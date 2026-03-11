/**
 * Timeline.tsx — Playback position scrubber and click-to-seek.
 *
 * - Updates at ~10fps via setInterval to show current position
 * - Displays "MM:SS / MM:SS" time readout
 * - Progress bar fills proportionally
 * - Click-to-seek: delegates to useSeek hook
 * - Bar/beat grid overlay: renders vertical tick marks when BPM is detected
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { getCurrentPosition } from '../audio/AudioEngine';
import { useAppStore } from '../store/useAppStore';
import { tensionToColor } from '../audio/TensionHeatmap';
import { useSeek } from '../hooks/useSeek';
import type { Annotation } from '../store/useAppStore';

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
  const [beatGrid, setBeatGrid] = useState<{ bpm: number; lastDownbeatSec: number } | null>(null);
  const [annotationInput, setAnnotationInput] = useState<{ timeSec: number; leftPct: number } | null>(null);
  const [annotationText, setAnnotationText] = useState('');
  const barRef = useRef<HTMLDivElement>(null);
  const { setCurrentTime: storeSetCurrentTime } = useAppStore();
  const isFileLoaded = useAppStore(s => s.isFileLoaded);
  const annotations = useAppStore(s => s.annotations);
  const addAnnotation = useAppStore(s => s.addAnnotation);
  const duration = audioStateRef.current.transport.duration;
  const tensionHeatmap = audioStateRef.current.tensionHeatmap;

  const { seekTo } = useSeek(audioStateRef);

  // Poll position at ~10fps for smooth-enough display
  useEffect(() => {
    const id = setInterval(() => {
      const state = audioStateRef.current;
      if (!state.audioCtx) return;

      const position = getCurrentPosition(state.audioCtx, state.transport);
      setCurrentTime(position);
      storeSetCurrentTime(position);

      const beat = state.beat;
      if (beat && beat.bpm !== null && beat.lastDownbeatSec > 0) {
        setBeatGrid((prev) => {
          if (
            prev &&
            prev.bpm === beat.bpm &&
            Math.abs(prev.lastDownbeatSec - beat.lastDownbeatSec) < 0.01
          )
            return prev;
          return { bpm: beat.bpm as number, lastDownbeatSec: beat.lastDownbeatSec };
        });
      } else {
        setBeatGrid(null);
      }
    }, 100);

    return () => clearInterval(id);
  }, [audioStateRef, storeSetCurrentTime]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(clickX / rect.width, 1));
      const targetTime = ratio * duration;

      if (e.shiftKey && isFileLoaded) {
        // Annotation mode — open text input overlay, do not seek
        setAnnotationInput({ timeSec: targetTime, leftPct: ratio * 100 });
        setAnnotationText('');
        return;
      }

      seekTo(targetTime);
      setCurrentTime(targetTime);
    },
    [seekTo, duration, isFileLoaded]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 w-full px-4">
      {/* Time readout */}
      <div className="flex justify-between text-xs font-mono" style={{ color: '#a78bfa' }}>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Scrubber bar wrapper — relative for annotation overlay positioning */}
      <div className="relative w-full">

      {/* Annotation input overlay — outside overflow-hidden bar */}
      {annotationInput && (
        <div
          style={{
            position: 'absolute',
            left: `${annotationInput.leftPct}%`,
            bottom: '100%',
            marginBottom: '6px',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
          className="bg-[#1a1a2e] border border-amber-500/50 rounded px-2 py-1 flex gap-1"
        >
          <input
            type="text"
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && annotationText.trim()) {
                addAnnotation(annotationInput.timeSec, annotationText.trim());
                setAnnotationInput(null);
                setAnnotationText('');
              }
              if (e.key === 'Escape') {
                setAnnotationInput(null);
                setAnnotationText('');
              }
            }}
            autoFocus
            placeholder="Add note..."
            className="bg-transparent text-white text-xs outline-none w-32"
          />
          <button
            onClick={() => {
              if (annotationText.trim()) {
                addAnnotation(annotationInput.timeSec, annotationText.trim());
                setAnnotationInput(null);
                setAnnotationText('');
              }
            }}
            className="text-amber-400 text-xs hover:text-amber-300"
          >
            +
          </button>
        </div>
      )}

      {/* Scrubber bar — clickable */}
      <div
        ref={barRef}
        onClick={handleSeek}
        className="w-full rounded-full cursor-pointer relative overflow-hidden"
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
        {/* Tension heatmap — rendered as colored segments behind the scrubber */}
        {tensionHeatmap && tensionHeatmap.length > 0 && (
          <div
            className="absolute inset-0 flex"
            style={{ pointerEvents: 'none', borderRadius: 'inherit' }}
            aria-hidden="true"
          >
            {Array.from(tensionHeatmap).map((t, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: tensionToColor(t),
                  opacity: 0.55,
                }}
              />
            ))}
          </div>
        )}

        {/* Bar/beat grid overlay — only renders when BPM is detected */}
        {beatGrid && duration > 0 && (
          <div
            className="absolute inset-0"
            style={{ pointerEvents: 'none', zIndex: 0 }}
            aria-hidden="true"
          >
            {(() => {
              const { bpm, lastDownbeatSec } = beatGrid;
              const beatInterval = 60 / bpm;
              const ticks: JSX.Element[] = [];
              let firstBeat = lastDownbeatSec;
              while (firstBeat > beatInterval) firstBeat -= beatInterval;
              while (firstBeat < 0) firstBeat += beatInterval;
              for (let t = firstBeat; t <= duration; t += beatInterval) {
                const pct = (t / duration) * 100;
                const beatsFromDownbeat = Math.round((t - lastDownbeatSec) / beatInterval);
                const isBarLine = beatsFromDownbeat % 4 === 0;
                ticks.push(
                  <div
                    key={t.toFixed(4)}
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: isBarLine ? '0' : '30%',
                      bottom: '0',
                      width: isBarLine ? '2px' : '1px',
                      backgroundColor: isBarLine
                        ? 'rgba(255,255,255,0.25)'
                        : 'rgba(255,255,255,0.1)',
                    }}
                  />
                );
              }
              return ticks;
            })()}
          </div>
        )}

        {/* Progress fill */}
        <div
          className="h-full transition-none"
          style={{
            width: `${progress}%`,
            backgroundColor: 'rgba(99,102,241,0.45)',
            pointerEvents: 'none',
            position: 'relative',
            zIndex: 1,
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

        {/* Annotation markers */}
        {annotations.map((ann: Annotation) => {
          const pct = duration > 0 ? (ann.timeSec / duration) * 100 : 0;
          return (
            <div
              key={ann.id}
              title={ann.text}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                bottom: 0,
                width: '3px',
                backgroundColor: '#f59e0b',
                opacity: 0.8,
                cursor: 'pointer',
                zIndex: 2,
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          );
        })}

      </div>
      </div>

      {/* Shift+click hint */}
      {isFileLoaded && !annotationInput && (
        <div className="text-xs text-center" style={{ color: 'rgba(167,139,250,0.4)' }}>
          Shift+click to annotate
        </div>
      )}
    </div>
  );
}
