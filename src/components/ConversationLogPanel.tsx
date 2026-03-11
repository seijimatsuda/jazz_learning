/**
 * ConversationLogPanel.tsx — Expandable conversation log drawer.
 *
 * Renders below ChordLogPanel as an expandable drawer. Each entry shows:
 *   - timestamp (MM:SS.s) of the call moment
 *   - direction label: "KB calls → GT responds"
 *   - gap duration in seconds
 *
 * Entries are sorted most-recent-first. Clicking an entry seeks playback
 * to the call timestamp (entry.callSec).
 *
 * Unlike ChordLogPanel, no polling is needed — callResponseLog in Zustand
 * is updated by discrete events (not continuous high-frequency data), so
 * the component subscribes directly via useAppStore selector.
 */

import { useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStateRef } from '../audio/types';
import { useSeek } from '../hooks/useSeek';
import { useAppStore } from '../store/useAppStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConversationLogPanelProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

export function ConversationLogPanel({ audioStateRef }: ConversationLogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { seekTo } = useSeek(audioStateRef);

  // Subscribe directly — entries are discrete events, not continuous data
  const callResponseLog = useAppStore((s) => s.callResponseLog);

  // Reverse chronological order (most recent first)
  const entries = [...callResponseLog].reverse();
  const entryCount = entries.length;

  return (
    <div
      style={{
        backgroundColor: '#13131f',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '12px',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Header row — always visible, click to toggle */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e5e7eb',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Conversations
          </span>
          {/* Count badge */}
          <span
            style={{
              fontSize: '0.75rem',
              color: entryCount > 0 ? '#a855f7' : '#6b7280',
              fontStyle: 'italic',
            }}
          >
            {entryCount} {entryCount === 1 ? 'exchange' : 'exchanges'}
          </span>
        </div>

        {/* Chevron icon */}
        <span
          style={{
            color: '#6b7280',
            fontSize: '0.75rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          ▼
        </span>
      </button>

      {/* Expandable entries list */}
      {isExpanded && (
        <div
          style={{
            maxHeight: '192px',
            overflowY: 'auto',
            borderTop: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          {entryCount === 0 ? (
            <div
              style={{
                padding: '16px',
                color: '#6b7280',
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            >
              No call-response exchanges detected yet.
            </div>
          ) : (
            entries.map((entry, idx) => (
              <button
                key={`${entry.callSec}-${idx}`}
                onClick={() => seekTo(entry.callSec)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  background: 'rgba(168,85,247,0.08)',
                  border: 'none',
                  borderBottom: '1px solid rgba(99,102,241,0.1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'filter 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)';
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    minWidth: '48px',
                    flexShrink: 0,
                  }}
                >
                  {formatTimestamp(entry.callSec)}
                </span>

                {/* Direction label */}
                <span
                  style={{
                    fontSize: '0.8125rem',
                    color: '#a855f7',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  KB calls → GT responds
                </span>

                {/* Gap duration */}
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: '#6b7280',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                  }}
                >
                  ({entry.gapSec.toFixed(1)}s gap)
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
