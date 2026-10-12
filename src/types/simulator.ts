export type GearType = 'P' | 'R' | 'N' | 'D';
export type TurnIndicatorType = 'LEFT' | 'RIGHT' | 'OFF';

export interface VehicleSimState {
  vehicle_speed_kmh: number;
  signed_speed_kmh: number;
  engine_rpm: number;
  current_gear: GearType;
  active_drive_gear: number | null;
  ignition: boolean;
  parking_brake: boolean;
  accelerator_percent: number;
  brake_percent: number;
  steering_angle_percent: number;
  steering_angle_deg: number;
  heading_deg: number;
  heading_cardinal: string;
  coolant_temp_c: number;
  battery_voltage_v: number;
  engine_load_percent: number;
  longitudinal_accel_mps2: number;
  deceleration_mps2: number;
  headlights: boolean;
  turn_indicators: TurnIndicatorType;
  hazard_lights: boolean;
  source_mode: string;
  is_running: boolean;
  is_paused: boolean;
  session_id: string;
  device_id: string;
  sequence_number: number;
  active_scenario: string | null;
  scenario_elapsed_sec: number;
  rolling_buffer_samples: number;
  is_recording: boolean;
  active_recording_id: string | null;
}

export interface DriverControls {
  accelerator: number;
  brake: number;
  steering: number;
  gear: GearType;
  ignition: boolean;
  parking_brake: boolean;
  headlights: boolean;
  turn_indicators: TurnIndicatorType;
  hazard_lights: boolean;
}

export type PresetScenarioName =
  | 'Idle'
  | 'City Driving'
  | 'Highway Cruising'
  | 'Hard Braking'
  | 'Sudden Acceleration'
  | 'Engine Overheating'
  | 'Low Battery'
  | 'Ignition Off'
  | 'Custom Drive';

export interface PresetScenarioInfo {
  name: PresetScenarioName;
  tagline: string;
  description: string;
  badge: 'normal' | 'performance' | 'critical' | 'diagnostic';
}

export type ConsoleWindowMode = 'floating' | 'docked' | 'embedded';
export type ConsoleViewMode = 'compact' | 'expanded';

export interface ConsoleLayoutPreference {
  version: number;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  windowMode: ConsoleWindowMode;
  viewMode: ConsoleViewMode;
  x: number;
  y: number;
  width: number;
  height: number;
  dockPosition?: 'right' | 'bottom';
}

export type SimulatorTargetType = 'SOFTWARE' | 'HARDWARE_WIFI';
export type HardwareSimulatorStatusType = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export interface HardwareSimulatorState {
  connected: boolean;
  status: HardwareSimulatorStatusType;
  base_url: string;
  latency_ms?: number;
  last_error?: string;
  device?: Record<string, any>;
}
