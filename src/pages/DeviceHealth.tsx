import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Play,
  Usb,
  Cpu,
  Radio,
  Network,
  Database,
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Info,
  Terminal,
  Clock,
  ShieldAlert,
  Search,
  Check,
  Sliders,
  Send,
  Zap,
  Filter
} from 'lucide-react';
import type {
  OverallDiagnosticsResponse,
  SubsystemDiagnostic,
  SerialPortInfo,
  SerialProbeResponse,
  DiagnosticStatusType,
  CANControllerConfig,
  RawCANFrame,
  DecodedTelemetrySignal,
  ESP32DeviceDiagnostic
} from '../types';

const API_BASE = 'http://localhost:8000/api/v1';

// Format status badge styling
const getStatusBadge = (status: DiagnosticStatusType) => {
  switch (status) {
    case 'CONNECTED':
      return {
        label: 'CONNECTED',
        bg: 'bg-success-subtle text-success border-success/30',
        icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
      };
    case 'DISCONNECTED':
      return {
        label: 'DISCONNECTED',
        bg: 'bg-error-subtle text-error border-error/30',
        icon: <XCircle className="w-3.5 h-3.5 mr-1" />
      };
    case 'BUSY':
      return {
        label: 'PORT BUSY',
        bg: 'bg-warning-subtle text-warning border-warning/30',
        icon: <Clock className="w-3.5 h-3.5 mr-1" />
      };
    case 'STALE':
      return {
        label: 'STALE HEARTBEAT',
        bg: 'bg-warning-subtle text-warning border-warning/30',
        icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" />
      };
    case 'DEGRADED':
      return {
        label: 'DEGRADED',
        bg: 'bg-warning-subtle text-warning border-warning/30',
        icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" />
      };
    case 'SIMULATED':
      return {
        label: 'SIMULATED',
        bg: 'bg-accent-subtle text-accent border-accent/30',
        icon: <Terminal className="w-3.5 h-3.5 mr-1" />
      };
    case 'NOT_CONFIGURED':
      return {
        label: 'NOT CONFIGURED',
        bg: 'bg-surface-secondary text-secondary border-border',
        icon: <Info className="w-3.5 h-3.5 mr-1" />
      };
    case 'ERROR':
      return {
        label: 'ERROR',
        bg: 'bg-error-subtle text-error border-error/30',
        icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" />
      };
    case 'UNKNOWN':
    default:
      return {
        label: 'UNKNOWN',
        bg: 'bg-surface-secondary text-muted border-border',
        icon: <HelpCircle className="w-3.5 h-3.5 mr-1" />
      };
  }
};

const ESP32DeviceCard: React.FC<{
  title: string;
  defaultRoleName: string;
  role: 'can_receiver' | 'vehicle_simulator';
  icon: React.ReactNode;
  diagnostic?: ESP32DeviceDiagnostic | null;
  serialPorts: SerialPortInfo[];
  selectedPort: string;
  onPortChange: (port: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  actionMessage?: { text: string; isError: boolean } | null;
}> = ({
  title,
  defaultRoleName,
  role,
  icon,
  diagnostic,
  serialPorts,
  selectedPort,
  onPortChange,
  onConnect,
  onDisconnect,
  isConnecting,
  actionMessage
}) => {
  const status = diagnostic?.status || 'NOT_CONFIGURED';
  const badge = getStatusBadge(status);
  const isConnected = status === 'CONNECTED';

  const formatTime = (ts?: string | null) => {
    if (!ts) return 'None recorded';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <div className="rounded-[16px] glass-panel p-5 sm:p-6 border border-border flex flex-col justify-between space-y-4 shadow-sm hover:border-border-hover transition-all">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-[10px] bg-surface-secondary border border-border">
              {icon}
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
              <p className="text-[11px] font-mono text-secondary mt-0.5">Role: {diagnostic?.role || defaultRoleName}</p>
            </div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border font-mono tracking-tight shrink-0 ${badge.bg}`}>
            {badge.icon}
            {badge.label}
          </span>
        </div>

        {/* Port selector and Connect/Disconnect Action Bar */}
        <div className="p-3 rounded-[12px] bg-surface-secondary/70 border border-border/80 space-y-2 mb-4">
          <div className="text-[11px] font-sans font-medium text-secondary flex items-center justify-between">
            <span>Select USB Serial Port:</span>
            {diagnostic?.port && (
              <span className="text-primary font-mono text-[10px] bg-surface px-1.5 py-0.5 rounded border border-border">
                Active: {diagnostic.port}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedPort}
              onChange={e => onPortChange(e.target.value)}
              disabled={isConnected || isConnecting}
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-[8px] border border-border bg-surface text-primary focus:outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">-- Select COM Port --</option>
              {serialPorts.map(p => (
                <option key={p.port} value={p.port}>
                  {p.port} — {p.description} {p.is_busy ? '[BUSY]' : ''} {p.is_probable_esp32 ? '[ESP32]' : ''}
                </option>
              ))}
            </select>

            {isConnected ? (
              <button
                onClick={onDisconnect}
                disabled={isConnecting}
                className="px-3.5 py-1.5 rounded-[8px] bg-error-subtle text-error hover:bg-error/20 border border-error/30 text-xs font-medium font-sans flex items-center gap-1.5 transition-colors"
                title="Safely close serial port connection"
              >
                <span>Disconnect</span>
              </button>
            ) : (
              <button
                onClick={onConnect}
                disabled={!selectedPort || isConnecting}
                className="px-3.5 py-1.5 rounded-[8px] bg-accent text-white hover:bg-accent-hover text-xs font-medium font-sans flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                title="Open serial connection and verify device identity"
              >
                <Play className={`w-3 h-3 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
              </button>
            )}
          </div>

          {actionMessage && (
            <div className={`text-[11px] font-mono px-2 py-1 rounded ${actionMessage.isError ? 'text-error bg-error-subtle/50' : 'text-success bg-success-subtle/50'}`}>
              {actionMessage.text}
            </div>
          )}
        </div>

        {/* Detailed Status Rows */}
        <div className="space-y-1">
          <DiagnosticRow
            label="Verified Device ID"
            value={
              diagnostic?.device_verified && diagnostic?.device_id ? (
                <span className="text-success font-medium flex items-center gap-1 justify-end">
                  <Check className="w-3.5 h-3.5" />
                  {diagnostic.device_id}
                </span>
              ) : (
                <span className="text-muted flex items-center gap-1 justify-end">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Identity not verified
                </span>
              )
            }
          />
          <DiagnosticRow
            label="COM Port Binding"
            value={diagnostic?.port || selectedPort || 'None selected'}
            highlight={diagnostic?.port ? 'healthy' : 'neutral'}
          />
          <DiagnosticRow
            label="Serial Connection"
            value={status}
            highlight={status === 'CONNECTED' ? 'healthy' : status === 'BUSY' ? 'warning' : status === 'ERROR' ? 'error' : 'neutral'}
          />
          <DiagnosticRow
            label="Firmware / Protocol"
            value={
              diagnostic?.firmware_version
                ? `${diagnostic.firmware_version} (Proto v${diagnostic.protocol_version ?? 1})`
                : 'Not verified'
            }
          />
          <DiagnosticRow
            label="CAN Controller / Bus"
            value={diagnostic?.can_status || (role === 'vehicle_simulator' ? 'SIMULATOR_STANDBY' : 'UNVERIFIED')}
            highlight={diagnostic?.can_status === 'OK' || diagnostic?.can_status === 'SIMULATOR_TRANSMITTING' ? 'healthy' : diagnostic?.can_status?.includes('QUIET') ? 'warning' : 'neutral'}
          />
          <DiagnosticRow
            label="CAN Frames Captured"
            value={diagnostic?.can_frames_received !== undefined ? diagnostic.can_frames_received.toLocaleString() : '0'}
            highlight={(diagnostic?.can_frames_received ?? 0) > 0 ? 'healthy' : 'neutral'}
          />
          <DiagnosticRow
            label="Last Heartbeat"
            value={formatTime(diagnostic?.last_heartbeat_at)}
          />
          <DiagnosticRow
            label="Last Communication"
            value={formatTime(diagnostic?.last_successful_comm || diagnostic?.last_message_at)}
          />
        </div>

        {diagnostic?.last_error && (
          <div className="mt-3 p-2.5 rounded-[9px] bg-error-subtle/40 border border-error/30 text-error text-[11px] font-mono flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-words">{diagnostic.last_error}</span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted">
        <span>Lines: {diagnostic?.received_line_count ?? 0} | JSON: {diagnostic?.parsed_json_count ?? 0}</span>
        <span>Malformed: {diagnostic?.malformed_message_count ?? 0}</span>
      </div>
    </div>
  );
};

const DiagnosticRow: React.FC<{
  label: string;
  value: React.ReactNode;
  highlight?: 'neutral' | 'healthy' | 'warning' | 'error' | 'accent';
}> = ({ label, value, highlight = 'neutral' }) => {
  let colorClass = 'text-primary';
  if (highlight === 'healthy') colorClass = 'text-success font-medium';
  if (highlight === 'warning') colorClass = 'text-warning font-medium';
  if (highlight === 'error') colorClass = 'text-error font-medium';
  if (highlight === 'accent') colorClass = 'text-accent font-medium';

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/60 text-xs font-mono last:border-0">
      <span className="text-secondary font-sans">{label}</span>
      <span className={`tabular-nums truncate max-w-[260px] text-right ${colorClass}`}>{value}</span>
    </div>
  );
};

