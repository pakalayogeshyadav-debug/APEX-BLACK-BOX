export interface TelemetryData {
  timestamp: string;
  speed: number | null;
  rpm: number | null;
  throttle: number | null;
  deceleration: number | null;
  canFrameCount?: number | null;
  droppedFrameCount?: number | null;
  simulated: boolean;
  sequenceNumber?: number;
}

export interface EventRecord {
  id: string;
  device_id?: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  trigger_timestamp_ms: number;
  detected_at: string;
  description: string;
  recording_id?: string | null;
  source_mode: string;
}

export interface Recording {
  id: string;
  device_id: string;
  session_id?: string | null;
  recording_type: string;
  source_mode: string;
  requested_at: string;
  recording_start_at?: string | null;
  recording_end_at?: string | null;
  requested_duration_sec: number;
  actual_duration_sec?: number | null;
  sample_count: number;
  missing_data_info?: any;
  retrieval_request_id: string;
  transfer_status: string;
  integrity_status: string;
  created_at: string;
}

export interface DeviceInfo {
  id: string;
  device_identifier: string;
  device_role: 'LOGGER' | 'GATEWAY';
  hardware_model: string;
  firmware_version: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceHealth {
  status: 'healthy' | 'warning' | 'critical' | 'disconnected';
  lastSeen: string;
  details?: Record<string, string>;
}

export interface SystemStatus {
  mode: 'LIVE' | 'SIMULATION' | 'REPLAY' | 'DISCONNECTED';
  logger: DeviceHealth;
  gateway: DeviceHealth;
  backend: DeviceHealth;
  lastUpdate: string;
}

export type DiagnosticStatusType =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DEGRADED'
  | 'UNKNOWN'
  | 'NOT_CONFIGURED'
  | 'SIMULATED'
  | 'ERROR'
  | 'BUSY'
  | 'STALE';

export interface SubsystemDiagnostic {
  name: string;
  status: DiagnosticStatusType;
  last_checked: string;
  details: Record<string, any>;
  error?: string | null;
}

export interface SerialPortInfo {
  port: string;
  description: string;
  hwid: string;
  manufacturer?: string | null;
  is_probable_esp32: boolean;
  is_busy?: boolean;
  is_bluetooth?: boolean;
  device_type?: string;
  last_detected_at?: string;
}

export interface SerialProbeResponse {
  port: string;
  status: DiagnosticStatusType;
  device_verified: boolean;
  device_info?: Record<string, any> | null;
  message: string;
}

export interface ESP32DeviceDiagnostic {
  name: string;
  role: string;
  status: DiagnosticStatusType;
  port?: string | null;
  device_id?: string | null;
  device_verified: boolean;
  firmware_version?: string | null;
  protocol_version?: number | null;
  uptime_ms?: number | null;
  can_status?: string | null;
  can_frames_received: number;
  last_heartbeat_at?: string | null;
  last_message_at?: string | null;
  last_successful_comm?: string | null;
  last_error?: string | null;
  received_line_count: number;
  parsed_json_count: number;
  malformed_message_count: number;
  connection_error_count: number;
  details: Record<string, any>;
}

export interface OverallDiagnosticsResponse {
  timestamp: string;
  backend: SubsystemDiagnostic;
  database: SubsystemDiagnostic;
  serial_interface: SubsystemDiagnostic;
  esp32_logger: SubsystemDiagnostic;
  esp32_gateway: SubsystemDiagnostic;
  logger_to_gateway: SubsystemDiagnostic;
  can_bus: SubsystemDiagnostic;
  gateway_to_backend: SubsystemDiagnostic;
  telemetry_reception: SubsystemDiagnostic;
  detected_serial_ports: SerialPortInfo[];
  can_receiver?: ESP32DeviceDiagnostic | null;
  vehicle_simulator?: ESP32DeviceDiagnostic | null;
}

export type CANTransceiverProfile = 'SN65HVD230' | 'TJA1050';
export type CANBitrate = 125000 | 250000 | 500000 | 1000000;
export type CANMode = 'LISTEN_ONLY' | 'NORMAL';

export interface CANControllerConfig {
  transceiver_profile: CANTransceiverProfile;
  controller_interface: string;
  tx_gpio: number;
  rx_gpio: number;
  mode_control_gpio?: number | null;
  bitrate: CANBitrate;
  mode: CANMode;
  standard_frame_support: boolean;
  extended_frame_support: boolean;
  identifier_filters?: number[] | null;
  enabled: boolean;
}

export interface RawCANFrame {
  timestamp_us: number;
  sequence_number: number;
  can_id: number;
  is_extended: boolean;
  is_remote: boolean;
  dlc: number;
  payload_bytes: string;
  channel_id: number;
  status: string;
}

export interface DecodedTelemetrySignal {
  signal_name: string;
  value: number | null;
  unit: string;
  is_valid: boolean;
  source_can_id: number;
  timestamp_us: number;
}
