/**
 * NodeDetailPanel.tsx — Instrument detail panel (UI-04, UI-05, UI-06, UI-07).
 *
 * Renders when selectedInstrument is non-null. Shows:
 * - Instrument name, current role badge, close button (UI-04)
 * - 10-second activity sparkline via mini canvas (UI-05)
 * - Time-in-role pie chart via mini canvas (UI-06)
 * - Most-active communication partner (UI-07)
 *
 * Polls audioStateRef at 100ms via setInterval — same pattern as FileUpload.
 * Mini-canvases apply HiDPI scaling via devicePixelRatio.
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { AudioStateRef, RoleLabel } from '../audio/types';

interface NodeDetailPanelProps {
  audioStateRef: MutableRefObject<AudioStateRef>;
}

// Role colors — match canvas legend
const ROLE_COLORS: Record<RoleLabel, string> = {
  soloing: '#f59e0b',
  comping: '#3b82f6',
  holding: '#6b7280',
  silent:  '#374151',
};

const ROLE_TEXT_COLORS: Record<RoleLabel, string> = {
  soloing: '#000000',
  comping: '#ffffff',
  holding: '#ffffff',
  silent:  '#9ca3af',
};

// All role labels in display order for pie chart and percentage list
const ROLE_ORDER: RoleLabel[] = ['soloing', 'comping', 'holding', 'silent'];

// Alphabet-sorted edge key helper — matches AnalysisState.edgeWeights key format
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function NodeDetailPanel({ audioStateRef }: NodeDetailPanelProps) {
  const selectedInstrument = useAppStore((s) => s.selectedInstrument);
  const instrumentRoles    = useAppStore((s) => s.instrumentRoles);
  const setSelectedInstrument = useAppStore((s) => s.setSelectedInstrument);

  const sparklineRef = useRef<HTMLCanvasElement>(null);
  const pieRef       = useRef<HTMLCanvasElement>(null);

  // Most-active partner displayed as text (computed from edgeWeights in poll)
  const [mostActivePartner, setMostActivePartner] = useState<string | null>(null);

  // HiDPI setup for a mini canvas. Called once on mount (canvas won't resize).
  function initMiniCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width  = Math.round(cssWidth  * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width  = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    return ctx;
  }

  // Draw sparkline onto sparklineRef canvas
  function drawSparkline(buffer: Float32Array, head: number, samples: number): void {
    const canvas = sparklineRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const W = 200;
    const H = 60;

    ctx.clearRect(0, 0, W, H);

    if (samples < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    for (let i = 0; i < samples; i++) {
      // Chronological read from ring buffer
      const idx = ((head - samples + i) % 100 + 100) % 100;
      const v   = buffer[idx];
      const x   = (i / (samples - 1)) * W;
      const y   = H - v * H;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Suppress unused variable warning for dpr
    void dpr;
  }

  // Draw pie chart onto pieRef canvas
  function drawPie(timeInRole: Record<RoleLabel, number>): void {
    const canvas = pieRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W  = 80;
    const H  = 80;
    const cx = 40;
    const cy = 40;
    const r  = 35;

    ctx.clearRect(0, 0, W, H);

    const total = ROLE_ORDER.reduce((sum, role) => sum + (timeInRole[role] ?? 0), 0);

    if (total <= 0) {
      // Draw a full gray circle as placeholder
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#374151';
      ctx.fill();
      return;
    }

    let startAngle = -Math.PI / 2; // Start at top

    for (const role of ROLE_ORDER) {
      const value   = timeInRole[role] ?? 0;
      if (value <= 0) continue;
      const sweep   = (value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = ROLE_COLORS[role];
      ctx.fill();

      startAngle = endAngle;
    }
  }

  // Initialize mini canvases on mount
  useEffect(() => {
    const sparkCanvas = sparklineRef.current;
    const pieCanvas   = pieRef.current;
    if (sparkCanvas) initMiniCanvas(sparkCanvas, 200, 60);
    if (pieCanvas)   initMiniCanvas(pieCanvas,   80,  80);
  }, []);

  // Re-initialize canvases when selectedInstrument changes (element may re-mount)
  useEffect(() => {
    if (!selectedInstrument) return;
    const sparkCanvas = sparklineRef.current;
    const pieCanvas   = pieRef.current;
    if (sparkCanvas) initMiniCanvas(sparkCanvas, 200, 60);
    if (pieCanvas)   initMiniCanvas(pieCanvas,   80,  80);
  }, [selectedInstrument]);

  // Poll audioStateRef at 100ms to draw sparkline + pie and compute most-active partner
  useEffect(() => {
    if (!selectedInstrument) {
      setMostActivePartner(null);
      return;
    }

    const intervalId = setInterval(() => {
      const analysis = audioStateRef.current.analysis;
      if (!analysis) return;

      // Find per-instrument analysis for selected instrument
      const instrData = analysis.instruments.find((ia) => ia.instrument === selectedInstrument);
      if (instrData) {
        drawSparkline(instrData.historyBuffer, instrData.historyHead, instrData.historySamples);
        drawPie(instrData.timeInRole);
      }

      // Find most-active communication partner
      const edgeWeights = analysis.edgeWeights;
      const allInstruments = analysis.instruments.map((ia) => ia.instrument);
      let bestPartner: string | null = null;
      let bestWeight  = 0.3; // minimum threshold to show a partner

      for (const other of allInstruments) {
        if (other === selectedInstrument) continue;
        const key    = edgeKey(selectedInstrument, other);
        const weight = edgeWeights[key] ?? 0;
        if (weight >= bestWeight) {
          bestWeight  = weight;
          bestPartner = other;
        }
      }

      setMostActivePartner(bestPartner);
    }, 100);

    return () => clearInterval(intervalId);
  }, [selectedInstrument, audioStateRef]);

  if (!selectedInstrument) return null;

  const currentRole = (instrumentRoles[selectedInstrument] ?? 'silent') as RoleLabel;
  const roleColor   = ROLE_COLORS[currentRole];
  const roleText    = ROLE_TEXT_COLORS[currentRole];

  // Build role percentage rows from current analysis data for display
  const timeInRole = audioStateRef.current.analysis?.instruments
    .find((ia) => ia.instrument === selectedInstrument)
    ?.timeInRole;

  const total = timeInRole
    ? ROLE_ORDER.reduce((sum, r) => sum + (timeInRole[r] ?? 0), 0)
    : 0;

  const displayName = selectedInstrument.charAt(0).toUpperCase() + selectedInstrument.slice(1);

  return (
    <div
      style={{
        backgroundColor: '#13131f',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '12px',
        padding: '16px',
        width: '100%',
        maxWidth: '400px',
      }}
    >
      {/* Header row: instrument name, role badge, close button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>
            {displayName}
          </span>
          <span
            style={{
              backgroundColor: roleColor,
              color: roleText,
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              letterSpacing: '0.02em',
              textTransform: 'capitalize',
            }}
          >
            {currentRole}
          </span>
        </div>
        <button
          onClick={() => setSelectedInstrument(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: '1',
            padding: '0 4px',
          }}
          aria-label="Close detail panel"
        >
          &times;
        </button>
      </div>

      {/* Sparkline section */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginBottom: '4px' }}>
          Activity (10s)
        </p>
        <canvas
          ref={sparklineRef}
          style={{ display: 'block', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.03)' }}
        />
      </div>

      {/* Pie chart + role percentages row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '12px' }}>
        <canvas
          ref={pieRef}
          style={{ display: 'block', flexShrink: 0, borderRadius: '50%' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', flex: 1 }}>
          {ROLE_ORDER.map((role) => {
            const value = timeInRole?.[role] ?? 0;
            const pct   = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: ROLE_COLORS[role],
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', textTransform: 'capitalize', flex: 1 }}>
                  {role}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Most-active partner */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: '10px',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Most active with: </span>
        <span style={{ color: mostActivePartner ? '#818cf8' : 'rgba(255,255,255,0.3)', fontWeight: mostActivePartner ? 600 : 400 }}>
          {mostActivePartner
            ? mostActivePartner.charAt(0).toUpperCase() + mostActivePartner.slice(1)
            : 'No active partners'}
        </span>
      </div>
    </div>
  );
}
