import React, { useState } from 'react';
import { useSimulator } from '../../providers/SimulatorProvider';
import type { GearType } from '../../types/simulator';
import {
  Power,
  Disc,
  Gauge,
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Cpu,
  Wifi,
  Globe,
  RefreshCw
} from 'lucide-react';

interface Props {
  compact?: boolean;
}

export const DriverControlsPanel: React.FC<Props> = ({ compact = false }) => {
  const {
    controls,
    updateControls,
    activeKeys,
    simulatorTarget,
    setSimulatorTarget,
    hardwareSimulatorInfo,
    checkHardwareSimulator,
    configureHardwareSimulatorUrl,
    hardwareCommandError,
    clearHardwareCommandError
  } = useSimulator();

  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(hardwareSimulatorInfo.base_url);

  const handleSaveUrl = async () => {
    await configureHardwareSimulatorUrl(tempUrl);
    setIsEditingUrl(false);
  };

  const handleAcceleratorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateControls({ accelerator: Number(e.target.value) });
  };

  const handleBrakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateControls({ brake: Number(e.target.value) });
  };

  const handleSteeringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateControls({ steering: Number(e.target.value) });
  };

  const handleGearSelect = (gear: GearType) => {
    updateControls({ gear, parking_brake: gear === 'P' ? true : controls.parking_brake });
  };

  const isWPressed = activeKeys.has('KeyW') || activeKeys.has('ArrowUp');
  const isSPressed = activeKeys.has('KeyS') || activeKeys.has('ArrowDown');
  const isAPressed = activeKeys.has('KeyA') || activeKeys.has('ArrowLeft');
  const isDPressed = activeKeys.has('KeyD') || activeKeys.has('ArrowRight');
  const isSpacePressed = activeKeys.has('Space');

  if (compact) {
    return (
      <div className="flex flex-col gap-3 p-3 bg-surface rounded-[14px] border border-border">
        {/* Compact Mode Target Status */}
        <div className="flex items-center justify-between text-[11px] pb-1 border-b border-border/60">
          <span className="font-semibold text-primary">Controls</span>
          {simulatorTarget === 'HARDWARE_WIFI' ? (
            <span className={`font-mono text-[10px] flex items-center gap-1 ${
              hardwareSimulatorInfo.status === 'CONNECTED' ? 'text-success font-bold' : 'text-error font-bold'
            }`}>
              <Wifi size={11} />
              ESP32: {hardwareSimulatorInfo.status}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-muted flex items-center gap-1">
              <Cpu size={11} />
              SW Engine
            </span>
          )}
        </div>
        {/* Compact Accelerator & Brake Sliders */}
        <div className="grid grid-cols-2 gap-3">
          {/* Accelerator */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-secondary font-medium">Gas [W]</span>
              <span className="text-primary font-bold">{Math.round(controls.accelerator)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={controls.accelerator}
              onChange={handleAcceleratorChange}
              className="accent-accent w-full cursor-pointer h-2 bg-slate-200 rounded-lg"
              aria-label="Accelerator"
            />
          </div>

          {/* Brake */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-secondary font-medium">Brake [S]</span>
              <span className="text-error font-bold">{Math.round(controls.brake)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={controls.brake}
              onChange={handleBrakeChange}
              className="accent-error w-full cursor-pointer h-2 bg-slate-200 rounded-lg"
              aria-label="Brake"
            />
          </div>
        </div>

        {/* Compact Gear & Ignition Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <button
            onClick={() => updateControls({ ignition: !controls.ignition })}
            className={`px-3 py-1.5 rounded-[8px] text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 ${
              controls.ignition
                ? 'bg-success text-white shadow-xs'
                : 'bg-surface-secondary text-secondary hover:text-primary'
            }`}
          >
            <Power size={13} />
            <span>{controls.ignition ? 'ENG ON' : 'ENG OFF'}</span>
          </button>

          <div className="flex items-center gap-1">
            {(['P', 'R', 'N', 'D'] as const).map(g => (
              <button
                key={g}
                onClick={() => handleGearSelect(g)}
                className={`px-2.5 py-1 rounded-[6px] text-xs font-mono font-bold transition-colors ${
                  controls.gear === g
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-secondary text-secondary hover:text-primary'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 bg-surface rounded-[20px] border border-border shadow-xs select-none">
      {/* Header with Title & Keyboard Help */}
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-primary">Driver Controls</h2>
          <p className="text-xs text-secondary mt-0.5">Physical control simulation with interactive pedals</p>
        </div>

        {/* Active Key Indicators */}
        <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono">
          <span className={`px-1.5 py-0.5 rounded border transition-colors ${isWPressed ? 'bg-accent text-white border-accent' : 'bg-surface-secondary text-muted border-border'}`}>W</span>
          <span className={`px-1.5 py-0.5 rounded border transition-colors ${isAPressed ? 'bg-accent text-white border-accent' : 'bg-surface-secondary text-muted border-border'}`}>A</span>
          <span className={`px-1.5 py-0.5 rounded border transition-colors ${isSPressed ? 'bg-accent text-white border-accent' : 'bg-surface-secondary text-muted border-border'}`}>S</span>
          <span className={`px-1.5 py-0.5 rounded border transition-colors ${isDPressed ? 'bg-accent text-white border-accent' : 'bg-surface-secondary text-muted border-border'}`}>D</span>
          <span className={`px-2 py-0.5 rounded border transition-colors ${isSpacePressed ? 'bg-error text-white border-error' : 'bg-surface-secondary text-muted border-border'}`}>SPACE</span>
        </div>
      </div>

      {/* Target Simulator Mode (Software vs ESP32 Wi-Fi) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 bg-surface-secondary/40 rounded-[14px] border border-border/80">
        <div className="flex items-center gap-1.5 p-1 bg-surface rounded-[10px] border border-border text-xs font-medium">
          <button
            onClick={() => setSimulatorTarget('SOFTWARE')}
            className={`px-3 py-1.5 rounded-[8px] transition-all flex items-center gap-1.5 cursor-pointer ${
              simulatorTarget === 'SOFTWARE'
                ? 'bg-primary text-white font-semibold shadow-xs'
                : 'text-secondary hover:text-primary hover:bg-surface-secondary'
            }`}
          >
            <Cpu size={14} />
            <span>Software Model</span>
          </button>
          <button
            onClick={() => setSimulatorTarget('HARDWARE_WIFI')}
            className={`px-3 py-1.5 rounded-[8px] transition-all flex items-center gap-1.5 cursor-pointer ${
              simulatorTarget === 'HARDWARE_WIFI'
                ? 'bg-accent text-white font-semibold shadow-xs'
                : 'text-secondary hover:text-primary hover:bg-surface-secondary'
            }`}
          >
            <Wifi size={14} />
            <span>ESP32 Wi-Fi CAN</span>
          </button>
        </div>

        {/* ESP32 Wi-Fi Status & IP Configuration */}
        {simulatorTarget === 'HARDWARE_WIFI' && (
          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Status Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-semibold ${
                hardwareSimulatorInfo.status === 'CONNECTED'
                  ? 'bg-success/10 text-success border-success/30'
                  : hardwareSimulatorInfo.status === 'CONNECTING'
                  ? 'bg-[#B77916]/10 text-[#B77916] border-[#B77916]/30'
                  : 'bg-error/10 text-error border-error/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                hardwareSimulatorInfo.status === 'CONNECTED' ? 'bg-success animate-pulse' :
                hardwareSimulatorInfo.status === 'CONNECTING' ? 'bg-[#B77916] animate-ping' : 'bg-error'
              }`} />
              <span>{hardwareSimulatorInfo.status}</span>
              {hardwareSimulatorInfo.latency_ms !== undefined && hardwareSimulatorInfo.status === 'CONNECTED' && (
                <span className="text-secondary opacity-80">({hardwareSimulatorInfo.latency_ms}ms)</span>
              )}
            </div>

            {/* IP Address Editor */}
            {isEditingUrl ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="http://192.168.1.100"
                  className="px-2 py-1 text-xs font-mono bg-surface border border-accent rounded-[8px] w-44 text-primary"
                />
                <button
                  onClick={handleSaveUrl}
                  className="px-2.5 py-1 text-xs font-semibold bg-accent text-white rounded-[8px] hover:bg-accent/90 cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditingUrl(false)}
                  className="px-2 py-1 text-xs text-secondary hover:text-primary cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-secondary">
                <Globe size={13} className="text-secondary" />
                <span
                  className="underline cursor-pointer hover:text-primary"
                  title="Click to edit ESP32 LAN IP"
                  onClick={() => { setTempUrl(hardwareSimulatorInfo.base_url); setIsEditingUrl(true); }}
                >
                  {hardwareSimulatorInfo.base_url}
                </span>
                <button
                  onClick={checkHardwareSimulator}
                  title="Test Connection"
                  className="p-1 rounded hover:bg-surface-secondary text-secondary hover:text-primary ml-0.5 cursor-pointer"
                >
                  <RefreshCw size={12} className={hardwareSimulatorInfo.status === 'CONNECTING' ? 'animate-spin' : ''} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hardware Error Toast Banner if command rejected or timed out */}
      {simulatorTarget === 'HARDWARE_WIFI' && hardwareCommandError && (
        <div className="flex items-center justify-between px-3.5 py-2 text-xs bg-error/10 border border-error/30 text-error rounded-[12px] animate-fade-in">
          <div className="flex items-center gap-2">
            <TriangleAlert size={14} className="shrink-0" />
            <span><strong>ESP32 Wi-Fi Command Error:</strong> {hardwareCommandError}</span>
          </div>
          <button
            onClick={clearHardwareCommandError}
            className="text-xs font-bold underline hover:opacity-80 ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Pedals & Steering Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. ACCELERATOR PEDAL (0 - 100%) */}
        <div className="flex flex-col p-4 bg-surface-secondary/40 rounded-[16px] border border-border/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Gauge size={14} className="text-accent" />
              Accelerator
            </span>
            <span className="font-mono text-sm font-bold text-accent tabular-nums">
              {Math.round(controls.accelerator)}%
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="0"
              max="100"
              value={controls.accelerator}
              onChange={handleAcceleratorChange}
              className="flex-1 accent-accent h-2.5 bg-slate-200 rounded-lg cursor-pointer transition-all"
              aria-label="Accelerator Position"
            />
          </div>

          {/* Quick preset buttons */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2 border-t border-border/60">
            {[0, 25, 50, 100].map(val => (
              <button
                key={val}
                onClick={() => updateControls({ accelerator: val })}
                className={`py-1 rounded-[6px] text-[11px] font-mono font-medium transition-colors ${
                  Math.round(controls.accelerator) === val
                    ? 'bg-accent text-white'
                    : 'bg-surface text-secondary hover:text-primary hover:bg-surface-hover'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted font-mono mt-1.5">Key: W / Arrow Up</span>
        </div>

        {/* 2. BRAKE PEDAL (0 - 100%) */}
        <div className="flex flex-col p-4 bg-surface-secondary/40 rounded-[16px] border border-border/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Disc size={14} className="text-error" />
              Service Brake
            </span>
            <span className="font-mono text-sm font-bold text-error tabular-nums">
              {Math.round(controls.brake)}%
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="0"
              max="100"
              value={controls.brake}
              onChange={handleBrakeChange}
              className="flex-1 accent-error h-2.5 bg-slate-200 rounded-lg cursor-pointer transition-all"
              aria-label="Brake Position"
            />
          </div>

          {/* Quick preset buttons */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2 border-t border-border/60">
            {[0, 25, 50, 100].map(val => (
              <button
                key={val}
                onClick={() => updateControls({ brake: val })}
                className={`py-1 rounded-[6px] text-[11px] font-mono font-medium transition-colors ${
                  Math.round(controls.brake) === val
                    ? 'bg-error text-white'
                    : 'bg-surface text-secondary hover:text-primary hover:bg-surface-hover'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted font-mono mt-1.5">Key: S / Down / Space</span>
        </div>

        {/* 3. STEERING WHEEL (-100% to +100%) */}
        <div className="flex flex-col p-4 bg-surface-secondary/40 rounded-[16px] border border-border/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-primary">Steering Wheel</span>
            <span className="font-mono text-sm font-bold text-primary tabular-nums">
              {controls.steering > 0 ? `+${Math.round(controls.steering)}% R` : controls.steering < 0 ? `${Math.round(controls.steering)}% L` : '0° Center'}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="-100"
              max="100"
              value={controls.steering}
              onChange={handleSteeringChange}
              className="flex-1 accent-accent h-2.5 bg-slate-200 rounded-lg cursor-pointer transition-all"
              aria-label="Steering Angle"
            />
          </div>

          {/* Steering buttons */}
          <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-border/60">
            <button
              onClick={() => updateControls({ steering: -50 })}
              className="py-1 rounded-[6px] text-[11px] font-mono bg-surface text-secondary hover:text-primary hover:bg-surface-hover"
            >
              Left 50%
            </button>
            <button
              onClick={() => updateControls({ steering: 0 })}
              className="py-1 rounded-[6px] text-[11px] font-mono font-medium bg-surface text-primary hover:bg-surface-hover"
            >
              Center
            </button>
            <button
              onClick={() => updateControls({ steering: 50 })}
              className="py-1 rounded-[6px] text-[11px] font-mono bg-surface text-secondary hover:text-primary hover:bg-surface-hover"
            >
              Right 50%
            </button>
          </div>
          <span className="text-[10px] text-muted font-mono mt-1.5">Key: A (Left) / D (Right)</span>
        </div>
      </div>

      {/* Secondary Controls Bar: Ignition, Gear Shifter, Parking Brake, Lights */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-secondary/60 rounded-[16px] border border-border">
        {/* Ignition Start/Stop Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateControls({ ignition: !controls.ignition })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[12px] font-mono font-semibold text-xs tracking-tight transition-all duration-150 shadow-xs active:scale-95 ${
              controls.ignition
                ? 'bg-success text-white shadow-success/20 ring-2 ring-success/30'
                : 'bg-surface text-secondary hover:text-primary border border-border'
            }`}
            title="Toggle Engine Ignition (Key: I)"
          >
            <Power size={16} />
            <span>{controls.ignition ? 'ENGINE RUNNING' : 'START ENGINE'}</span>
          </button>
        </div>

        {/* Gear Shifter Buttons */}
        <div className="flex items-center gap-1.5 bg-surface border border-border p-1 rounded-[12px]">
          {(['P', 'R', 'N', 'D'] as const).map(g => (
            <button
              key={g}
              onClick={() => handleGearSelect(g)}
              className={`px-4 py-2 rounded-[9px] font-mono font-bold text-xs transition-all duration-150 ${
                controls.gear === g
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-secondary hover:text-primary hover:bg-surface-hover'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Parking Brake Switch */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateControls({ parking_brake: !controls.parking_brake })}
            className={`px-3 py-2 rounded-[10px] font-mono text-xs font-medium border transition-colors ${
              controls.parking_brake
                ? 'bg-error-subtle text-error border-error/40 font-semibold'
                : 'bg-surface text-secondary border-border hover:text-primary'
            }`}
          >
            PARKING BRAKE: {controls.parking_brake ? 'ENGAGED' : 'RELEASED'}
          </button>
        </div>

        {/* Lights & Turn Indicators */}
        <div className="flex items-center gap-2">
          {/* Headlights button */}
          <button
            onClick={() => updateControls({ headlights: !controls.headlights })}
            className={`p-2 rounded-[9px] border transition-colors ${
              controls.headlights
                ? 'bg-accent-subtle text-accent border-accent/40 shadow-xs'
                : 'bg-surface text-secondary border-border hover:text-primary'
            }`}
            title="Toggle Headlights"
          >
            <Lightbulb size={16} />
          </button>

          {/* Turn indicators button */}
          <div className="flex items-center bg-surface border border-border rounded-[9px] p-0.5">
            <button
              onClick={() => updateControls({ turn_indicators: controls.turn_indicators === 'LEFT' ? 'OFF' : 'LEFT' })}
              className={`p-1.5 rounded-[7px] transition-colors ${controls.turn_indicators === 'LEFT' ? 'bg-success text-white' : 'text-secondary hover:text-primary'}`}
              title="Left Turn Signal"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              onClick={() => updateControls({ turn_indicators: 'OFF' })}
              className={`px-2 py-1 text-[10px] font-mono transition-colors ${controls.turn_indicators === 'OFF' ? 'text-primary font-bold' : 'text-muted'}`}
            >
              OFF
            </button>
            <button
              onClick={() => updateControls({ turn_indicators: controls.turn_indicators === 'RIGHT' ? 'OFF' : 'RIGHT' })}
              className={`p-1.5 rounded-[7px] transition-colors ${controls.turn_indicators === 'RIGHT' ? 'bg-success text-white' : 'text-secondary hover:text-primary'}`}
              title="Right Turn Signal"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Hazard Lights */}
          <button
            onClick={() => updateControls({ hazard_lights: !controls.hazard_lights })}
            className={`p-2 rounded-[9px] border transition-colors ${
              controls.hazard_lights
                ? 'bg-warning-subtle text-warning border-warning/40 shadow-xs animate-pulse'
                : 'bg-surface text-secondary border-border hover:text-primary'
            }`}
            title="Hazard Warning Lights"
          >
            <TriangleAlert size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
