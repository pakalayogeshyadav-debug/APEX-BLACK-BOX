import React, { useState } from 'react';
import { useSimulator } from '../../providers/SimulatorProvider';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Disc,
  CircleDot
} from 'lucide-react';

interface Props {
  onDetach?: () => void;
  isFloating?: boolean;
}

export const SimulatorActionToolbar: React.FC<Props> = ({ onDetach, isFloating = false }) => {
  const {
    simState,
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    triggerTestEvent,
    startSimRecording,
    stopSimRecording,
    openFloatingConsole
  } = useSimulator();

  const [selectedEvent, setSelectedEvent] = useState('HARD_BRAKING');
  const [isTriggering, setIsTriggering] = useState(false);
  const [eventToast, setEventToast] = useState<string | null>(null);

  const handleTrigger = async () => {
    setIsTriggering(true);
    const res = await triggerTestEvent(selectedEvent, 'high', `Manual test event triggered: ${selectedEvent}`);
    setIsTriggering(false);
    if (res) {
      setEventToast(`Event #${res.event?.id?.slice(0, 8) || 'OK'} generated`);
      setTimeout(() => setEventToast(null), 3500);
    }
  };

  const handleDetachClick = () => {
    if (onDetach) {
      onDetach();
    } else {
      openFloatingConsole();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface rounded-[16px] border border-border shadow-xs select-none">
      {/* Simulation Lifecycle Group */}
      <div className="flex items-center gap-2">
        {!simState.is_running ? (
          <button
            onClick={startSimulation}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-accent text-white font-mono text-xs font-semibold shadow-xs hover:bg-accent/90 transition-colors"
          >
            <Play size={14} />
            <span>Start Sim</span>
          </button>
        ) : simState.is_paused ? (
          <button
            onClick={resumeSimulation}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-accent text-white font-mono text-xs font-semibold shadow-xs hover:bg-accent/90 transition-colors"
          >
            <Play size={14} />
            <span>Resume</span>
          </button>
        ) : (
          <button
            onClick={pauseSimulation}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-surface text-primary border border-border font-mono text-xs font-semibold hover:bg-surface-hover transition-colors"
          >
            <Pause size={14} />
            <span>Pause</span>
          </button>
        )}

        {simState.is_running && (
          <button
            onClick={stopSimulation}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface text-secondary hover:text-error border border-border font-mono text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            <Square size={14} />
            <span>Stop</span>
          </button>
        )}

        <button
          onClick={resetSimulation}
          className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface text-secondary hover:text-primary border border-border font-mono text-xs font-medium hover:bg-surface-hover transition-colors"
          title="Reset Simulation State (Key: R)"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>

        {/* State Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-surface-secondary text-[11px] font-mono border border-border/80 ml-1">
          <span
            className={`w-2 h-2 rounded-full ${
              simState.is_running
                ? simState.is_paused
                  ? 'bg-warning'
                  : 'bg-success animate-pulse'
                : 'bg-muted'
            }`}
          />
          <span className="font-semibold text-secondary">
            {simState.is_running
              ? simState.is_paused
                ? 'PAUSED'
                : 'RUNNING'
              : 'STOPPED'}
          </span>
        </div>
      </div>

      {/* Middle: Black-Box Recording & Event Triggering */}
      <div className="flex items-center gap-3">
        {/* Recording Toggle */}
        {simState.is_recording ? (
          <button
            onClick={stopSimRecording}
            className="flex items-center gap-2 px-3.5 py-2 rounded-[10px] bg-error text-white font-mono text-xs font-semibold shadow-xs animate-pulse"
          >
            <CircleDot size={14} />
            <span>STOP RECORDING</span>
          </button>
        ) : (
          <button
            onClick={() => startSimRecording(300)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface text-secondary hover:text-primary border border-border font-mono text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            <Disc size={14} className="text-error" />
            <span>Record Sim</span>
          </button>
        )}

        {/* Test Event Trigger */}
        <div className="flex items-center gap-1.5 bg-surface-secondary/70 border border-border p-1 rounded-[10px]">
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="bg-transparent text-xs font-mono text-primary font-medium px-2 py-1 outline-none cursor-pointer"
          >
            <option value="HARD_BRAKING">HARD_BRAKING</option>
            <option value="ENGINE_OVERHEAT">ENGINE_OVERHEAT</option>
            <option value="LOW_BATTERY">LOW_BATTERY</option>
            <option value="COLLISION_ALERT">COLLISION_ALERT</option>
          </select>

          <button
            onClick={handleTrigger}
            disabled={isTriggering}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-primary text-white text-xs font-mono font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <AlertTriangle size={12} />
            <span>Trigger</span>
          </button>
        </div>

        {eventToast && (
          <span className="text-[11px] font-mono text-success font-semibold animate-fade-in">
            {eventToast}
          </span>
        )}
      </div>

      {/* Right: Floating / Detach Button */}
      {!isFloating && (
        <div>
          <button
            onClick={handleDetachClick}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-surface-secondary text-primary border border-border font-mono text-xs font-semibold hover:bg-surface-hover hover:border-accent/40 transition-colors shadow-xs"
            title="Detach and open as floating window across dashboard pages"
          >
            <ExternalLink size={14} className="text-accent" />
            <span>Floating Console</span>
          </button>
        </div>
      )}
    </div>
  );
};
