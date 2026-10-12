import React from 'react';
import { useTelemetry } from '../../providers/TelemetryProvider';
import { useSidebar } from '../../providers/SidebarProvider';
import { useSimulator } from '../../providers/SimulatorProvider';
import { Menu, PanelLeftClose, PanelLeft, Gauge } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { status, backendConnected, lastUpdate, loggerDevice, gatewayDevice, isStale } = useTelemetry();
  const { isCollapsed, toggleCollapse, toggleMobile } = useSidebar();
  const { simState, operatingMode, setOperatingMode, openFloatingConsole, layout } = useSimulator();

  const loggerStatus = loggerDevice ? loggerDevice.status : (backendConnected && status !== 'DISCONNECTED' ? 'ONLINE' : 'OFFLINE');
  const gatewayStatus = gatewayDevice ? gatewayDevice.status : (backendConnected && status !== 'DISCONNECTED' ? 'ONLINE' : 'OFFLINE');
  const backendStatus = backendConnected ? 'CONNECTED' : 'DISCONNECTED';

  return (
    <header className="fixed top-3 sm:top-4 left-4 sm:left-6 right-4 sm:right-6 h-[66px] sm:h-[68px] z-30 flex items-center justify-between px-4 sm:px-6 rounded-[22px] glass-panel select-none">
      {/* Left branding & collapse toggle */}
      <div className="flex items-center gap-3">
        {/* Mobile drawer toggle */}
        <button
          onClick={toggleMobile}
          className="lg:hidden p-1.5 rounded-[9px] text-secondary hover:text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
          aria-label="Open mobile navigation"
        >
          <Menu size={18} />
        </button>

        {/* Desktop collapse toggle button */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex items-center justify-center p-1.5 rounded-[9px] text-secondary hover:text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        >
          {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <div className="w-px h-4 bg-border/80 hidden sm:block" />

        <div className="flex items-baseline gap-2.5">
          <span className="text-[16px] font-[650] tracking-[-0.2px] text-primary">APEX BLACKBOX</span>
          <span className="text-[13px] text-secondary hidden sm:inline font-normal">Vehicle Data Recorder</span>
        </div>
      </div>

      {/* Right aligned status strip on one baseline */}
      <div className="flex items-center gap-3.5 sm:gap-4.5 text-xs">
        {/* Floating Simulator Launcher Button */}
        <button
          onClick={openFloatingConsole}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] border transition-all text-[11px] font-mono font-medium shadow-xs ${
            layout.isOpen
              ? 'bg-accent text-white border-accent'
              : 'bg-white hover:bg-surface-hover text-primary border-border hover:border-accent/40'
          }`}
          title="Open Floating Vehicle Simulator Console"
        >
          <Gauge size={14} className={layout.isOpen ? 'text-white' : 'text-accent'} />
          <span className="hidden sm:inline">Sim Console</span>
          {simState.is_running && (
            <span className="tabular-nums font-bold ml-0.5">
              {Math.round(simState.vehicle_speed_kmh)} km/h
            </span>
          )}
        </button>

        <div className="w-px h-3.5 bg-border/80 hidden md:block" />

        {/* Logger status */}
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-secondary">Logger</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              loggerStatus === 'ONLINE' ? 'bg-success' : 'bg-error'
            }`}
          />
          <span className={`font-mono text-[11px] font-medium ${loggerStatus === 'ONLINE' ? 'text-primary' : 'text-error'}`}>
            {loggerStatus}
          </span>
        </div>

        <div className="w-px h-3.5 bg-border/80 hidden md:block" />

        {/* Gateway status */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-secondary">Gateway</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              gatewayStatus === 'ONLINE' ? 'bg-success' : 'bg-error'
            }`}
          />
          <span className={`font-mono text-[11px] font-medium ${gatewayStatus === 'ONLINE' ? 'text-primary' : 'text-error'}`}>
            {gatewayStatus}
          </span>
        </div>

        <div className="w-px h-3.5 bg-border/80 hidden sm:block" />

        {/* Database status */}
        <div className="flex items-center gap-1.5">
          <span className="text-secondary">Database</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              backendConnected ? 'bg-success' : 'bg-error'
            }`}
          />
          <span className={`font-mono text-[11px] font-medium ${backendConnected ? 'text-primary' : 'text-error'}`}>
            {backendStatus}
          </span>
        </div>

        <div className="w-px h-3.5 bg-border/80 hidden lg:block" />

        {/* Last update timestamp */}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="text-secondary">Updated</span>
          <span className={`font-mono text-[11px] tabular-nums ${isStale ? 'text-warning font-medium' : 'text-primary'}`}>
            {lastUpdate
              ? new Date(lastUpdate).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : 'N/A'}
          </span>
          {isStale && (
            <span className="text-[10px] font-mono text-warning bg-warning-subtle px-1.5 py-0.2 rounded-[4px] border border-warning/20">
              STALE
            </span>
          )}
        </div>

        <div className="w-px h-3.5 bg-border/80" />

        {/* Operating mode badge with deliberate toggle */}
        <div>
          {operatingMode === 'SIMULATION' ? (
            <button
              onClick={() => setOperatingMode('HARDWARE')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[999px] text-[11px] font-mono font-medium text-warning bg-warning-subtle border border-warning/30 hover:border-warning/60 cursor-pointer transition-colors"
              title="Simulation Mode Active. Click to switch to Hardware Mode"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              Simulation
            </button>
          ) : (
            <button
              onClick={() => setOperatingMode('SIMULATION')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[999px] text-[11px] font-mono font-medium text-success bg-success-subtle border border-success/30 hover:border-success/60 cursor-pointer transition-colors"
              title="Hardware Mode Active. Click to switch to Simulation Mode"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Live Mode
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

