import React from 'react';
import { useSimulator } from '../../providers/SimulatorProvider';
import { AlertTriangle, X } from 'lucide-react';

export const ModeSwitchModal: React.FC = () => {
  const {
    isModeSwitchConfirmOpen,
    cancelModeSwitch,
    confirmModeSwitch,
    pendingMode,
    operatingMode,
    simState
  } = useSimulator();

  if (!isModeSwitchConfirmOpen || !pendingMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-[20px] border border-border shadow-2xl max-w-[440px] w-full p-6 text-primary flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-warning-subtle text-warning">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-primary">Switch Operating Mode?</h3>
              <p className="text-xs text-secondary mt-0.5">
                From {operatingMode} to {pendingMode} mode
              </p>
            </div>
          </div>
          <button
            onClick={cancelModeSwitch}
            className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        <div className="text-xs text-secondary leading-relaxed bg-surface-secondary/70 p-3.5 rounded-[12px] border border-border">
          {simState.is_recording && (
            <p className="font-medium text-error mb-1">
              &bull; An active telemetry recording is currently in progress!
            </p>
          )}
          {simState.is_running && simState.vehicle_speed_kmh > 0 && (
            <p className="mb-1">
              &bull; The simulated vehicle is currently traveling at {Math.round(simState.vehicle_speed_kmh)} km/h.
            </p>
          )}
          <p>
            Switching operating modes will stop driver control inputs and isolate simulated data from physical hardware CAN reception.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={cancelModeSwitch}
            className="px-4 py-2 rounded-[10px] text-xs font-mono font-medium text-secondary hover:text-primary bg-surface hover:bg-surface-hover border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmModeSwitch}
            className="px-4 py-2 rounded-[10px] text-xs font-mono font-semibold text-white bg-primary hover:bg-primary/90 shadow-xs transition-colors"
          >
            Confirm Switch to {pendingMode}
          </button>
        </div>
      </div>
    </div>
  );
};
