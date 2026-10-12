import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { TelemetryData, DeviceInfo } from '../types';
import { API_V1_URL, getWsUrl } from '../config/api';

interface RecordingStatus {
  recording_id: string;
  status: string;
  progress: number;
}

interface TelemetryContextType {
  history: TelemetryData[];
  status: 'LIVE' | 'SIMULATION' | 'REPLAY' | 'DISCONNECTED';
  backendConnected: boolean;
  lastUpdate: string | null;
  rate: number;
  recordingStatus: RecordingStatus | null;
  devices: DeviceInfo[];
  loggerDevice: DeviceInfo | null;
  gatewayDevice: DeviceInfo | null;
  isStale: boolean;
}

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [history, setHistory] = useState<TelemetryData[]>([]);
  const [status, setStatus] = useState<'LIVE' | 'SIMULATION' | 'REPLAY' | 'DISCONNECTED'>('DISCONNECTED');
  const [backendConnected, setBackendConnected] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [rate, setRate] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [isStale, setIsStale] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>(1000);
  const messageCountRef = useRef<number>(0);
  const isComponentMounted = useRef(true);
  const lastPacketTimeRef = useRef<number>(0);
  const connectRef = useRef<() => void>(() => {});

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_V1_URL}/devices`);
      if (res.ok) {
        const data: DeviceInfo[] = await res.json();
        if (isComponentMounted.current) {
          setDevices(data);
        }
      }
    } catch {
      // API may be temporarily unreachable
    }
  }, []);

  const connect = useCallback(() => {
    if (!isComponentMounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl('/api/v1/ws/telemetry');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reconnectTimeoutRef.current = 1000;
      if (isComponentMounted.current) {
        setBackendConnected(true);
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'telemetry.update') {
          const mode = payload.source_mode === 'SIMULATION' ? 'SIMULATION' : 'LIVE';
          const nowIso = new Date().toISOString();
          lastPacketTimeRef.current = Date.now();

          if (isComponentMounted.current) {
            setStatus(mode);
            setBackendConnected(true);
            setLastUpdate(nowIso);
            setIsStale(false);
          }
          messageCountRef.current += 1;

          setHistory(prev => {
            const data = payload.data || {};
            const newData: TelemetryData = {
              timestamp: data.device_timestamp_ms ? new Date(data.device_timestamp_ms).toISOString() : nowIso,
              speed: typeof data.vehicle_speed_kmh === 'number' ? data.vehicle_speed_kmh : null,
              rpm: typeof data.engine_rpm === 'number' ? data.engine_rpm : null,
              throttle: typeof data.throttle_percent === 'number' ? data.throttle_percent : null,
              deceleration: typeof data.deceleration_mps2 === 'number' ? data.deceleration_mps2 : null,
              canFrameCount: typeof data.can_frame_count === 'number' ? data.can_frame_count : null,
              droppedFrameCount: typeof data.dropped_frame_count === 'number' ? data.dropped_frame_count : null,
              sequenceNumber: payload.sequence_number,
              simulated: payload.source_mode === 'SIMULATION'
            };
            const newHistory = [...prev, newData];
            if (newHistory.length > 300) newHistory.shift();
            return newHistory;
          });
        } else if (payload.type === 'recording.status') {
          if (isComponentMounted.current) {
            setRecordingStatus(payload.data);
          }
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    ws.onclose = () => {
      if (isComponentMounted.current) {
        setStatus('DISCONNECTED');
        setBackendConnected(false);
        wsRef.current = null;
        
        const timeout = Math.min(reconnectTimeoutRef.current * 1.5, 10000);
        reconnectTimeoutRef.current = timeout;
        setTimeout(() => connectRef.current(), timeout);
      }
    };

    ws.onerror = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };

    wsRef.current = ws;
  }, []);

  connectRef.current = connect;

  useEffect(() => {
    isComponentMounted.current = true;
    connect();
    fetchDevices();

    const deviceInterval = setInterval(fetchDevices, 10000);

    const rateInterval = setInterval(() => {
      setRate(messageCountRef.current);
      messageCountRef.current = 0;

      if (lastPacketTimeRef.current > 0 && Date.now() - lastPacketTimeRef.current > 3000) {
        setIsStale(true);
      }
    }, 1000);

    return () => {
      isComponentMounted.current = false;
      clearInterval(deviceInterval);
      clearInterval(rateInterval);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, fetchDevices]);

  const loggerDevice = devices.find(d => d.device_role === 'LOGGER') || devices[0] || null;
  const gatewayDevice = devices.find(d => d.device_role === 'GATEWAY') || null;

  return (
    <TelemetryContext.Provider value={{
      history,
      status,
      backendConnected,
      lastUpdate,
      rate,
      recordingStatus,
      devices,
      loggerDevice,
      gatewayDevice,
      isStale
    }}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (context === undefined) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
};
