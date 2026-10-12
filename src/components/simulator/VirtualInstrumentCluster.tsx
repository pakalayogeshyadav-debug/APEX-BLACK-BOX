import React from 'react';
import type { VehicleSimState } from '../../types/simulator';
import { Compass, Lightbulb, TriangleAlert, ArrowLeft, ArrowRight } from 'lucide-react';

interface Props {
  simState: VehicleSimState;
  compact?: boolean;
}

export const VirtualInstrumentCluster: React.FC<Props> = ({ simState, compact = false }) => {
  const speed = Math.max(0, Math.min(240, simState.vehicle_speed_kmh));
  const rpm = Math.max(0, Math.min(7000, simState.engine_rpm));

  // Speedometer needle angle: 0 km/h -> -120 deg, 240 km/h -> +120 deg
  const speedAngle = -120 + (speed / 240) * 240;

  // Tachometer needle angle: 0 RPM -> -120 deg, 7000 RPM -> +120 deg
  const rpmAngle = -120 + (rpm / 7000) * 240;

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-surface-secondary/70 rounded-[14px] border border-border">
        {/* Compact Speed */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-bold tracking-tight text-primary tabular-nums">
            {Math.round(speed)}
          </span>
          <span className="text-xs text-muted font-mono uppercase">km/h</span>
        </div>

        {/* Compact Gear */}
        <div className="flex items-center gap-1 bg-surface border border-border px-2.5 py-1 rounded-[8px]">
          <span className="font-mono font-bold text-accent text-sm">
            {simState.current_gear === 'D' && simState.active_drive_gear
              ? `D${simState.active_drive_gear}`
              : simState.current_gear}
          </span>
        </div>

        {/* Compact RPM */}
        <div className="flex items-baseline gap-1.5 text-right">
          <span className="font-mono text-xl font-semibold text-secondary tabular-nums">
            {rpm}
          </span>
          <span className="text-[10px] text-muted font-mono uppercase">RPM</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col p-5 bg-gradient-to-b from-surface to-surface-secondary/40 rounded-[20px] border border-border shadow-xs select-none overflow-hidden">
      {/* Top Indicators Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-3 mb-2 text-xs">
        {/* Turn Left */}
        <div className={`p-1.5 rounded-full transition-colors ${simState.turn_indicators === 'LEFT' || simState.hazard_lights ? 'text-success bg-success-subtle animate-pulse' : 'text-muted/40'}`}>
          <ArrowLeft size={16} />
        </div>

        {/* Center status indicators */}
        <div className="flex items-center gap-3">
          {/* Headlights */}
          <div
            title="Headlights"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono transition-colors ${
              simState.headlights ? 'bg-accent-subtle text-accent border border-accent/30' : 'text-muted/50'
            }`}
          >
            <Lightbulb size={13} />
            <span>LIGHTS</span>
          </div>

          {/* Parking brake */}
          <div
            title="Parking Brake"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono transition-colors ${
              simState.parking_brake ? 'bg-error-subtle text-error font-medium border border-error/30' : 'text-muted/50'
            }`}
          >
            <span>[P] BRAKE</span>
          </div>

          {/* Hazards */}
          {simState.hazard_lights && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono bg-warning-subtle text-warning border border-warning/30 animate-pulse">
              <TriangleAlert size={13} />
              <span>HAZARD</span>
            </div>
          )}

          {/* Compass heading */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono text-secondary bg-surface border border-border">
            <Compass size={13} className="text-accent" />
            <span>{Math.round(simState.heading_deg)}° {simState.heading_cardinal}</span>
          </div>
        </div>

        {/* Turn Right */}
        <div className={`p-1.5 rounded-full transition-colors ${simState.turn_indicators === 'RIGHT' || simState.hazard_lights ? 'text-success bg-success-subtle animate-pulse' : 'text-muted/40'}`}>
          <ArrowRight size={16} />
        </div>
      </div>

      {/* Main Dual Gauges (Speedometer & Tachometer) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center justify-items-center py-2">
        {/* SPEEDOMETER */}
        <div className="relative flex flex-col items-center justify-center w-[220px] h-[220px]">
          {/* Gauge Dial SVG */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
            {/* Background Arc */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="10"
              strokeDasharray="335.1"
              strokeDashoffset="111.7"
              strokeLinecap="round"
            />
            {/* Active Speed Arc */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#0891B2"
              strokeWidth="10"
              strokeDasharray="335.1"
              strokeDashoffset={335.1 - (speed / 240) * 223.4}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-75 ease-linear"
            />
          </svg>

          {/* Needle */}
          <div
            className="absolute w-1 h-[70px] bg-accent origin-bottom rounded-full transition-transform duration-75 ease-out shadow-sm"
            style={{
              bottom: '100px',
              transform: `rotate(${speedAngle}deg)`
            }}
          />

          {/* Center Hub & Numerical Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center mt-3">
            <div className="w-4 h-4 rounded-full bg-surface border-2 border-accent shadow-xs mb-1" />
            <span className="font-mono text-4xl font-extrabold tracking-tight text-primary tabular-nums">
              {Math.round(speed)}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted font-medium mt-0.5">
              km/h
            </span>
          </div>

          {/* Gauge Range Labels */}
          <span className="absolute bottom-5 left-4 text-[10px] font-mono text-muted">0</span>
          <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-muted">120</span>
          <span className="absolute bottom-5 right-4 text-[10px] font-mono text-muted">240</span>
        </div>

        {/* TACHOMETER (RPM) */}
        <div className="relative flex flex-col items-center justify-center w-[220px] h-[220px]">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
            {/* Background Arc */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="10"
              strokeDasharray="335.1"
              strokeDashoffset="111.7"
              strokeLinecap="round"
            />
            {/* Redline sector (6000-7000 RPM) */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke="#FCA5A5"
              strokeWidth="10"
              strokeDasharray="335.1"
              strokeDashoffset="111.7"
              strokeLinecap="round"
            />
            {/* Active RPM Arc */}
            <circle
              cx="100"
              cy="100"
              r="80"
              fill="none"
              stroke={rpm > 6000 ? '#EF4444' : '#B77916'}
              strokeWidth="10"
              strokeDasharray="335.1"
              strokeDashoffset={335.1 - (rpm / 7000) * 223.4}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-75 ease-linear"
            />
          </svg>

          {/* Needle */}
          <div
            className={`absolute w-1 h-[70px] ${rpm > 6000 ? 'bg-error' : 'bg-[#B77916]'} origin-bottom rounded-full transition-transform duration-75 ease-out shadow-sm`}
            style={{
              bottom: '100px',
              transform: `rotate(${rpmAngle}deg)`
            }}
          />

          {/* Center Hub & Numerical Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center mt-3">
            <div className={`w-4 h-4 rounded-full bg-surface border-2 ${rpm > 6000 ? 'border-error' : 'border-[#B77916]'} shadow-xs mb-1`} />
            <span className="font-mono text-3xl font-extrabold tracking-tight text-primary tabular-nums">
              {rpm}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted font-medium mt-0.5">
              RPM &times; 1000
            </span>
          </div>

          <span className="absolute bottom-5 left-4 text-[10px] font-mono text-muted">0</span>
          <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-muted">3.5</span>
          <span className="absolute bottom-5 right-4 text-[10px] font-mono text-error font-semibold">7.0</span>
        </div>
      </div>

      {/* Center Gear & Driving Metrics Pill */}
      <div className="flex flex-wrap items-center justify-around gap-2 bg-surface border border-border/80 px-4 py-2.5 rounded-[12px] mt-2">
        {/* Gear Selector Readout */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted uppercase font-mono">Gear</span>
          <div className="flex items-center gap-1">
            {(['P', 'R', 'N', 'D'] as const).map(g => (
              <span
                key={g}
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded-[6px] transition-colors ${
                  simState.current_gear === g
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-muted/60'
                }`}
              >
                {g === 'D' && simState.current_gear === 'D' && simState.active_drive_gear
                  ? `D${simState.active_drive_gear}`
                  : g}
              </span>
            ))}
          </div>
        </div>

        <div className="w-px h-4 bg-border/80 hidden sm:block" />

        {/* Engine Load */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted uppercase font-mono">Load</span>
          <span className="font-mono text-sm font-semibold text-primary tabular-nums">
            {simState.engine_load_percent}%
          </span>
        </div>

        <div className="w-px h-4 bg-border/80 hidden sm:block" />

        {/* Accel / Decel force */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted uppercase font-mono">Accel</span>
          <span className={`font-mono text-sm font-semibold tabular-nums ${simState.longitudinal_accel_mps2 < 0 ? 'text-error' : 'text-primary'}`}>
            {simState.longitudinal_accel_mps2 > 0 ? '+' : ''}
            {simState.longitudinal_accel_mps2.toFixed(1)} m/s²
          </span>
        </div>
      </div>
    </div>
  );
};
