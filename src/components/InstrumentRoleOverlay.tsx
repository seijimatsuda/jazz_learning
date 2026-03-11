/**
 * InstrumentRoleOverlay.tsx — Minimal Phase 2 gap closure component.
 *
 * Displays per-instrument role labels and activity scores read from
 * Zustand (roles) and audioStateRef (activity scores).
 *
 * TEMPORARY: This component will be replaced entirely by Phase 5
 * (Canvas Node Graph) which renders instrument nodes with role-based
 * visuals directly on the canvas.
 */

import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { AudioStateRef } from '../audio/types';

interface InstrumentRoleOverlayProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

const INSTRUMENT_ORDER = ['bass', 'drums', 'keyboard', 'guitar'] as const;

type RoleStyle = {
  bg: string;
  color: string;
};

function getRoleStyle(role: string): RoleStyle {
  switch (role) {
    case 'soloing':
      return { bg: '#f59e0b', color: '#000000' };
    case 'comping':
      return { bg: '#3b82f6', color: '#ffffff' };
    case 'holding':
      return { bg: '#6b7280', color: '#ffffff' };
    case 'silent':
      return { bg: '#1f2937', color: '#6b7280' };
    default:
      return { bg: '#1f2937', color: '#6b7280' };
  }
}

function getRoleFillColor(role: string): string {
  switch (role) {
    case 'soloing':
      return '#f59e0b';
    case 'comping':
      return '#3b82f6';
    case 'holding':
      return '#6b7280';
    case 'silent':
      return '#374151';
    default:
      return '#374151';
  }
}

export function InstrumentRoleOverlay({ audioStateRef }: InstrumentRoleOverlayProps) {
  const instrumentRoles = useAppStore((s) => s.instrumentRoles);
  const [activityScores, setActivityScores] = useState<Record<string, number>>({});

  // Poll audioStateRef.current.analysis.instruments at ~10fps for activity scores.
  // Scores change every tick — reading from ref instead of Zustand avoids
  // continuous Zustand mutations for high-frequency numeric data.
  useEffect(() => {
    const interval = setInterval(() => {
      const instruments = audioStateRef.current.analysis?.instruments;
      if (!instruments) return;

      const scores: Record<string, number> = {};
      for (const inst of instruments) {
        scores[inst.instrument] = inst.activityScore;
      }
      setActivityScores(scores);
    }, 100);

    return () => clearInterval(interval);
  }, [audioStateRef]);

  return (
    // Phase 2 gap closure — replaced by Phase 5 Canvas Node Graph
    <div
      className="w-full mt-4"
      style={{ fontFamily: 'inherit' }}
    >
      <div className="flex gap-4 w-full">
        {INSTRUMENT_ORDER.map((instrument) => {
          const role = instrumentRoles[instrument] ?? '';
          const activityScore = activityScores[instrument] ?? 0;
          const roleStyle = getRoleStyle(role);
          const fillColor = getRoleFillColor(role);
          const displayLabel = role || '---';

          return (
            <div
              key={instrument}
              className="flex-1 flex flex-col gap-2 rounded-lg"
              style={{
                backgroundColor: '#13131f',
                border: '1px solid rgba(99,102,241,0.3)',
                padding: '12px 16px',
              }}
            >
              {/* Instrument name */}
              <span
                className="font-medium text-sm text-white"
                style={{ textTransform: 'capitalize' }}
              >
                {instrument}
              </span>

              {/* Role label badge */}
              <span
                className="text-xs font-semibold rounded-full px-2 py-0.5 self-start"
                style={{
                  backgroundColor: roleStyle.bg,
                  color: roleStyle.color,
                  letterSpacing: '0.02em',
                }}
              >
                {displayLabel}
              </span>

              {/* Activity bar */}
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${activityScore * 100}%`,
                    height: '100%',
                    backgroundColor: fillColor,
                    borderRadius: '2px',
                    transition: 'width 80ms linear',
                  }}
                />
              </div>

              {/* Activity score numeric */}
              <span
                className="text-xs text-right"
                style={{ color: '#9ca3af' }}
              >
                {activityScore.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
