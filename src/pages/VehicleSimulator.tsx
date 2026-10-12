import React from 'react';
import { useSimulator } from '../providers/SimulatorProvider';
import { VirtualInstrumentCluster } from '../components/simulator/VirtualInstrumentCluster';
import { DriverControlsPanel } from '../components/simulator/DriverControlsPanel';
import { VehicleTelemetryGrid } from '../components/simulator/VehicleTelemetryGrid';
import { SimulationScenariosPanel } from '../components/simulator/SimulationScenariosPanel';
import { SimulatorActionToolbar } from '../components/simulator/SimulatorActionToolbar';
import { ExternalLink, Database, Cpu, Radio, ShieldAlert } from 'lucide-react';

export const VehicleSimulator: React.FC = () => {
  const { simState, openFloatingConsole } = useSimulator();

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[25px] font-semibold tracking-tight leading-tight text-primary">
              Vehicle Simulator
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold text-warning bg-warning-subtle border border-warning/30">
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              SIMULATION MODE
            </span>
          </div>
          <p className="text-[14px] text-secondary mt-1">
            Deterministic, time-stepped automotive dynamics and sensor simulation console.
          </p>
        </div>

        {/* Status Strip & Quick Detach */}
        <div className="flex items-center gap-3">
          <button
            onClick={openFloatingConsole}
            className="flex items-center gap-2 px-3.5 py-2 rounded-[10px] bg-white border border-border text-xs font-mono font-semibold text-primary shadow-xs hover:border-accent/40 hover:bg-surface-hover transition-colors"
            title="Detach this console into a floating window to monitor other dashboard pages simultaneously"
          >
            <ExternalLink size={14} className="text-accent" />
            <span>Detach Console</span>
          </button>
        </div>
      </div>

      {/* SECTION E: CONNECTION & DATA-SOURCE STATUS BANNER */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-[14px] bg-surface-secondary/70 border border-border text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Radio size={14} className="text-accent" />
            <span className="text-secondary">Source:</span>
            <span className="font-semibold text-primary">SIMULATION</span>
          </div>

          <div className="w-px h-3.5 bg-border" />

          <div className="flex items-center gap-1.5">
            <Cpu size={14} className="text-accent" />
            <span className="text-secondary">Target Device:</span>
            <span className="font-semibold text-primary">apex-vehicle-simulator-01</span>
          </div>

          <div className="w-px h-3.5 bg-border hidden md:block" />

          <div className="hidden md:flex items-center gap-1.5">
            <Database size={14} className="text-accent" />
            <span className="text-secondary">Pipeline:</span>
            <span className="font-semibold text-primary">FastAPI Ingestion &bull; MySQL Safe</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted">
          <ShieldAlert size={14} className="text-warning" />
          <span>Hardware CAN Isolation: ACTIVE (Hardware Mode Unaffected)</span>
        </div>
      </div>

      {/* SECTION F: SIMULATION & RECORDING CONTROLS */}
      <SimulatorActionToolbar onDetach={openFloatingConsole} />

      {/* MAIN CONSOLE LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SECTION A: VIRTUAL INSTRUMENT CLUSTER (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <VirtualInstrumentCluster simState={simState} />
        </div>

        {/* SECTION B: DRIVER CONTROLS (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <DriverControlsPanel />
        </div>
      </div>

      {/* SECTION C: VEHICLE TELEMETRY READOUTS */}
      <VehicleTelemetryGrid simState={simState} />

      {/* SECTION D: SIMULATION SCENARIOS */}
      <SimulationScenariosPanel />
    </div>
  );
};
