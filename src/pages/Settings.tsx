import React, { useState } from 'react';
import { getWsUrl } from '../config/api';

export const Settings: React.FC = () => {
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-primary">Settings</h1>
          <p className="text-sm text-secondary mt-1">System parameters, event thresholds, and hardware configuration.</p>
        </div>
        {saved && (
          <span className="text-xs font-mono text-success bg-success-subtle px-2 py-0.5 rounded border border-success/30 font-medium">
            Configuration parameters updated.
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* SECTION 1: INCIDENT DETECTION THRESHOLDS */}
        <div className="rounded-[16px] glass-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-surface-secondary/70 text-[14px] font-semibold text-primary">
            1. Incident detection thresholds
          </div>
          <div className="p-5 space-y-4 text-xs font-mono">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-border pb-3.5">
              <div>
                <label className="text-primary font-sans font-medium text-xs block">Hard braking deceleration</label>
                <p className="text-muted font-sans text-[11px] mt-0.5">Threshold acceleration to trigger incident capture.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  defaultValue="7.84"
                  step="0.1"
                  className="bg-white border border-border rounded-[9px] px-3.5 py-1.5 text-primary outline-none focus:border-accent w-32 tabular-nums shadow-2xs"
                />
                <span className="text-secondary text-xs font-sans">m/s² (~0.8g)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center border-b border-border pb-3.5">
              <div>
                <label className="text-primary font-sans font-medium text-xs block">Overspeed RPM threshold</label>
                <p className="text-muted font-sans text-[11px] mt-0.5">Critical engine speed limit for event trigger.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  defaultValue="7000"
                  step="100"
                  className="bg-white border border-border rounded-[9px] px-3.5 py-1.5 text-primary outline-none focus:border-accent w-32 tabular-nums shadow-2xs"
                />
                <span className="text-secondary text-xs font-sans">rpm</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-primary font-sans font-medium text-xs block">Vehicle speed warning threshold</label>
                <p className="text-muted font-sans text-[11px] mt-0.5">Velocity threshold to trigger overspeed recording.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  defaultValue="160"
                  step="5"
                  className="bg-white border border-border rounded-[9px] px-3.5 py-1.5 text-primary outline-none focus:border-accent w-32 tabular-nums shadow-2xs"
                />
                <span className="text-secondary text-xs font-sans">km/h</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: HARDWARE COMMUNICATION */}
        <div className="rounded-[16px] glass-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-surface-secondary/70 text-[14px] font-semibold text-primary">
            2. Hardware communication (read-only)
          </div>
          <div className="p-5 space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-secondary font-sans">Gateway Wi-Fi SSID</span>
              <span className="text-primary font-medium">APEX_TELEMETRY_NET</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-secondary font-sans">WebSocket telemetry URL</span>
              <span className="text-primary font-medium">{getWsUrl('/api/v1/ws/telemetry')}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-secondary font-sans">Inter-device channel</span>
              <span className="text-primary font-medium">ESP-NOW (Channel 1, 2.4 GHz)</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-secondary font-sans">CAN bus nominal bitrate</span>
              <span className="text-primary font-medium">500 kbps (11-bit standard IDs)</span>
            </div>
          </div>
        </div>

        {/* SECTION 3: BUFFER POLICIES */}
        <div className="rounded-[16px] glass-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border bg-surface-secondary/70 text-[14px] font-semibold text-primary">
            3. Black box buffer policies
          </div>
          <div className="p-5 space-y-3.5 text-xs">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded-[5px] border-border text-accent accent-accent focus:ring-accent"
              />
              <span className="text-primary font-medium">Auto-upload 5-minute rolling buffer on critical severity events</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded-[5px] border-border text-accent accent-accent focus:ring-accent"
              />
              <span className="text-primary font-medium">Maintain non-volatile checksum verification across session transfers</span>
            </label>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium rounded-[9px] border border-border bg-white text-secondary hover:text-primary hover:bg-surface-hover transition-colors shadow-2xs"
          >
            Reset defaults
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm font-medium rounded-[9px] bg-accent hover:bg-accent-hover text-white transition-colors shadow-xs"
          >
            Save configuration
          </button>
        </div>
      </form>
    </div>
  );
};