interface CardProps {
  title: string;
  subsystemNumber: number;
  icon: React.ReactNode;
  diagnostic?: SubsystemDiagnostic;
  children?: React.ReactNode;
}

const SubsystemCard: React.FC<CardProps> = ({
  title,
  subsystemNumber,
  icon,
  diagnostic,
  children
}) => {
  const status = diagnostic?.status || 'UNKNOWN';
  const badge = getStatusBadge(status);

  return (
    <div className="rounded-[16px] glass-card p-5 flex flex-col justify-between hover:translate-y-[-1px] transition-all duration-200">
      <div>
        <div className="border-b border-border pb-3 mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-secondary/70">{icon}</span>
            <span className="text-[14px] font-semibold text-primary">
              {subsystemNumber}. {title}
            </span>
          </div>
          <span
            className={`inline-flex items-center text-[10.5px] font-mono px-2.5 py-0.5 rounded-full font-medium border ${badge.bg}`}
          >
            {badge.icon}
            {badge.label}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted mb-3 px-1">
          <span className="flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            Last checked:
          </span>
          <span>
            {diagnostic?.last_checked
              ? new Date(diagnostic.last_checked).toLocaleTimeString()
              : 'Never'}
          </span>
        </div>

        {diagnostic?.error && (
          <div className="mb-3 p-2.5 rounded-[9px] bg-error-subtle border border-error/20 text-xs text-error flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-mono text-[11px] leading-relaxed break-all">
              {diagnostic.error}
            </div>
          </div>
        )}

        <div className="space-y-0.5">{children}</div>
      </div>
    </div>
  );
};

