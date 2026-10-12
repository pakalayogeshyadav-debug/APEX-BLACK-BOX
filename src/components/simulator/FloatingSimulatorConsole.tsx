import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSimulator } from '../../providers/SimulatorProvider';
import { VirtualInstrumentCluster } from './VirtualInstrumentCluster';
import { DriverControlsPanel } from './DriverControlsPanel';
import { VehicleTelemetryGrid } from './VehicleTelemetryGrid';
import { SimulationScenariosPanel } from './SimulationScenariosPanel';
import { SimulatorActionToolbar } from './SimulatorActionToolbar';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  RotateCcw,
  Layers,
  ArrowLeftToLine,
  ArrowRightToLine,
  GripHorizontal,
  ChevronUp
} from 'lucide-react';

export const FloatingSimulatorConsole: React.FC = () => {
  const {
    simState,
    layout,
    setLayout,
    closeFloatingConsole,
    toggleMinimize,
    toggleMaximize,
    snapToEdge,
    resetLayout,
    setViewMode,
    setWindowMode
  } = useSimulator();

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ mouseX: number; mouseY: number; startW: number; startH: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startW: 0,
    startH: 0,
    startX: 0,
    startY: 0
  });

  const panelRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    // Only drag on left click and avoid clicking buttons
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;

    if (layout.isMaximized) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - layout.x,
      y: e.clientY - layout.y
    });
    e.preventDefault();
  };

  const handleTouchStartHeader = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;
    if (layout.isMaximized || e.touches.length === 0) return;

    const touch = e.touches[0];
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - layout.x,
      y: touch.clientY - layout.y
    });
  };

  // Resizing logic
  const handleMouseDownResize = (direction: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(direction);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: layout.width,
      startH: layout.height,
      startX: layout.x,
      startY: layout.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(10, Math.min(window.innerWidth - 120, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
      setLayout(prev => ({ ...prev, x: newX, y: newY }));
    } else if (isResizing) {
      const deltaX = e.clientX - resizeStart.mouseX;
      const deltaY = e.clientY - resizeStart.mouseY;

      setLayout(prev => {
        let newW = prev.width;
        let newH = prev.height;

        if (isResizing.includes('e')) {
          newW = Math.max(380, Math.min(window.innerWidth - prev.x - 20, resizeStart.startW + deltaX));
        }
        if (isResizing.includes('s')) {
          newH = Math.max(340, Math.min(window.innerHeight - prev.y - 20, resizeStart.startH + deltaY));
        }

        return { ...prev, width: newW, height: newH };
      });
    }
  }, [isDragging, isResizing, dragOffset, resizeStart, setLayout]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging && e.touches.length > 0) {
      const touch = e.touches[0];
      const newX = Math.max(10, Math.min(window.innerWidth - 120, touch.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, touch.clientY - dragOffset.y));
      setLayout(prev => ({ ...prev, x: newX, y: newY }));
    }
  }, [isDragging, dragOffset, setLayout]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp, handleTouchMove]);

  if (!layout.isOpen) return null;

  // MINIMIZED LAUNCHER PILL
  if (layout.isMinimized) {
    return (
      <aside
        aria-label="APEX Simulator Minimized Launcher"
        ref={panelRef}
        style={{ left: `${layout.x}px`, top: `${layout.y}px` }}
        className="fixed z-40 flex items-center gap-3 px-3.5 py-2 rounded-full glass-panel border border-border shadow-2xl bg-white/95 backdrop-blur-md cursor-move select-none animate-fade-in"
        onMouseDown={handleMouseDownHeader}
        onTouchStart={handleTouchStartHeader}
      >
        <div className="flex items-center gap-2 cursor-pointer" onClick={toggleMinimize}>
          <span className={`w-2 h-2 rounded-full ${simState.is_running ? 'bg-success animate-pulse' : 'bg-muted'}`} />
          <span className="font-mono text-xs font-bold text-primary tracking-tight">SIM</span>
          <span className="font-mono text-xs font-bold text-accent tabular-nums">{Math.round(simState.vehicle_speed_kmh)} km/h</span>
          <span className="text-[10px] font-mono text-muted uppercase">[{simState.current_gear}]</span>
        </div>

        <button
          onClick={toggleMinimize}
          className="p-1 rounded-full text-secondary hover:text-primary hover:bg-surface-hover"
          title="Restore Console"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={closeFloatingConsole}
          className="p-1 rounded-full text-secondary hover:text-error hover:bg-surface-hover"
          title="Hide Console (Simulation Continues)"
        >
          <X size={14} />
        </button>
      </aside>
    );
  }

  // DOCKED MODE STYLING VS FLOATING MODE STYLING
  const isDocked = layout.windowMode === 'docked';
  const containerStyle: React.CSSProperties = layout.isMaximized
    ? {
        position: 'fixed',
        left: '20px',
        top: '84px',
        right: '20px',
        bottom: '20px',
        zIndex: 40
      }
    : isDocked
    ? {
        position: 'fixed',
        right: '16px',
        top: '84px',
        bottom: '16px',
        width: `${Math.min(layout.width, window.innerWidth - 40)}px`,
        zIndex: 40
      }
    : {
        position: 'fixed',
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        zIndex: 40
      };

  return (
    <aside
      aria-label="APEX Vehicle Simulator Console"
      ref={panelRef}
      style={containerStyle}
      className="flex flex-col bg-white/98 rounded-[20px] border border-border/90 shadow-2xl backdrop-blur-md overflow-hidden select-none animate-fade-in"
    >
      {/* WINDOW TITLE BAR / DRAG HANDLE */}
      <div
        className={`h-11 px-3.5 bg-surface-secondary/80 border-b border-border/80 flex items-center justify-between transition-colors ${
          !layout.isMaximized && !isDocked ? 'cursor-move' : ''
        }`}
        onMouseDown={handleMouseDownHeader}
        onTouchStart={handleTouchStartHeader}
      >
        {/* Left: Window Title & Status */}
        <div className="flex items-center gap-2.5">
          <GripHorizontal size={15} className="text-muted/60 hidden sm:block" />
          <span className="text-[12px] font-bold font-mono tracking-tight text-primary">
            APEX VEHICLE SIMULATOR
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium text-warning bg-warning-subtle border border-warning/30">
            <span className={`w-1.5 h-1.5 rounded-full ${simState.is_running ? 'bg-warning animate-pulse' : 'bg-muted'}`} />
            {simState.is_running ? 'SIMULATION' : 'STANDBY'}
          </span>
          <span className="text-[11px] font-mono font-semibold text-accent hidden md:inline tabular-nums">
            {Math.round(simState.vehicle_speed_kmh)} km/h
          </span>
        </div>

        {/* Right: Window Controls */}
        <div className="flex items-center gap-1 text-secondary">
          {/* View Mode Toggle (Compact vs Expanded) */}
          <button
            onClick={() => setViewMode(layout.viewMode === 'compact' ? 'expanded' : 'compact')}
            className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover text-xs font-mono px-2"
            title={layout.viewMode === 'compact' ? 'Switch to Expanded View' : 'Switch to Compact HUD'}
          >
            {layout.viewMode === 'compact' ? 'Expanded' : 'Compact'}
          </button>

          {/* Snap Controls */}
          {!layout.isMaximized && !isDocked && (
            <>
              <button
                onClick={() => snapToEdge('left')}
                className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover"
                title="Snap to Left Edge"
              >
                <ArrowLeftToLine size={13} />
              </button>
              <button
                onClick={() => snapToEdge('right')}
                className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover"
                title="Snap to Right Edge"
              >
                <ArrowRightToLine size={13} />
              </button>
            </>
          )}

          {/* Dock / Float Toggle */}
          <button
            onClick={() => setWindowMode(isDocked ? 'floating' : 'docked')}
            className={`p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover ${isDocked ? 'text-accent' : ''}`}
            title={isDocked ? 'Switch to Free Floating Mode' : 'Dock to Right Panel'}
          >
            <Layers size={13} />
          </button>

          {/* Reset position */}
          <button
            onClick={resetLayout}
            className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover"
            title="Reset Position & Dimensions"
          >
            <RotateCcw size={13} />
          </button>

          {/* Minimize */}
          <button
            onClick={toggleMinimize}
            className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover"
            title="Minimize to Floating Launcher"
          >
            <Minus size={13} />
          </button>

          {/* Maximize / Restore */}
          {!isDocked && (
            <button
              onClick={toggleMaximize}
              className="p-1 rounded-[6px] hover:text-primary hover:bg-surface-hover"
              title={layout.isMaximized ? 'Restore Window Size' : 'Maximize Console'}
            >
              {layout.isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {/* Close/Hide */}
          <button
            onClick={closeFloatingConsole}
            className="p-1 rounded-[6px] hover:text-error hover:bg-surface-hover ml-0.5"
            title="Hide Console (Simulation Continues in Background)"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* CONSOLE BODY */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* COMPACT VIEW */}
        {layout.viewMode === 'compact' ? (
          <div className="flex flex-col gap-3">
            <VirtualInstrumentCluster simState={simState} compact={true} />
            <DriverControlsPanel compact={true} />
            <VehicleTelemetryGrid simState={simState} compact={true} />
            <SimulatorActionToolbar isFloating={true} />
          </div>
        ) : (
          /* EXPANDED VIEW */
          <div className="flex flex-col gap-5">
            <SimulatorActionToolbar isFloating={true} />
            <VirtualInstrumentCluster simState={simState} />
            <DriverControlsPanel />
            <VehicleTelemetryGrid simState={simState} />
            <SimulationScenariosPanel />
          </div>
        )}
      </div>

      {/* RESIZE HANDLES (When floating and not maximized) */}
      {!layout.isMaximized && !isDocked && (
        <>
          {/* Right edge */}
          <div
            onMouseDown={(e) => handleMouseDownResize('e', e)}
            className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-accent/30 transition-colors"
          />
          {/* Bottom edge */}
          <div
            onMouseDown={(e) => handleMouseDownResize('s', e)}
            className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-accent/30 transition-colors"
          />
          {/* Bottom-right corner handle */}
          <div
            onMouseDown={(e) => handleMouseDownResize('se', e)}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-accent/40 rounded-br-[20px] transition-colors"
          />
        </>
      )}
    </aside>
  );
};
