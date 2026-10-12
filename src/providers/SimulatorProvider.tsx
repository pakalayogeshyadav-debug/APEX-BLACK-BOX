import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type {
  VehicleSimState,
  DriverControls,
  PresetScenarioName,
  ConsoleLayoutPreference,
  ConsoleViewMode,
  ConsoleWindowMode,
  SimulatorTargetType,
  HardwareSimulatorState
} from '../types/simulator';
import { validateAndClampLayout, isTypingInInputElement } from '../utils/simulatorLayout';

interface SimulatorContextType {
  simState: VehicleSimState;
  controls: DriverControls;
  operatingMode: 'HARDWARE' | 'SIMULATION';
  setOperatingMode: (mode: 'HARDWARE' | 'SIMULATION') => void;
  isModeSwitchConfirmOpen: boolean;
  cancelModeSwitch: () => void;
  confirmModeSwitch: () => void;
  pendingMode: 'HARDWARE' | 'SIMULATION' | null;

  // Simulator Target (Local Software vs ESP32 Hardware Wi-Fi)
  simulatorTarget: SimulatorTargetType;
  setSimulatorTarget: (target: SimulatorTargetType) => void;
  hardwareSimulatorInfo: HardwareSimulatorState;
  checkHardwareSimulator: () => Promise<void>;
  configureHardwareSimulatorUrl: (url: string) => Promise<boolean>;
  hardwareCommandError: string | null;
  clearHardwareCommandError: () => void;

  // Lifecycle
  startSimulation: () => Promise<void>;
  stopSimulation: () => Promise<void>;
  pauseSimulation: () => Promise<void>;
  resumeSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;

  // Controls
  updateControls: (newControls: Partial<DriverControls>) => void;
  startScenario: (name: PresetScenarioName) => Promise<void>;
  stopScenario: () => Promise<void>;
  triggerTestEvent: (eventType: string, severity?: string, description?: string) => Promise<any>;
  startSimRecording: (durationSec?: number) => Promise<any>;
  stopSimRecording: () => Promise<any>;

  // Floating window layout management
  layout: ConsoleLayoutPreference;
  setLayout: React.Dispatch<React.SetStateAction<ConsoleLayoutPreference>>;
  openFloatingConsole: () => void;
  closeFloatingConsole: () => void;
  toggleMinimize: () => void;
  toggleMaximize: () => void;
  snapToEdge: (edge: 'left' | 'right' | 'top-right' | 'bottom-right') => void;
  resetLayout: () => void;
  setViewMode: (mode: ConsoleViewMode) => void;
  setWindowMode: (mode: ConsoleWindowMode) => void;

  // Active pressed keys display
  activeKeys: Set<string>;
}

const DEFAULT_STATE: VehicleSimState = {
  vehicle_speed_kmh: 0.0,
  signed_speed_kmh: 0.0,
  engine_rpm: 0,
  current_gear: 'P',
  active_drive_gear: null,
  ignition: false,
  parking_brake: true,
  accelerator_percent: 0.0,
  brake_percent: 0.0,
  steering_angle_percent: 0.0,
  steering_angle_deg: 0.0,
  heading_deg: 0.0,
  heading_cardinal: 'N',
  coolant_temp_c: 28.0,
  battery_voltage_v: 12.5,
  engine_load_percent: 0.0,
  longitudinal_accel_mps2: 0.0,
  deceleration_mps2: 0.0,
  headlights: false,
  turn_indicators: 'OFF',
  hazard_lights: false,
  source_mode: 'SIMULATION',
  is_running: false,
  is_paused: false,
  session_id: '',
  device_id: 'apex-vehicle-simulator-01',
  sequence_number: 0,
  active_scenario: null,
  scenario_elapsed_sec: 0.0,
  rolling_buffer_samples: 0,
  is_recording: false,
  active_recording_id: null
};

const DEFAULT_CONTROLS: DriverControls = {
  accelerator: 0.0,
  brake: 0.0,
  steering: 0.0,
  gear: 'P',
  ignition: false,
  parking_brake: true,
  headlights: false,
  turn_indicators: 'OFF',
  hazard_lights: false
};

const STORAGE_KEY = 'apex_simulator_layout_v1';