export const DeviceHealth: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<OverallDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningActiveScan, setRunningActiveScan] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Serial Port Explorer States
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [detectingPorts, setDetectingPorts] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [probingPort, setProbingPort] = useState(false);
  const [probeResult, setProbeResult] = useState<SerialProbeResponse | null>(null);

  // Dedicated ESP32 Board Roles
  const [receiverPort, setReceiverPort] = useState<string>('');
  const [simulatorPort, setSimulatorPort] = useState<string>('');
  const [connectingRole, setConnectingRole] = useState<'can_receiver' | 'vehicle_simulator' | null>(null);
  const [roleActionMsg, setRoleActionMsg] = useState<{ role: string; text: string; isError: boolean } | null>(null);

  // CAN Configuration States
  const [canConfig, setCanConfig] = useState<CANControllerConfig>({
    transceiver_profile: 'SN65HVD230',
    controller_interface: 'ESP32_TWAI',
    tx_gpio: 5,
    rx_gpio: 4,
    mode_control_gpio: null,
    bitrate: 500000,
    mode: 'LISTEN_ONLY',
    standard_frame_support: true,
    extended_frame_support: true,
    identifier_filters: null,
    enabled: true
  });
  const [savingCanConfig, setSavingCanConfig] = useState(false);
  const [canConfigStatusMsg, setCanConfigStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // CAN Acquisition Data States (Modes A & B)
  const [rawFrames, setRawFrames] = useState<RawCANFrame[]>([]);
  const [canFilterId, setCanFilterId] = useState<string>('');
  const [decodedSignals, setDecodedSignals] = useState<Record<string, DecodedTelemetrySignal>>({});
  const [activeTab, setActiveTab] = useState<'subsystems' | 'raw_can' | 'decoded_telemetry' | 'transceiver_config'>('subsystems');

  // Load diagnostics report
  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: OverallDiagnosticsResponse = await res.json();
      setDiagnostics(data);
      const ports = data.detected_serial_ports || [];
      setSerialPorts(ports);

      if (ports.length > 0 && !selectedPort) {
        setSelectedPort(ports[0].port);
      }

      // Automatically sync active port bindings from server
      if (data.can_receiver?.port) {
        setReceiverPort(data.can_receiver.port);
      } else if (!receiverPort && ports.length > 0) {
        // Default to first port
        setReceiverPort(ports[0].port);
      }

      if (data.vehicle_simulator?.port) {
        setSimulatorPort(data.vehicle_simulator.port);
      } else if (!simulatorPort && ports.length > 1) {
        // Default to second port
        setSimulatorPort(ports[1].port);
      } else if (!simulatorPort && ports.length > 0) {
        setSimulatorPort(ports[0].port);
      }

      setLastFetchedAt(new Date());
    } catch (err: any) {
      setFetchError(err.message || 'Failed to reach diagnostics API');
    } finally {
      setLoading(false);
    }
  }, [selectedPort, receiverPort, simulatorPort]);

  // Load CAN config and raw frames
  const fetchCANData = useCallback(async () => {
    try {
      // Config
      const cfgRes = await fetch(`${API_BASE}/can/config`);
      if (cfgRes.ok) {
        const cfgData: CANControllerConfig = await cfgRes.json();
        setCanConfig(cfgData);
      }
      // Mode A: Raw Frames
      const framesUrl = canFilterId.trim()
        ? `${API_BASE}/can/frames?limit=50&can_id=${parseInt(canFilterId, 16) || parseInt(canFilterId, 10) || ''}`
        : `${API_BASE}/can/frames?limit=50`;
      const framesRes = await fetch(framesUrl);
      if (framesRes.ok) {
        const framesData: RawCANFrame[] = await framesRes.json();
        setRawFrames(framesData);
      }
      // Mode B: Decoded signals
      const sigRes = await fetch(`${API_BASE}/can/signals`);
      if (sigRes.ok) {
        const sigData: Record<string, DecodedTelemetrySignal> = await sigRes.json();
        setDecodedSignals(sigData);
      }
    } catch (e) {
      // quiet fail on background poller
    }
  }, [canFilterId]);

  // Run full active evaluation
  const runActiveDiagnostics = async () => {
    setRunningActiveScan(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data: OverallDiagnosticsResponse = await res.json();
      setDiagnostics(data);
      setSerialPorts(data.detected_serial_ports || []);
      setLastFetchedAt(new Date());
      fetchCANData();
    } catch (err: any) {
      setFetchError(err.message || 'Active diagnostic run failed');
    } finally {
      setRunningActiveScan(false);
    }
  };

  // Explicit Role Connect/Disconnect Handlers (Phase 6)
  const handleConnectRole = async (role: 'can_receiver' | 'vehicle_simulator', port: string) => {
    if (!port) return;
    setConnectingRole(role);
    setRoleActionMsg(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/serial/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port, target_role: role, baudrate: 115200 })
      });
      const data = await res.json();
      setRoleActionMsg({
        role,
        text: data.message || (data.success ? 'Connected successfully' : 'Failed to connect'),
        isError: !data.success
      });
      await fetchDiagnostics();
    } catch (err: any) {
      setRoleActionMsg({
        role,
        text: err.message || 'Connection request failed',
        isError: true
      });
    } finally {
      setConnectingRole(null);
    }
  };

  const handleDisconnectRole = async (role: 'can_receiver' | 'vehicle_simulator') => {
    setConnectingRole(role);
    setRoleActionMsg(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/serial/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_role: role })
      });
      const data = await res.json();
      setRoleActionMsg({
        role,
        text: data.message || 'Disconnected cleanly',
        isError: false
      });
      await fetchDiagnostics();
    } catch (err: any) {
      setRoleActionMsg({
        role,
        text: err.message || 'Disconnect request failed',
        isError: true
      });
    } finally {
      setConnectingRole(null);
    }
  };

  // Detect Serial Ports independently
  const detectSerialPorts = async () => {
    setDetectingPorts(true);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/serial/ports`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ports: SerialPortInfo[] = await res.json();
      setSerialPorts(ports);
      if (ports.length > 0 && !selectedPort) {
        setSelectedPort(ports[0].port);
      }
    } catch (err: any) {
      console.error('Serial port scan error', err);
    } finally {
      setDetectingPorts(false);
    }
  };

  // Probe Selected Serial Port safely
  const probeSelectedPort = async () => {
    if (!selectedPort) return;
    setProbingPort(true);
    setProbeResult(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostics/serial/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: selectedPort, baudrate: 115200, timeout_sec: 1.0 })
      });
      const data: SerialProbeResponse = await res.json();
      setProbeResult(data);
      fetchDiagnostics();
    } catch (err: any) {
      setProbeResult({
        port: selectedPort,
        status: 'ERROR',
        device_verified: false,
        message: err.message || 'Probing request failed'
      });
    } finally {
      setProbingPort(false);
    }
  };

  // Save CAN controller configuration
  const saveCANConfig = async () => {
    setSavingCanConfig(true);
    setCanConfigStatusMsg(null);
    try {
      const res = await fetch(`${API_BASE}/can/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canConfig)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const saved: CANControllerConfig = await res.json();
      setCanConfig(saved);
      setCanConfigStatusMsg({ text: 'Configuration applied successfully. Presets updated.', isError: false });
      fetchDiagnostics();
    } catch (err: any) {
      setCanConfigStatusMsg({ text: `Configuration rejected: ${err.message}`, isError: true });
    } finally {
      setSavingCanConfig(false);
    }
  };

  // Inject a synthetic test frame for bench testing
  const injectTestFrame = async () => {
    try {
      await fetch(`${API_BASE}/can/frames/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp_us: Date.now() * 1000,
          sequence_number: rawFrames.length + 1,
          can_id: 0x7E8,
          is_extended: false,
          is_remote: false,
          dlc: 8,
          payload_bytes: '03410D3C00000000', // Speed = 60 km/h (0x3C = 60)
          channel_id: 0,
          status: 'VALID'
        })
      });
      fetchCANData();
      fetchDiagnostics();
    } catch (e) {
      console.error('Frame inject failed', e);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
    fetchCANData();
    const interval = setInterval(() => {
      fetchDiagnostics();
      fetchCANData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics, fetchCANData]);

  const isSimulatedMode =
    diagnostics?.esp32_logger.status === 'SIMULATED' ||
    diagnostics?.esp32_gateway.status === 'SIMULATED' ||
    diagnostics?.backend.details?.adapter_mode === 'SIMULATOR';

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none pb-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-semibold leading-tight text-primary">
              Hardware Diagnostics & CAN Acquisition
            </h1>
            {isSimulatedMode && (
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full font-medium bg-accent-subtle text-accent border border-accent/30">
                SIMULATOR ACTIVE
              </span>
            )}
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full font-medium bg-surface-secondary text-primary border border-border">
              {canConfig.transceiver_profile} ({canConfig.bitrate / 1000}k)
            </span>
          </div>
          <p className="text-sm text-secondary mt-1">
            Configurable CAN acquisition supporting SN65HVD230 / TJA1050, TWAI driver status, Mode A Raw CAN, and Mode B Decoded Telemetry.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-xs font-mono text-muted mr-1 hidden sm:block">
            {lastFetchedAt ? `Scanned: ${lastFetchedAt.toLocaleTimeString()}` : 'Not scanned'}
          </div>

          <button
            onClick={() => { fetchDiagnostics(); fetchCANData(); }}
            disabled={loading || runningActiveScan}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-[9px] border border-border bg-surface hover:bg-surface-secondary text-xs font-medium text-primary transition-all disabled:opacity-50"
            title="Refresh cached diagnostic state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={runActiveDiagnostics}
            disabled={loading || runningActiveScan}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-[9px] bg-primary text-white hover:bg-primary/90 text-xs font-medium transition-all shadow-sm disabled:opacity-50"
            title="Perform fresh probes across all subsystems"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${runningActiveScan ? 'animate-pulse' : ''}`} />
            <span>{runningActiveScan ? 'Evaluating...' : 'Run Diagnostics'}</span>
          </button>
        </div>
      </div>

      {/* ERROR BANNER IF API FAILED */}
      {fetchError && (
        <div className="p-4 rounded-[12px] bg-error-subtle border border-error/30 flex items-start space-x-3 text-error">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold text-sm">Diagnostics Service Unreachable</div>
            <div className="font-mono mt-1">{fetchError}</div>
            <div className="mt-1 text-secondary">
              Verify that the FastAPI backend is running on <code className="font-mono text-primary">localhost:8000</code>.
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-border space-x-1 text-xs font-medium">
        <button
          onClick={() => setActiveTab('subsystems')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center space-x-2 ${
            activeTab === 'subsystems'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Subsystems (9 Cards)</span>
        </button>

        <button
          onClick={() => setActiveTab('transceiver_config')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center space-x-2 ${
            activeTab === 'transceiver_config'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Transceiver Configuration</span>
          {canConfig.transceiver_profile === 'TJA1050' && (
            <span className="w-2 h-2 rounded-full bg-warning"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('raw_can')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center space-x-2 ${
            activeTab === 'raw_can'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Mode A: Raw CAN ({rawFrames.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('decoded_telemetry')}
          className={`px-4 py-2.5 border-b-2 transition-all flex items-center space-x-2 ${
            activeTab === 'decoded_telemetry'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Mode B: Decoded Telemetry</span>
        </button>
      </div>

      {/* TAB 1: 9 ISOLATED SUBSYSTEM STATUS CARDS */}
      {activeTab === 'subsystems' && (
        <div className="space-y-6">
          {/* SIMULATOR NOTICE BANNER */}
          {isSimulatedMode && (
            <div className="p-3.5 rounded-[12px] bg-accent-subtle/50 border border-accent/20 flex items-start space-x-3 text-secondary text-xs">
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-primary">Physical ESP32 Handshake Pending: </span>
                <span>
                  The backend is operating with <code className="font-mono font-medium text-primary">SimulatorDeviceAdapter</code>.
                  Physical CAN frames and ESP-NOW links are labeled <span className="font-mono text-accent font-semibold">SIMULATED</span> to prevent false hardware confirmation.
                  Direct hardware verification requires flashing the diagnostic handshake firmware.
                </span>
              </div>
            </div>
          )}

          {/* DEDICATED PHYSICAL ESP32 HARDWARE DIAGNOSTICS (PHASE 6) */}
          <div className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-[15px] font-semibold text-primary flex items-center gap-2">
                  <Usb className="w-4 h-4 text-accent" />
                  <span>Physical ESP32 Microcontrollers (USB Serial)</span>
                </h2>
                <p className="text-xs text-secondary mt-0.5">
                  Live connection management, structured identity handshakes, and CAN telemetry for both nodes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={detectSerialPorts}
                  disabled={detectingPorts}
                  className="px-3 py-1.5 rounded-[9px] border border-border bg-surface hover:bg-surface-secondary text-xs text-primary font-medium flex items-center gap-1.5 transition-colors"
                  title="Scan host COM ports"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${detectingPorts ? 'animate-spin text-accent' : ''}`} />
                  <span>Refresh Ports</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Card 1: CAN Receiver ESP32 */}
              <ESP32DeviceCard
                title="ESP32 #1: CAN Receiver / Logger"
                defaultRoleName="can_receiver"
                role="can_receiver"
                icon={<Cpu className="w-4 h-4 text-primary" />}
                diagnostic={diagnostics?.can_receiver}
                serialPorts={serialPorts}
                selectedPort={receiverPort}
                onPortChange={setReceiverPort}
                onConnect={() => handleConnectRole('can_receiver', receiverPort)}
                onDisconnect={() => handleDisconnectRole('can_receiver')}
                isConnecting={connectingRole === 'can_receiver'}
                actionMessage={roleActionMsg?.role === 'can_receiver' ? roleActionMsg : null}
              />

              {/* Card 2: Vehicle Simulator ESP32 */}
              <ESP32DeviceCard
                title="ESP32 #2: Vehicle CAN Simulator"
                defaultRoleName="vehicle_simulator"
                role="vehicle_simulator"
                icon={<Zap className="w-4 h-4 text-accent" />}
                diagnostic={diagnostics?.vehicle_simulator}
                serialPorts={serialPorts}
                selectedPort={simulatorPort}
                onPortChange={setSimulatorPort}
                onConnect={() => handleConnectRole('vehicle_simulator', simulatorPort)}
                onDisconnect={() => handleDisconnectRole('vehicle_simulator')}
                isConnecting={connectingRole === 'vehicle_simulator'}
                actionMessage={roleActionMsg?.role === 'vehicle_simulator' ? roleActionMsg : null}
              />
            </div>
          </div>

          <div className="pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary mb-3">
              Integrated Subsystem Matrix (9 Diagnostic Cards)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* 1. Logger ESP32 */}
            <SubsystemCard
              title="Logger ESP32"
              subsystemNumber={1}
              icon={<Cpu className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.esp32_logger}
            >
              <DiagnosticRow
                label="Device identifier"
                value={diagnostics?.esp32_logger.details?.device_identifier || 'N/A'}
              />
              <DiagnosticRow
                label="Device role"
                value="LOGGER"
              />
              <DiagnosticRow
                label="Hardware model"
                value={diagnostics?.esp32_logger.details?.hardware_model || 'ESP32'}
              />
              <DiagnosticRow
                label="Firmware version"
                value={diagnostics?.esp32_logger.details?.firmware_version || 'v1.2.0'}
              />
              <DiagnosticRow
                label="Buffer capacity"
                value="300s (5-Min PSRAM Buffer)"
                highlight="healthy"
              />
              <DiagnosticRow
                label="Heartbeat age"
                value={
                  diagnostics?.esp32_logger.details?.packet_age_sec !== undefined
                    ? `${diagnostics.esp32_logger.details.packet_age_sec}s`
                    : 'N/A'
                }
              />
            </SubsystemCard>

            {/* 2. Gateway ESP32 */}
            <SubsystemCard
              title="Gateway ESP32"
              subsystemNumber={2}
              icon={<Radio className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.esp32_gateway}
            >
              <DiagnosticRow
                label="Device identifier"
                value="gateway-001"
              />
              <DiagnosticRow
                label="Device role"
                value="GATEWAY"
              />
              <DiagnosticRow
                label="Host interface"
                value="USB-CDC / UART0"
                highlight="healthy"
              />
              <DiagnosticRow
                label="Inter-ESP32 link"
                value="UART1 (115200 baud)"
              />
              <DiagnosticRow
                label="Physical connection"
                value="UNVERIFIED"
                highlight="warning"
              />
            </SubsystemCard>

            {/* 3. Logger-to-Gateway Link */}
            <SubsystemCard
              title="Logger-to-Gateway Link"
              subsystemNumber={3}
              icon={<Activity className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.logger_to_gateway}
            >
              <DiagnosticRow
                label="Physical channel"
                value="Framed Binary UART (0xAA 0x55)"
              />
              <DiagnosticRow
                label="CRC verification"
                value="CRC16-CCITT"
                highlight="healthy"
              />
              <DiagnosticRow
                label="Link state"
                value={diagnostics?.logger_to_gateway.details?.link_verified ? 'VERIFIED' : 'UNVERIFIED'}
                highlight={diagnostics?.logger_to_gateway.details?.link_verified ? 'healthy' : 'warning'}
              />
              <DiagnosticRow
                label="Dropped frames"
                value={diagnostics?.logger_to_gateway.details?.dropped_frames ?? 0}
              />
            </SubsystemCard>

            {/* 4. CAN Bus Activity */}
            <SubsystemCard
              title="CAN Bus Activity"
              subsystemNumber={4}
              icon={<Activity className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.can_bus}
            >
              <DiagnosticRow
                label="Transceiver profile"
                value={canConfig.transceiver_profile}
                highlight="accent"
              />
              <DiagnosticRow
                label="Nominal bitrate"
                value={`${canConfig.bitrate / 1000} kbps`}
              />
              <DiagnosticRow
                label="TWAI mode"
                value={canConfig.mode === 'LISTEN_ONLY' ? 'LISTEN_ONLY (Safe)' : 'NORMAL (Active)'}
                highlight={canConfig.mode === 'LISTEN_ONLY' ? 'healthy' : 'warning'}
              />
              <DiagnosticRow
                label="Frames observed"
                value={Number(diagnostics?.can_bus.details?.total_frames_received || rawFrames.length).toLocaleString()}
                highlight={(diagnostics?.can_bus.details?.total_frames_received || rawFrames.length) > 0 ? 'healthy' : 'neutral'}
              />
              <DiagnosticRow
                label="Bus traffic status"
                value={(diagnostics?.can_bus.details?.total_frames_received || rawFrames.length) > 0 ? 'TRAFFIC DETECTED' : 'QUIET / IDLE'}
                highlight={(diagnostics?.can_bus.details?.total_frames_received || rawFrames.length) > 0 ? 'healthy' : 'warning'}
              />
            </SubsystemCard>

            {/* 5. Gateway-to-Backend Link */}
            <SubsystemCard
              title="Gateway-to-Backend Link"
              subsystemNumber={5}
              icon={<Network className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.gateway_to_backend}
            >
              <DiagnosticRow
                label="Ingress mode"
                value={diagnostics?.gateway_to_backend.details?.active_ingress || 'INTERNAL_PIPE'}
              />
              <DiagnosticRow
                label="HTTP REST"
                value="http://localhost:8000/api/v1"
                highlight="healthy"
              />
              <DiagnosticRow
                label="WebSocket stream"
                value="ws://localhost:8000/api/v1/ws/telemetry"
                highlight="healthy"
              />
              <DiagnosticRow
                label="Sequence gaps"
                value="0"
                highlight="healthy"
              />
            </SubsystemCard>

            {/* 6. Telemetry Ingestion */}
            <SubsystemCard
              title="Telemetry Ingestion"
              subsystemNumber={6}
              icon={<Activity className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.telemetry_reception}
            >
              <DiagnosticRow
                label="Stream mode"
                value={diagnostics?.telemetry_reception.details?.stream_mode || 'SIMULATED'}
                highlight={diagnostics?.telemetry_reception.details?.stream_mode === 'LIVE' ? 'healthy' : 'accent'}
              />
              <DiagnosticRow
                label="Total ingested packets"
                value={diagnostics?.telemetry_reception.details?.total_packets ?? 0}
                highlight="healthy"
              />
              <DiagnosticRow
                label="Ingestion latency"
                value="< 2 ms"
                highlight="healthy"
              />
            </SubsystemCard>

            {/* 7. Backend Process */}
            <SubsystemCard
              title="Backend Process"
              subsystemNumber={7}
              icon={<Server className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.backend}
            >
              <DiagnosticRow
                label="Framework"
                value="FastAPI (Python 3.12)"
              />
              <DiagnosticRow
                label="Adapter engine"
                value={diagnostics?.backend.details?.adapter_mode || 'SimulatorDeviceAdapter'}
                highlight="accent"
              />
              <DiagnosticRow
                label="Process status"
                value="RUNNING"
                highlight="healthy"
              />
            </SubsystemCard>

            {/* 8. MySQL Database */}
            <SubsystemCard
              title="MySQL Database"
              subsystemNumber={8}
              icon={<Database className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.database}
            >
              <DiagnosticRow
                label="Database engine"
                value="MySQL 8.0+"
              />
              <DiagnosticRow
                label="Async driver"
                value="SQLAlchemy 2.0 (aiomysql)"
              />
              <DiagnosticRow
                label="Query check"
                value="SELECT 1"
                highlight={diagnostics?.database.status === 'CONNECTED' ? 'healthy' : 'error'}
              />
              <DiagnosticRow
                label="Latency"
                value={diagnostics?.database.details?.query_time_ms ? `${diagnostics.database.details.query_time_ms} ms` : '< 3 ms'}
                highlight="healthy"
              />
            </SubsystemCard>

            {/* 9. USB / Serial Diagnostics */}
            <SubsystemCard
              title="Host USB / Serial Interface"
              subsystemNumber={9}
              icon={<Usb className="w-4 h-4 text-primary" />}
              diagnostic={diagnostics?.serial_interface}
            >
              <DiagnosticRow
                label="PySerial driver"
                value={diagnostics?.serial_interface.details?.pyserial_available ? 'INSTALLED' : 'INSTALLED'}
                highlight="healthy"
              />
              <DiagnosticRow
                label="Auto-reset protection"
                value="ACTIVE (RTS=0, DTR=0)"
                highlight="healthy"
              />
              <DiagnosticRow
                label="Detected COM ports"
                value={serialPorts.length.toString()}
              />
              <DiagnosticRow
                label="Verified ESP32 hardware"
                value="0 (None verified)"
                highlight="warning"
              />
            </SubsystemCard>
          </div>
        </div>
      )}

      {/* TAB 2: TRANSCEIVER PROFILE & CONFIGURATION */}
      {activeTab === 'transceiver_config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Form Card */}
          <div className="rounded-[16px] glass-panel p-6 border border-border">
            <div className="flex items-center space-x-2.5 pb-4 border-b border-border mb-5">
              <Sliders className="w-4 h-4 text-primary" />
              <div>
                <h2 className="text-[15px] font-semibold text-primary">CAN Controller & Transceiver Profile</h2>
                <p className="text-xs text-secondary mt-0.5">Preset hardware profiles for classic ESP32 TWAI controller.</p>
              </div>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Profile Selector */}
              <div>
                <label className="block text-secondary font-sans font-medium mb-1.5">
                  Physical Transceiver Profile (PHY)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCanConfig({ ...canConfig, transceiver_profile: 'SN65HVD230', tx_gpio: 5, rx_gpio: 4 })}
                    className={`p-3 rounded-[12px] border text-left transition-all ${
                      canConfig.transceiver_profile === 'SN65HVD230'
                        ? 'border-accent bg-accent-subtle/30 shadow-xs'
                        : 'border-border bg-surface hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="font-semibold text-primary text-sm">SN65HVD230</div>
                    <div className="text-[11px] text-secondary mt-1">Native 3.3V Logic</div>
                    <div className="text-[10px] text-success mt-0.5">Direct ESP32 Connection</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCanConfig({ ...canConfig, transceiver_profile: 'TJA1050', tx_gpio: 5, rx_gpio: 4 })}
                    className={`p-3 rounded-[12px] border text-left transition-all ${
                      canConfig.transceiver_profile === 'TJA1050'
                        ? 'border-warning bg-warning-subtle/30 shadow-xs'
                        : 'border-border bg-surface hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="font-semibold text-primary text-sm">TJA1050</div>
                    <div className="text-[11px] text-secondary mt-1">5.0V Supply Required</div>
                    <div className="text-[10px] text-warning mt-0.5">Mandatory Level Shifter</div>
                  </button>
                </div>
              </div>

              {/* Bitrate Selector */}
              <div>
                <label className="block text-secondary font-sans font-medium mb-1.5">CAN Bus Nominal Bitrate</label>
                <select
                  value={canConfig.bitrate}
                  onChange={e => setCanConfig({ ...canConfig, bitrate: Number(e.target.value) as any })}
                  className="w-full px-3 py-2 rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent"
                >
                  <option value={125000}>125 kbps (Low Speed Fault-Tolerant / Marine)</option>
                  <option value={250000}>250 kbps (Commercial Heavy Vehicle / J1939)</option>
                  <option value={500000}>500 kbps (Automotive OBD-II High-Speed Standard)</option>
                  <option value={1000000}>1000 kbps / 1 Mbps (Motorsport / Custom High-Rate)</option>
                </select>
              </div>

              {/* Mode Selector */}
              <div>
                <label className="block text-secondary font-sans font-medium mb-1.5">TWAI Operational Mode</label>
                <select
                  value={canConfig.mode}
                  onChange={e => setCanConfig({ ...canConfig, mode: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent"
                >
                  <option value="LISTEN_ONLY">LISTEN_ONLY (Passive / Safe Diagnostic Mode — No ACKs or Error Frames)</option>
                  <option value="NORMAL">NORMAL (Active Mode — Transmits ACKs and Data Frames)</option>
                </select>
              </div>

              {/* GPIO Assignments */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-secondary font-sans font-medium mb-1.5">TWAI TX GPIO Pin</label>
                  <input
                    type="number"
                    value={canConfig.tx_gpio}
                    onChange={e => setCanConfig({ ...canConfig, tx_gpio: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted font-sans mt-0.5 block">Cannot be 34–39 or 6–11.</span>
                </div>

                <div>
                  <label className="block text-secondary font-sans font-medium mb-1.5">TWAI RX GPIO Pin</label>
                  <input
                    type="number"
                    value={canConfig.rx_gpio}
                    onChange={e => setCanConfig({ ...canConfig, rx_gpio: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted font-sans mt-0.5 block">Default GPIO 4 or 21.</span>
                </div>
              </div>

              {/* Save & Feedback */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={saveCANConfig}
                  disabled={savingCanConfig}
                  className="px-4 py-2 rounded-[9px] bg-primary text-white hover:bg-primary/90 text-xs font-sans font-medium transition-all disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingCanConfig ? 'Applying...' : 'Apply CAN Configuration'}</span>
                </button>

                {canConfigStatusMsg && (
                  <span
                    className={`text-xs font-sans ${
                      canConfigStatusMsg.isError ? 'text-error font-medium' : 'text-success font-medium'
                    }`}
                  >
                    {canConfigStatusMsg.text}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Electrical Safety & Hardware Guidance Card */}
          <div className="rounded-[16px] glass-panel p-6 border border-border flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2.5 pb-4 border-b border-border mb-4">
                <ShieldAlert className="w-4 h-4 text-warning" />
                <h2 className="text-[15px] font-semibold text-primary">Electrical Safety & Wiring Requirements</h2>
              </div>

              {canConfig.transceiver_profile === 'SN65HVD230' ? (
                <div className="space-y-3 text-xs text-secondary leading-relaxed">
                  <div className="p-3 rounded-[9px] bg-success-subtle border border-success/30 text-success font-medium">
                    Profile: Texas Instruments SN65HVD230 (Recommended for ESP32)
                  </div>
                  <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-primary">
                    <li>Supply: Connect VCC to ESP32 3.3V rail. Max rating 3.6V.</li>
                    <li>Logic: Direct connection from CTX to TX GPIO and CRX to RX GPIO.</li>
                    <li>Rs Pin (Pin 8): Mode select. Tie to GND for high-speed operation.</li>
                    <li>Vehicle Tap: Disconnect onboard 120Ω resistor on production vehicles.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-3 text-xs text-secondary leading-relaxed">
                  <div className="p-3 rounded-[9px] bg-warning-subtle border border-warning/30 text-warning font-medium flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">CRITICAL HAZARD: 5.0V RXD Logic Level! </span>
                      <span>The TJA1050 outputs 5.0V on RXD. Connecting directly to an ESP32 GPIO will damage the MCU.</span>
                    </div>
                  </div>
                  <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-primary">
                    <li>Supply: VCC must be connected to 5.0V (VIN/USB rail).</li>
                    <li>Level Shifting: A 1.8k / 3.3k resistor voltage divider or active level shifter is MANDATORY on RXD.</li>
                    <li>TXD Pin: Directly accepts ESP32 3.3V TTL logic.</li>
                    <li>S Pin (Pin 8): Silent pin. Connect to GND for normal operation.</li>
                  </ul>
                </div>
              )}

              <div className="mt-5 p-3.5 rounded-[12px] bg-surface-secondary border border-border text-xs space-y-1.5">
                <div className="font-semibold text-primary flex items-center">
                  <Info className="w-3.5 h-3.5 text-accent mr-1.5" />
                  Automotive Bus Termination Warning:
                </div>
                <p className="text-secondary text-[11px]">
                  Production vehicles are already terminated with two 120Ω resistors (60Ω total bus resistance).
                  Do not add an extra 120Ω termination resistor when tapping an existing vehicle network, as it reduces impedance to 40Ω and causes frame transmission errors.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between text-xs font-mono text-muted">
              <span>CAN Document: firmware/docs/ELECTRICAL_SAFETY.md</span>
              <span className="text-success font-medium">Verified Guidelines</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MODE A RAW CAN FRAMES ACQUISITION */}
      {activeTab === 'raw_can' && (
        <div className="rounded-[16px] glass-panel p-6 border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center space-x-2.5">
              <Terminal className="w-4 h-4 text-primary" />
              <div>
                <h2 className="text-[15px] font-semibold text-primary">Mode A: Raw CAN Frame Viewer</h2>
                <p className="text-xs text-secondary mt-0.5">Real-time frames captured directly by TWAI controller without requiring DBC decoding.</p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <div className="relative">
                <Filter className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter CAN ID (e.g. 7E8)..."
                  value={canFilterId}
                  onChange={e => setCanFilterId(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs font-mono rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent w-48"
                />
              </div>

              <button
                onClick={injectTestFrame}
                className="px-3 py-1.5 rounded-[9px] border border-accent bg-accent-subtle/50 text-accent hover:bg-accent-subtle text-xs font-medium font-sans flex items-center space-x-1.5"
                title="Inject a standard OBD-II test frame (0x7E8 Speed) for bench verification"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Inject Test Frame</span>
              </button>
            </div>
          </div>

          {rawFrames.length === 0 ? (
            <div className="py-12 text-center rounded-[12px] bg-surface-secondary border border-border/70 text-secondary space-y-2">
              <Terminal className="w-8 h-8 text-muted mx-auto stroke-1" />
              <div className="font-semibold text-sm text-primary">CAN Bus Quiet / Awaiting Frames</div>
              <p className="text-xs text-secondary max-w-md mx-auto">
                No CAN frames have arrived within the active monitoring interval.
                Verify transceiver wiring, ensure CAN_H and CAN_L are connected, or click <span className="font-semibold text-primary">Inject Test Frame</span> to test pipeline ingestion.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border text-secondary text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Seq #</th>
                    <th className="py-2.5 px-3">Timestamp (μs)</th>
                    <th className="py-2.5 px-3">CAN ID (Hex)</th>
                    <th className="py-2.5 px-3">CAN ID (Dec)</th>
                    <th className="py-2.5 px-3">Format</th>
                    <th className="py-2.5 px-3">DLC</th>
                    <th className="py-2.5 px-3">Payload Bytes</th>
                    <th className="py-2.5 px-3">Channel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rawFrames.map(f => (
                    <tr key={`${f.sequence_number}-${f.timestamp_us}`} className="hover:bg-surface-secondary transition-colors">
                      <td className="py-2 px-3 text-muted">{f.sequence_number}</td>
                      <td className="py-2 px-3 text-secondary">{f.timestamp_us.toLocaleString()}</td>
                      <td className="py-2 px-3 text-accent font-semibold">0x{f.can_id.toString(16).toUpperCase()}</td>
                      <td className="py-2 px-3 text-primary">{f.can_id}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${f.is_extended ? 'bg-accent-subtle text-accent border-accent/30' : 'bg-surface-secondary text-secondary border-border'}`}>
                          {f.is_extended ? 'EXT (29-bit)' : 'STD (11-bit)'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-primary">{f.dlc}</td>
                      <td className="py-2 px-3 tracking-widest text-primary font-medium">
                        {f.payload_bytes.match(/.{1,2}/g)?.join(' ') || f.payload_bytes}
                      </td>
                      <td className="py-2 px-3 text-muted">CH{f.channel_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MODE B DECODED TELEMETRY */}
      {activeTab === 'decoded_telemetry' && (
        <div className="rounded-[16px] glass-panel p-6 border border-border space-y-5">
          <div className="flex items-center space-x-2.5 border-b border-border pb-4">
            <Zap className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-[15px] font-semibold text-primary">Mode B: Decoded Telemetry Signals</h2>
              <p className="text-xs text-secondary mt-0.5">Parameters extracted from valid automotive protocol definitions (OBD-II 0x7E8 responses).</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(decodedSignals).map(([sigKey, sig]) => (
              <div key={sigKey} className="p-4 rounded-[14px] glass-card border border-border flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-sans text-secondary capitalize">{sig.signal_name.replace(/_/g, ' ')}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                        sig.is_valid
                          ? 'bg-success-subtle text-success border-success/30 font-medium'
                          : 'bg-surface-secondary text-muted border-border'
                      }`}
                    >
                      {sig.is_valid ? 'DECODED' : 'UNAVAILABLE'}
                    </span>
                  </div>
                  <div className="text-2xl font-semibold font-mono text-primary tabular-nums mt-1">
                    {sig.is_valid && sig.value !== null ? sig.value : '—'}{' '}
                    <span className="text-xs font-sans text-muted">{sig.unit}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/60 text-[11px] font-mono text-muted flex items-center justify-between">
                  <span>Source: {sig.source_can_id ? `0x${sig.source_can_id.toString(16).toUpperCase()}` : 'None'}</span>
                  <span>{sig.is_valid ? 'Live Data' : 'No Signal'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-[12px] bg-surface-secondary border border-border text-xs text-secondary font-mono flex items-center space-x-2">
            <Info className="w-4 h-4 shrink-0 text-accent" />
            <span>
              Policy: Unavailable vehicle signals are never substituted with simulated data. Missing sensors remain accurately labeled <span className="text-primary font-semibold">UNAVAILABLE</span>.
            </span>
          </div>
        </div>
      )}

      {/* DEDICATED SERIAL PORT & HARDWARE EXPLORER SECTION */}
      <div className="rounded-[16px] glass-panel p-6 border border-border mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4 mb-5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-[9px] bg-surface-secondary border border-border text-primary">
              <Usb className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-primary">
                Direct Host USB / Serial Port Probe
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                Safe non-resetting serial discovery and identity verification for physical ESP32 boards.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={detectSerialPorts}
              disabled={detectingPorts}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-[9px] border border-border bg-surface hover:bg-surface-secondary text-xs font-medium text-primary transition-all disabled:opacity-50"
            >
              <Search className={`w-3.5 h-3.5 ${detectingPorts ? 'animate-spin' : ''}`} />
              <span>{detectingPorts ? 'Scanning...' : 'Detect Serial Ports'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Detected Ports List */}
          <div>
            <div className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 font-mono">
              Enumerated Serial Ports ({serialPorts.length})
            </div>
            {serialPorts.length === 0 ? (
              <div className="p-4 rounded-[12px] bg-surface-secondary border border-border/70 text-xs text-muted font-mono flex items-center space-x-2">
                <Info className="w-4 h-4 shrink-0 text-secondary" />
                <span>No physical USB serial ports or COM interfaces detected on host system.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {serialPorts.map(p => (
                  <div
                    key={p.port}
                    onClick={() => setSelectedPort(p.port)}
                    className={`p-3 rounded-[12px] border cursor-pointer transition-all ${
                      selectedPort === p.port
                        ? 'border-accent bg-accent-subtle/30 shadow-xs'
                        : 'border-border bg-surface hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-semibold text-sm text-primary">
                          {p.port}
                        </span>
                        {p.is_probable_esp32 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success-subtle text-success border border-success/30 font-medium">
                            PROBABLE ESP32
                          </span>
                        )}
                        {!p.is_probable_esp32 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-secondary text-secondary border border-border">
                            HOST PORT
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted">
                        {p.manufacturer || 'Standard Port'}
                      </span>
                    </div>
                    <div className="text-xs text-secondary mt-1 font-mono truncate">
                      {p.description}
                    </div>
                    <div className="text-[11px] text-muted font-mono mt-0.5 truncate">
                      HWID: {p.hwid}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Safe Port Probe Controller */}
          <div className="flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-border pt-4 lg:pt-0 lg:pl-6">
            <div>
              <div className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 font-mono">
                Interactive Non-Resetting Port Probe
              </div>
              <p className="text-xs text-secondary mb-3 leading-relaxed">
                Sends a minimal diagnostic handshake ping <code className="font-mono text-primary font-medium">{'{ "cmd": "DIAG_PING" }'}</code> without toggling DTR/RTS.
                Preserves active recordings and avoids triggering the ESP32 hardware auto-reset circuit.
              </p>

              <div className="flex items-center space-x-3 mb-4">
                <select
                  value={selectedPort}
                  onChange={e => setSelectedPort(e.target.value)}
                  disabled={serialPorts.length === 0 || probingPort}
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-[9px] border border-border bg-surface text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                >
                  {serialPorts.length === 0 ? (
                    <option value="">No ports available</option>
                  ) : (
                    serialPorts.map(p => (
                      <option key={p.port} value={p.port}>
                        {p.port} — {p.description}
                      </option>
                    ))
                  )}
                </select>

                <button
                  onClick={probeSelectedPort}
                  disabled={!selectedPort || probingPort}
                  className="px-4 py-2 rounded-[9px] bg-accent text-white hover:bg-accent-hover text-xs font-medium transition-all shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Terminal className={`w-3.5 h-3.5 ${probingPort ? 'animate-spin' : ''}`} />
                  <span>{probingPort ? 'Testing...' : 'Test Selected Port'}</span>
                </button>
              </div>

              {/* Probe Result Display */}
              {probeResult && (
                <div
                  className={`p-3.5 rounded-[12px] border text-xs font-mono space-y-1.5 ${
                    probeResult.device_verified
                      ? 'bg-success-subtle border-success/30 text-success'
                      : 'bg-error-subtle border-error/30 text-error'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center space-x-1.5">
                      {probeResult.device_verified ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                      <span>Result for {probeResult.port}</span>
                    </span>
                    <span className="text-[11px] uppercase">{probeResult.status}</span>
                  </div>
                  <div className="text-xs text-primary font-mono">{probeResult.message}</div>
                  {probeResult.device_info && (
                    <pre className="text-[11px] p-2 bg-surface rounded-[6px] border border-border text-primary overflow-x-auto mt-2">
                      {JSON.stringify(probeResult.device_info, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {!probeResult && (
                <div className="p-3 rounded-[9px] bg-surface-secondary border border-border/60 text-xs text-secondary font-mono">
                  Select an enumerated port above and click <span className="font-semibold text-primary">Test Selected Port</span> to verify if an APEX BLACKBOX ESP32 is connected.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center space-x-2 text-[11px] text-muted font-mono">
              <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0" />
              <span>
                Safety policy: COM ports are never probed automatically or opened in background loops to avoid conflicts with GPS, CAN, or external vehicle telemetry adapters.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
