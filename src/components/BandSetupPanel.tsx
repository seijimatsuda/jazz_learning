/**
 * BandSetupPanel.tsx — Band lineup configuration panel.
 *
 * Allows users to configure which instruments are in the band before
 * loading audio. The lineup drives which instruments are analyzed and
 * displayed in the node graph.
 *
 * Locks after file load — add/remove disabled once audio is loaded.
 */

import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

const AVAILABLE_INSTRUMENTS = ['keyboard', 'bass', 'drums', 'guitar', 'saxophone', 'trumpet', 'trombone', 'vibes'] as const;

const INSTRUMENT_ICONS: Record<string, string> = {
  keyboard: '\u{1F3B9}',
  bass: '\u{1F3B8}',
  drums: '\u{1F941}',
  guitar: '\u{1F3B5}',
  saxophone: '\u{1F3B7}',
  trumpet: '\u{1F3BA}',
  trombone: '\u{1F3B6}',
  vibes: '\u{1F3B5}',
};

const BAND_LABELS: Record<string, string> = {
  keyboard: '250-2000 Hz',
  bass: '20-250 Hz',
  drums: '60-300 Hz + 2-8 kHz',
  guitar: '300-3000 Hz',
  saxophone: '250-2000 Hz',
  trumpet: '300-3000 Hz',
  trombone: '250-2000 Hz',
  vibes: '250-3000 Hz',
};

export function BandSetupPanel() {
  const lineup = useAppStore((s) => s.lineup);
  const setLineup = useAppStore((s) => s.setLineup);
  const isFileLoaded = useAppStore((s) => s.isFileLoaded);
  const [selectValue, setSelectValue] = useState('');

  const availableToAdd = AVAILABLE_INSTRUMENTS.filter(
    (inst) => !lineup.includes(inst)
  );

  function handleAdd(instrument: string) {
    if (!instrument || isFileLoaded) return;
    setLineup([...lineup, instrument]);
    setSelectValue('');
  }

  function handleRemove(instrument: string) {
    if (isFileLoaded) return;
    setLineup(lineup.filter((i) => i !== instrument));
  }

  const showOptimizationNote = lineup.length !== 4;

  return (
    <div
      className="w-full max-w-2xl"
      style={{
        backgroundColor: '#13131f',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-base">Band Setup</h2>
        {isFileLoaded && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(99,102,241,0.25)', color: '#a78bfa' }}
          >
            Locked
          </span>
        )}
      </div>

      {/* Add instrument dropdown */}
      <div className="mb-4">
        <select
          value={selectValue}
          disabled={isFileLoaded || availableToAdd.length === 0}
          title={isFileLoaded ? 'Load a new file to change lineup' : undefined}
          onChange={(e) => {
            const val = e.target.value;
            setSelectValue(val);
            if (val) handleAdd(val);
          }}
          style={{
            width: '100%',
            backgroundColor: isFileLoaded ? '#0d0d18' : '#1a1a2e',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '8px',
            color: isFileLoaded ? '#6b7280' : '#e5e7eb',
            padding: '8px 12px',
            fontSize: '14px',
            cursor: isFileLoaded ? 'not-allowed' : 'pointer',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          <option value="">
            {availableToAdd.length === 0
              ? 'All instruments added'
              : 'Add instrument...'}
          </option>
          {availableToAdd.map((inst) => (
            <option key={inst} value={inst}>
              {INSTRUMENT_ICONS[inst]} {inst.charAt(0).toUpperCase() + inst.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Instrument rows */}
      <div className="flex flex-col gap-2">
        {lineup.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: '#6b7280' }}>
            No instruments added. Use the dropdown above to build your lineup.
          </p>
        ) : (
          lineup.map((instrument) => (
            <div
              key={instrument}
              className="flex items-center justify-between rounded-lg"
              style={{
                backgroundColor: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.15)',
                padding: '10px 14px',
              }}
            >
              {/* Left: icon + name + band label */}
              <div className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>
                  {INSTRUMENT_ICONS[instrument] ?? '?'}
                </span>
                <div>
                  <span className="text-white font-medium text-sm" style={{ textTransform: 'capitalize' }}>
                    {instrument}
                  </span>
                  <p className="text-xs" style={{ color: '#9ca3af', marginTop: '1px' }}>
                    {BAND_LABELS[instrument] ?? ''}
                  </p>
                </div>
              </div>

              {/* Right: remove button */}
              <button
                onClick={() => handleRemove(instrument)}
                disabled={isFileLoaded}
                title={isFileLoaded ? 'Load a new file to change lineup' : `Remove ${instrument}`}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: '6px',
                  color: isFileLoaded ? '#4b5563' : '#ef4444',
                  cursor: isFileLoaded ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  padding: '3px 8px',
                  lineHeight: '1.4',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isFileLoaded) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                X
              </button>
            </div>
          ))
        )}
      </div>

      {/* Optimization note when lineup differs from 4 */}
      {showOptimizationNote && !isFileLoaded && (
        <p className="text-xs mt-3 text-center" style={{ color: '#a78bfa' }}>
          Visualization is optimized for 4 instruments.
        </p>
      )}
    </div>
  );
}
