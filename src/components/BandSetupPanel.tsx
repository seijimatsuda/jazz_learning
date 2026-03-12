/**
 * BandSetupPanel.tsx — Band lineup configuration panel.
 *
 * Allows users to configure which instruments are in the band before
 * loading audio. The lineup drives which instruments are analyzed and
 * displayed in the node graph.
 *
 * Locks after file load — toggles disabled once audio is loaded.
 * Enforces minimum 2 / maximum 8 instrument constraints.
 * Prevents simultaneous vibes + keyboard selection (shared frequency band).
 */

import { useAppStore } from '../store/useAppStore';

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

const INSTRUMENT_FAMILIES = [
  { label: 'Rhythm', instruments: ['bass', 'drums'] as const },
  { label: 'Chords / Melody', instruments: ['keyboard', 'guitar', 'vibes'] as const },
  { label: 'Front Line', instruments: ['saxophone', 'trumpet', 'trombone'] as const },
];

export function BandSetupPanel() {
  const lineup = useAppStore((s) => s.lineup);
  const setLineup = useAppStore((s) => s.setLineup);
  const isFileLoaded = useAppStore((s) => s.isFileLoaded);

  function handleToggle(instrument: string) {
    if (isFileLoaded) return;
    const isSelected = lineup.includes(instrument);
    if (isSelected) {
      if (lineup.length <= 2) return; // enforce minimum
      setLineup(lineup.filter((i) => i !== instrument));
    } else {
      if (lineup.length >= 8) return; // enforce maximum
      setLineup([...lineup, instrument]);
    }
  }

  function isVibesKeyboardConflict(instrument: string): boolean {
    if (instrument === 'vibes' && lineup.includes('keyboard')) return true;
    if (instrument === 'keyboard' && lineup.includes('vibes')) return true;
    return false;
  }

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
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold text-base">Band Setup</h2>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(99,102,241,0.15)', color: '#a78bfa' }}
          >
            {lineup.length} / 8
          </span>
        </div>
        {isFileLoaded && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(99,102,241,0.25)', color: '#a78bfa' }}
          >
            Locked
          </span>
        )}
      </div>

      {/* Family groups */}
      <div className="flex flex-col gap-4">
        {INSTRUMENT_FAMILIES.map((family) => (
          <div key={family.label}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>
              {family.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {family.instruments.map((instrument) => {
                const isSelected = lineup.includes(instrument);
                const wouldViolateMin = isSelected && lineup.length <= 2;
                const wouldViolateMax = !isSelected && lineup.length >= 8;
                const conflict = !isSelected && isVibesKeyboardConflict(instrument);
                const isDisabled = isFileLoaded || wouldViolateMin || wouldViolateMax || conflict;

                let title = '';
                if (isFileLoaded) title = 'Load a new file to change lineup';
                else if (wouldViolateMin) title = 'Minimum 2 instruments required';
                else if (conflict) title = 'Vibes and keyboard share the same frequency range — use one or the other';

                return (
                  <button
                    key={instrument}
                    onClick={() => handleToggle(instrument)}
                    disabled={isDisabled}
                    title={title || undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.2)'}`,
                      backgroundColor: isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.04)',
                      color: isDisabled && !isSelected ? '#4b5563' : isSelected ? '#e5e7eb' : '#9ca3af',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: isSelected ? '600' : '400',
                      transition: 'background-color 0.15s, border-color 0.15s',
                      opacity: isDisabled && !isSelected ? 0.5 : 1,
                    }}
                  >
                    <span aria-hidden>{INSTRUMENT_ICONS[instrument] ?? '?'}</span>
                    <span style={{ textTransform: 'capitalize' }}>{instrument}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