const getInitialLayout = (): ConsoleLayoutPreference => {
  if (typeof window === 'undefined') return validateAndClampLayout(null);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return validateAndClampLayout(null, window.innerWidth, window.innerHeight);
    const parsed = JSON.parse(raw);
    return validateAndClampLayout(parsed, window.innerWidth, window.innerHeight);
  } catch (e) {
    console.error('Failed to load saved simulator layout preference', e);
  }
  return validateAndClampLayout(null);
};

const SimulatorContext = createContext<SimulatorContextType | undefined>(undefined);

export const SimulatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [simState, setSimState] = useState<VehicleSimState>(DEFAULT_STATE);
  const [controls, setControls] = useState<DriverControls>(DEFAULT_CONTROLS);
  const [operatingMode, setOperatingModeState] = useState<'HARDWARE' | 'SIMULATION'>('SIMULATION');
  const [isModeSwitchConfirmOpen, setIsModeSwitchConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'HARDWARE' | 'SIMULATION' | null>(null);
  const [layout, setLayout] = useState<ConsoleLayoutPreference>(getInitialLayout);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  // Hardware ESP32 Simulator (Wi-Fi) State
  const [simulatorTarget, setSimulatorTarget] = useState<SimulatorTargetType>('SOFTWARE');
  const [hardwareSimulatorInfo, setHardwareSimulatorInfo] = useState<HardwareSimulatorState>({
    connected: false,
    status: 'DISCONNECTED',
    base_url: 'http://192.168.1.100'
  });
  const [hardwareCommandError, setHardwareCommandError] = useState<string | null>(null);
  const clearHardwareCommandError = useCallback(() => setHardwareCommandError(null), []);

  const controlThrottleRef = useRef<number>(0);
  const pendingControlsRef = useRef<Partial<DriverControls> | null>(null);
  const keysDownRef = useRef<Set<string>>(new Set());
  const keyLoopRef = useRef<number | null>(null);

  // Persist layout changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // ignore quota errors
    }
  }, [layout]);

  // Adjust coordinates on window resize
  useEffect(() => {
    const handleResize = () => {
      setLayout(prev => {
        const maxX = Math.max(10, window.innerWidth - (prev.isMinimized ? 220 : 380));
        const maxY = Math.max(10, window.innerHeight - 100);
        return {
          ...prev,
          x: Math.min(prev.x, maxX),
          y: Math.min(prev.y, maxY),
          width: Math.min(prev.width, window.innerWidth - 20),
          height: Math.min(prev.height, window.innerHeight - 40)
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch initial simulator state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/state');
      if (res.ok) {
        const data = await res.json();
        setSimState(data);
        setControls(prev => ({
          ...prev,
          accelerator: data.accelerator_percent,
          brake: data.brake_percent,
          steering: data.steering_angle_percent,
          gear: data.current_gear,
          ignition: data.ignition,
          parking_brake: data.parking_brake,
          headlights: data.headlights,
          turn_indicators: data.turn_indicators,
          hazard_lights: data.hazard_lights
        }));
      }
    } catch {
      // API unavailable
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // WebSocket message listener for simulator.state
  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8000/api/v1/ws/telemetry`;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'simulator.state' && payload.data) {
              setSimState(payload.data);
            }
          } catch {
            // parse error
          }
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Check ESP32 hardware simulator connectivity via LAN Wi-Fi
  const checkHardwareSimulator = useCallback(async () => {
    try {
      setHardwareSimulatorInfo(prev => ({ ...prev, status: 'CONNECTING' }));
      const res = await fetch('http://localhost:8000/api/v1/hardware-simulator/status');
      if (res.ok) {
        const data = await res.json();
        setHardwareSimulatorInfo({
          connected: Boolean(data.connected),
          status: data.status || (data.connected ? 'CONNECTED' : 'DISCONNECTED'),
          base_url: data.base_url || 'http://192.168.1.100',
          latency_ms: data.latency_ms,
          last_error: data.error,
          device: data.device
        });
      } else {
        setHardwareSimulatorInfo(prev => ({
          ...prev,
          connected: false,
          status: 'ERROR',
          last_error: `Server HTTP ${res.status}`
        }));
      }
    } catch (e: any) {
      setHardwareSimulatorInfo(prev => ({
        ...prev,
        connected: false,
        status: 'DISCONNECTED',
        last_error: e.message || 'Cannot reach bridge'
      }));
    }
  }, []);

  const configureHardwareSimulatorUrl = useCallback(async (newUrl: string): Promise<boolean> => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/hardware-simulator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: newUrl })
      });
      if (res.ok) {
        const data = await res.json();
        setHardwareSimulatorInfo(prev => ({ ...prev, base_url: data.base_url }));
        await checkHardwareSimulator();
        return true;
      }
    } catch (e) {
      console.error('Failed to configure hardware simulator URL', e);
    }
    return false;
  }, [checkHardwareSimulator]);

  // Periodic polling for hardware simulator connectivity when selected
  useEffect(() => {
    if (simulatorTarget === 'HARDWARE_WIFI') {
      checkHardwareSimulator();
      const interval = setInterval(checkHardwareSimulator, 6000);
      return () => clearInterval(interval);
    }
  }, [simulatorTarget, checkHardwareSimulator]);

  // Send controls to backend with throttling
  const sendControls = useCallback(async (newControls: Partial<DriverControls>) => {
    try {
      // If hardware simulator is targeted, forward over Wi-Fi bridge
      if (simulatorTarget === 'HARDWARE_WIFI') {
        const hwRes = await fetch('http://localhost:8000/api/v1/hardware-simulator/controls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newControls)
        });
        if (hwRes.ok) {
          const hwData = await hwRes.json();
          setHardwareCommandError(null);
          setHardwareSimulatorInfo(prev => ({
            ...prev,
            connected: true,
            status: 'CONNECTED',
            latency_ms: hwData.latency_ms
          }));
        } else {
          const errData = await hwRes.json().catch(() => ({}));
          setHardwareCommandError(errData.detail || `ESP32 returned HTTP ${hwRes.status}`);
          setHardwareSimulatorInfo(prev => ({
            ...prev,
            status: hwRes.status === 503 ? 'DISCONNECTED' : 'ERROR',
            last_error: errData.detail
          }));
        }
      }

      // Maintain local Python simulator state synchronization
      const res = await fetch('http://localhost:8000/api/v1/simulator/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newControls)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to send controls', e);
    }
  }, [simulatorTarget]);

  const updateControls = useCallback((newControls: Partial<DriverControls>) => {
    setControls(prev => {
      const merged = { ...prev, ...newControls };
      pendingControlsRef.current = newControls;

      const now = Date.now();
      if (now - controlThrottleRef.current > 40) { // ~25 Hz throttling
        controlThrottleRef.current = now;
        sendControls(newControls);
      } else {
        if (!pendingControlsRef.current) {
          setTimeout(() => {
            if (pendingControlsRef.current) {
              sendControls(pendingControlsRef.current);
              pendingControlsRef.current = null;
            }
          }, 45);
        }
      }
      return merged;
    });
  }, [sendControls]);

  // Mode switching with safety check
  const setOperatingMode = (mode: 'HARDWARE' | 'SIMULATION') => {
    if (mode === operatingMode) return;
    if (simState.is_recording || (operatingMode === 'SIMULATION' && simState.is_running && simState.vehicle_speed_kmh > 0)) {
      setPendingMode(mode);
      setIsModeSwitchConfirmOpen(true);
    } else {
      setOperatingModeState(mode);
    }
  };

  const confirmModeSwitch = () => {
    if (pendingMode) {
      // If leaving simulation, stop controls
      if (pendingMode === 'HARDWARE') {
        releaseAllKeys();
      }
      setOperatingModeState(pendingMode);
      setPendingMode(null);
    }
    setIsModeSwitchConfirmOpen(false);
  };

  const cancelModeSwitch = () => {
    setPendingMode(null);
    setIsModeSwitchConfirmOpen(false);
  };

  // Simulation lifecycle
  const startSimulation = async () => {
    try {
      if (simulatorTarget === 'HARDWARE_WIFI') {
        await fetch('http://localhost:8000/api/v1/hardware-simulator/start', { method: 'POST' }).catch(() => {});
      }
      const res = await fetch('http://localhost:8000/api/v1/simulator/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to start simulation', e);
    }
  };

  const stopSimulation = async () => {
    releaseAllKeys();
    try {
      if (simulatorTarget === 'HARDWARE_WIFI') {
        await fetch('http://localhost:8000/api/v1/hardware-simulator/stop', { method: 'POST' }).catch(() => {});
      }
      const res = await fetch('http://localhost:8000/api/v1/simulator/stop', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to stop simulation', e);
    }
  };

  const pauseSimulation = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/pause', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to pause simulation', e);
    }
  };

  const resumeSimulation = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/resume', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to resume simulation', e);
    }
  };

  const resetSimulation = async () => {
    releaseAllKeys();
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
        setControls(DEFAULT_CONTROLS);
      }
    } catch (e) {
      console.error('Failed to reset simulation', e);
    }
  };

  const startScenario = async (name: PresetScenarioName) => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/scenario/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_name: name })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to start scenario', e);
    }
  };

  const stopScenario = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/scenario/stop', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setSimState(data.state);
      }
    } catch (e) {
      console.error('Failed to stop scenario', e);
    }
  };

  const triggerTestEvent = async (eventType: string, severity = 'medium', description?: string) => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/trigger-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, severity, description })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Failed to trigger test event', e);
    }
    return null;
  };

  const startSimRecording = async (durationSec = 300) => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/recording/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_sec: durationSec })
      });
      if (res.ok) {
        const data = await res.json();
        setSimState(prev => ({ ...prev, is_recording: true, active_recording_id: data.recording_id }));
        return data;
      }
    } catch (e) {
      console.error('Failed to start simulation recording', e);
    }
    return null;
  };

  const stopSimRecording = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/simulator/recording/stop', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSimState(prev => ({ ...prev, is_recording: false, active_recording_id: null }));
        return data;
      }
    } catch (e) {
      console.error('Failed to stop simulation recording', e);
    }
    return null;
  };

  // Keyboard loop & controls
  const releaseAllKeys = useCallback(() => {
    keysDownRef.current.clear();
    setActiveKeys(new Set());
    updateControls({ accelerator: 0, brake: 0, steering: 0 });
  }, [updateControls]);

  // Window blur auto-release safety
  useEffect(() => {
    const handleBlur = () => {
      releaseAllKeys();
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [releaseAllKeys]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = isTypingInInputElement(
        document.activeElement?.tagName,
        (document.activeElement as HTMLElement)?.isContentEditable
      );
      if (isTyping) return;
      if (operatingMode !== 'SIMULATION') return;

      const code = e.code;
      const key = e.key.toLowerCase();

      if (['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
        keysDownRef.current.add(code);
        setActiveKeys(new Set(keysDownRef.current));
      } else if (key === 'i') {
        // Toggle ignition
        e.preventDefault();
        updateControls({ ignition: !controls.ignition });
      } else if (key === 'r') {
        // Reset simulation
        e.preventDefault();
        resetSimulation();
      } else if (key === 'p') {
        // Toggle park / parking brake
        e.preventDefault();
        const nextGear = controls.gear === 'P' ? 'D' : 'P';
        updateControls({ gear: nextGear, parking_brake: nextGear === 'P' });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keysDownRef.current.has(e.code)) {
        keysDownRef.current.delete(e.code);
        setActiveKeys(new Set(keysDownRef.current));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [operatingMode, controls.ignition, controls.gear, updateControls, resetSimulation]);

  // Key polling loop for smooth acceleration/braking/steering while keys held
  useEffect(() => {
    if (operatingMode !== 'SIMULATION') return;

    keyLoopRef.current = window.setInterval(() => {
      const keys = keysDownRef.current;
      if (keys.size === 0) return;

      const isAccel = keys.has('KeyW') || keys.has('ArrowUp');
      const isBrake = keys.has('KeyS') || keys.has('ArrowDown');
      const isEmergencyBrake = keys.has('Space');
      const isSteerLeft = keys.has('KeyA') || keys.has('ArrowLeft');
      const isSteerRight = keys.has('KeyD') || keys.has('ArrowRight');

      setControls(prev => {
        let acc = prev.accelerator;
        let brk = prev.brake;
        let str = prev.steering;

        if (isEmergencyBrake) {
          acc = 0;
          brk = 100;
        } else {
          if (isAccel) {
            acc = Math.min(100, acc + 10);
            brk = 0;
          } else if (!isAccel && acc > 0) {
            acc = Math.max(0, acc - 15);
          }

          if (isBrake) {
            brk = Math.min(100, brk + 12);
            acc = 0;
          } else if (!isBrake && brk > 0) {
            brk = Math.max(0, brk - 20);
          }
        }

        if (isSteerLeft) {
          str = Math.max(-100, str - 15);
        } else if (isSteerRight) {
          str = Math.min(100, str + 15);
        } else {
          // Return to center
          if (str > 0) str = Math.max(0, str - 20);
          else if (str < 0) str = Math.min(0, str + 20);
        }

        const next = { ...prev, accelerator: acc, brake: brk, steering: str };
        sendControls(next);
        return next;
      });
    }, 50);

    return () => {
      if (keyLoopRef.current) clearInterval(keyLoopRef.current);
    };
  }, [operatingMode, sendControls]);

  // Window controls
  const openFloatingConsole = () => {
    setLayout(prev => ({ ...prev, isOpen: true, isMinimized: false }));
  };

  const closeFloatingConsole = () => {
    // Closing only hides the interface! Simulation is NOT stopped.
    setLayout(prev => ({ ...prev, isOpen: false }));
  };

  const toggleMinimize = () => {
    setLayout(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  };

  const toggleMaximize = () => {
    setLayout(prev => ({
      ...prev,
      isMaximized: !prev.isMaximized,
      isMinimized: false
    }));
  };

  const snapToEdge = (edge: 'left' | 'right' | 'top-right' | 'bottom-right') => {
    setLayout(prev => {
      const w = prev.width;
      const h = prev.height;
      let x = prev.x;
      let y = prev.y;

      if (edge === 'left') {
        x = 24;
        y = 96;
      } else if (edge === 'right') {
        x = Math.max(20, window.innerWidth - w - 24);
        y = 96;
      } else if (edge === 'top-right') {
        x = Math.max(20, window.innerWidth - w - 24);
        y = 96;
      } else if (edge === 'bottom-right') {
        x = Math.max(20, window.innerWidth - w - 24);
        y = Math.max(20, window.innerHeight - h - 30);
      }

      return {
        ...prev,
        x,
        y,
        isMaximized: false,
        isMinimized: false
      };
    });
  };

  const resetLayout = () => {
    setLayout({
      version: 1,
      isOpen: true,
      isMinimized: false,
      isMaximized: false,
      windowMode: 'floating',
      viewMode: 'expanded',
      x: Math.max(20, window.innerWidth - 780),
      y: 94,
      width: 740,
      height: 620
    });
  };

  const setViewMode = (viewMode: ConsoleViewMode) => {
    setLayout(prev => ({ ...prev, viewMode }));
  };

  const setWindowMode = (windowMode: ConsoleWindowMode) => {
    setLayout(prev => ({ ...prev, windowMode }));
  };

  return (
    <SimulatorContext.Provider
      value={{
        simState,
        controls,
        operatingMode,
        setOperatingMode,
        isModeSwitchConfirmOpen,
        cancelModeSwitch,
        confirmModeSwitch,
        pendingMode,
        simulatorTarget,
        setSimulatorTarget,
        hardwareSimulatorInfo,
        checkHardwareSimulator,
        configureHardwareSimulatorUrl,
        hardwareCommandError,
        clearHardwareCommandError,
        startSimulation,
        stopSimulation,
        pauseSimulation,
        resumeSimulation,
        resetSimulation,
        updateControls,
        startScenario,
        stopScenario,
        triggerTestEvent,
        startSimRecording,
        stopSimRecording,
        layout,
        setLayout,
        openFloatingConsole,
        closeFloatingConsole,
        toggleMinimize,
        toggleMaximize,
        snapToEdge,
        resetLayout,
        setViewMode,
        setWindowMode,
        activeKeys
      }}
    >
      {children}
    </SimulatorContext.Provider>
  );
};

export const useSimulator = () => {
  const context = useContext(SimulatorContext);
  if (!context) {
    throw new Error('useSimulator must be used within a SimulatorProvider');
  }
  return context;
};
