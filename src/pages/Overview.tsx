import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTelemetry } from '../providers/TelemetryProvider';
import type { EventRecord } from '../types';
import { IncidentReplay } from '../components/IncidentReplay';

type TimeWindow = '10s' | '30s' | '1m' | '5m';

export const Overview: React.FC = () => {
  const {
    history,
    status,
    backendConnected,
    lastUpdate,
    loggerDevice,
    gatewayDevice,
    isStale
  } = useTelemetry();

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30s');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchRecentEvents = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/events');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEvents(data.slice(0, 5));
            setEventsLoading(false);
          }
        }
      } catch {
        if (isMounted) setEventsLoading(false);
      }
    };

    fetchRecentEvents();
    const interval = setInterval(fetchRecentEvents, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const currentTelemetry = history.length > 0 ? history[history.length - 1] : null;

  const filteredHistory = useMemo(() => {
    if (history.length === 0) return [];
    const windowSecondsMap: Record<TimeWindow, number> = {
      '10s': 10,
      '30s': 30,
      '1m': 60,
      '5m': 300
    };
    const maxSeconds = windowSecondsMap[timeWindow];
    const sampleLimit = maxSeconds * 10;
    return history.slice(-sampleLimit);
  }, [history, timeWindow]);

  const getBaseChartConfig = () => ({
    backgroundColor: '#FFFFFF',
    animation: false,
    grid: { top: 28, right: 16, bottom: 26, left: 45 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: '#E3E8EF',
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: '#17212F', fontFamily: '"IBM Plex Mono", monospace', fontSize: 11 },
      axisPointer: { type: 'line', lineStyle: { color: '#8590A0', width: 1, type: 'dashed' } },
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-radius: 8px;'
    },
    xAxis: {
      type: 'category',
      data: filteredHistory.map(h =>
        new Date(h.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          minute: '2-digit',
          second: '2-digit'
        })
      ),
      axisLine: { lineStyle: { color: '#E3E8EF' } },
      axisTick: { lineStyle: { color: '#E3E8EF' } },
      axisLabel: { color: '#8590A0', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 },
      splitLine: { show: false }
    }
  });

  const speedChartOptions = {
    ...getBaseChartConfig(),
    yAxis: {
      type: 'value',
      min: 0,
      max: 200,
      splitLine: { lineStyle: { color: '#F1F5F9', type: 'solid' } },
      axisLine: { show: true, lineStyle: { color: '#E3E8EF' } },
      axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
    },
    series: [
      {
        name: 'Speed',
        data: filteredHistory.map(h => h.speed),
        type: 'line',
        smooth: false,
        showSymbol: false,
        lineStyle: { color: '#087F9C', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(8, 127, 156, 0.08)' },
              { offset: 1, color: 'rgba(8, 127, 156, 0.0)' }
            ]
          }
        }
      }
    ]
  };

  const rpmChartOptions = {
    ...getBaseChartConfig(),
    yAxis: {
      type: 'value',
      min: 0,
      max: 8000,
      splitLine: { lineStyle: { color: '#F1F5F9', type: 'solid' } },
      axisLine: { show: true, lineStyle: { color: '#E3E8EF' } },
      axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
    },
    series: [
      {
        name: 'Engine RPM',
        data: filteredHistory.map(h => h.rpm),
        type: 'line',
        smooth: false,
        showSymbol: false,
        lineStyle: { color: '#946200', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(148, 98, 0, 0.08)' },
              { offset: 1, color: 'rgba(148, 98, 0, 0.0)' }
            ]
          }
        }
      }
    ]
  };

  const loggerStatus = loggerDevice ? loggerDevice.status : (backendConnected && status !== 'DISCONNECTED' ? 'ONLINE' : 'OFFLINE');
  const gatewayStatus = gatewayDevice ? gatewayDevice.status : (backendConnected && status !== 'DISCONNECTED' ? 'ONLINE' : 'OFFLINE');

  return (
    <div className="space-y-5 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border/80 pb-4">
        <div>
          <h1 className="text-[25px] font-[600] tracking-[-0.4px] text-primary leading-tight">Vehicle overview</h1>
          <p className="text-[14px] text-secondary mt-0.5 font-normal">Live telemetry and recording status.</p>
        </div>

        <div className="flex items-center gap-3.5 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted font-sans text-xs">Operating Mode:</span>
            {status === 'SIMULATION' ? (
              <span className="text-warning font-medium bg-warning-subtle px-2.5 py-0.5 rounded-[999px] border border-warning/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                Simulation
              </span>
            ) : status === 'LIVE' ? (
              <span className="text-success font-medium bg-success-subtle px-2.5 py-0.5 rounded-[999px] border border-success/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Live Mode
              </span>
            ) : status === 'REPLAY' ? (
              <span className="text-accent font-medium bg-accent-subtle px-2.5 py-0.5 rounded-[999px] border border-accent/30">
                Replay Mode
              </span>
            ) : (
              <span className="text-muted bg-surface-secondary px-2.5 py-0.5 rounded-[999px] border border-border">
                Offline
              </span>
            )}
          </div>
          <div className="w-px h-3.5 bg-border/80" />
          <div className="flex items-center gap-1.5 text-secondary">
            <span className="text-muted font-sans text-xs">Timestamp:</span>
            <span className="text-primary tabular-nums">
              {lastUpdate
                ? new Date(lastUpdate).toISOString().replace('T', ' ').slice(0, 19)
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* FLOATING VEHICLE STATUS STRIP */}
      <div className="glass-panel rounded-[18px] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-secondary font-medium">Logger:</span>
            <span className={`w-2 h-2 rounded-full ${loggerStatus === 'ONLINE' ? 'bg-success' : 'bg-error'}`} />
            <span className={`font-mono text-[11px] font-medium ${loggerStatus === 'ONLINE' ? 'text-primary' : 'text-error'}`}>
              {loggerStatus}
            </span>
          </div>

          <div className="w-px h-3.5 bg-border/80 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-secondary font-medium">Gateway:</span>
            <span className={`w-2 h-2 rounded-full ${gatewayStatus === 'ONLINE' ? 'bg-success' : 'bg-error'}`} />
            <span className={`font-mono text-[11px] font-medium ${gatewayStatus === 'ONLINE' ? 'text-primary' : 'text-error'}`}>
              {gatewayStatus}
            </span>
          </div>

          <div className="w-px h-3.5 bg-border/80 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-secondary font-medium">Database:</span>
            <span className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-success' : 'bg-error'}`} />
            <span className={`font-mono text-[11px] font-medium ${backendConnected ? 'text-primary' : 'text-error'}`}>
              {backendConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-secondary font-sans text-xs font-medium">Recorder:</span>
          <span className="inline-flex items-center gap-1.5 text-success font-medium bg-success-subtle px-2.5 py-0.5 rounded-[999px] border border-success/25">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            5-min Ring Buffer (PSRAM)
          </span>
        </div>
      </div>

      {/* REFINED MEASUREMENT SECTION - BALANCED HIERARCHY WITH HOVER ELEVATION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Speed: Strongest typographic emphasis (38-44px) */}
        <div className="glass-card glass-card-interactive rounded-[16px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-secondary tracking-wide">Vehicle speed</span>
            <span className="text-[11px] font-mono text-accent font-medium px-2 py-0.5 rounded-[999px] bg-accent-subtle">
              PRIMARY
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-3">
            <span className="text-[40px] font-medium font-mono tabular-nums text-primary tracking-tight leading-none">
              {currentTelemetry?.speed !== null && currentTelemetry?.speed !== undefined
                ? currentTelemetry.speed.toFixed(1)
                : 'N/A'}
            </span>
            <span className="text-[13px] font-mono font-medium text-accent">km/h</span>
          </div>
          <div className="text-[12px] text-muted font-normal">Ground velocity from CAN bus</div>
        </div>

        {/* Engine Speed: Second strongest emphasis (30-36px) */}
        <div className="glass-card glass-card-interactive rounded-[16px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-secondary tracking-wide">Engine speed</span>
            <span className="text-[11px] font-mono text-warning font-medium px-2 py-0.5 rounded-[999px] bg-warning-subtle">
              DRIVETRAIN
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-3">
            <span className="text-[32px] font-medium font-mono tabular-nums text-primary tracking-tight leading-none">
              {currentTelemetry?.rpm !== null && currentTelemetry?.rpm !== undefined
                ? currentTelemetry.rpm.toLocaleString()
                : 'N/A'}
            </span>
            <span className="text-[13px] font-mono font-medium text-warning">rpm</span>
          </div>
          <div className="text-[12px] text-muted font-normal">Crankshaft rotational speed</div>
        </div>

        {/* Throttle: Compact secondary measurement (24-29px) */}
        <div className="glass-card glass-card-interactive rounded-[16px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-secondary tracking-wide">Throttle</span>
            <span className="text-[11px] font-mono text-secondary font-medium px-2 py-0.5 rounded-[999px] bg-surface-secondary">
              PEDAL
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 my-3">
            <span className="text-[28px] font-medium font-mono tabular-nums text-primary leading-none">
              {currentTelemetry?.throttle !== null && currentTelemetry?.throttle !== undefined
                ? currentTelemetry.throttle.toFixed(1)
                : 'N/A'}
            </span>
            <span className="text-[13px] font-mono text-secondary">%</span>
          </div>
          <div className="text-[12px] text-muted font-normal">Accelerator pedal position</div>
        </div>

        {/* Deceleration: Compact secondary measurement (24-29px) */}
        <div className="glass-card glass-card-interactive rounded-[16px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-secondary tracking-wide">Deceleration</span>
            <span className="text-[11px] font-mono text-error font-medium px-2 py-0.5 rounded-[999px] bg-error-subtle">
              BRAKING
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 my-3">
            <span
              className={`text-[28px] font-medium font-mono tabular-nums leading-none ${
                currentTelemetry?.deceleration && currentTelemetry.deceleration < -5.0
                  ? 'text-error'
                  : 'text-primary'
              }`}
            >
              {currentTelemetry?.deceleration !== null && currentTelemetry?.deceleration !== undefined
                ? currentTelemetry.deceleration.toFixed(2)
                : 'N/A'}
            </span>
            <span className="text-[13px] font-mono text-secondary">m/s²</span>
          </div>
          <div className="text-[12px] text-muted font-normal">Longitudinal acceleration</div>
        </div>
      </div>

      {/* TELEMETRY CHARTS - BALANCED TWO-COLUMN LAYOUT WITH 16px RADIUS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Speed Chart */}
        <div className="glass-card rounded-[16px] flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-[600] text-primary">Vehicle speed</span>
              <span className="text-xs font-mono text-muted">(km/h)</span>
              {currentTelemetry?.speed !== null && currentTelemetry?.speed !== undefined && (
                <span className="text-xs font-mono font-medium text-accent tabular-nums bg-accent-subtle/80 px-2 py-0.5 rounded-[6px]">
                  {currentTelemetry.speed.toFixed(1)} km/h
                </span>
              )}
              {isStale && (
                <span className="text-[10px] font-mono text-warning bg-warning-subtle px-1.5 py-0.5 rounded-[6px] border border-warning/30">
                  Stale data
                </span>
              )}
            </div>

            {/* Time Selector */}
            <div className="flex items-center bg-surface-secondary border border-border rounded-[9px] p-0.5 text-xs font-mono">
              {(['10s', '30s', '1m', '5m'] as TimeWindow[]).map(window => (
                <button
                  key={window}
                  onClick={() => setTimeWindow(window)}
                  className={`px-2.5 py-0.5 rounded-[7px] transition-colors ${
                    timeWindow === window
                      ? 'bg-surface text-accent font-semibold shadow-xs'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[240px] p-2">
            {filteredHistory.length > 0 ? (
              <ReactECharts
                option={speedChartOptions}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
                lazyUpdate={true}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                <span className="text-sm font-medium text-secondary">No telemetry data available</span>
                <span className="text-xs text-muted mt-1">Waiting for incoming data.</span>
              </div>
            )}
          </div>
        </div>

        {/* RPM Chart */}
        <div className="glass-card rounded-[16px] flex flex-col overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[15px] font-[600] text-primary">Engine speed</span>
              <span className="text-xs font-mono text-muted">(rpm)</span>
              {currentTelemetry?.rpm !== null && currentTelemetry?.rpm !== undefined && (
                <span className="text-xs font-mono font-medium text-warning tabular-nums bg-warning-subtle/80 px-2 py-0.5 rounded-[6px]">
                  {currentTelemetry.rpm.toLocaleString()} rpm
                </span>
              )}
              {isStale && (
                <span className="text-[10px] font-mono text-warning bg-warning-subtle px-1.5 py-0.5 rounded-[6px] border border-warning/30">
                  Stale data
                </span>
              )}
            </div>

            <div className="flex items-center bg-surface-secondary border border-border rounded-[9px] p-0.5 text-xs font-mono">
              {(['10s', '30s', '1m', '5m'] as TimeWindow[]).map(window => (
                <button
                  key={window}
                  onClick={() => setTimeWindow(window)}
                  className={`px-2.5 py-0.5 rounded-[7px] transition-colors ${
                    timeWindow === window
                      ? 'bg-surface text-accent font-semibold shadow-xs'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[240px] p-2">
            {filteredHistory.length > 0 ? (
              <ReactECharts
                option={rpmChartOptions}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
                lazyUpdate={true}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-4">
                <span className="text-sm font-medium text-secondary">No telemetry data available</span>
                <span className="text-xs text-muted mt-1">Waiting for incoming data.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECENT EVENTS SECTION - 16px RADIUS */}
      <div className="glass-card rounded-[16px] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between">
          <span className="text-[15px] font-[600] text-primary">Recent events</span>
          <span className="text-xs text-muted">Last 5 detected events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-surface-secondary text-xs text-secondary font-medium">
                <th className="py-2.5 px-5 font-medium">Time</th>
                <th className="py-2.5 px-5 font-medium">Event</th>
                <th className="py-2.5 px-5 font-medium">Severity</th>
                <th className="py-2.5 px-5 font-medium">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {eventsLoading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-muted">
                    Checking event logs...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-muted">
                    No events recorded.
                  </td>
                </tr>
              ) : (
                events.map(evt => (
                  <tr
                    key={evt.id}
                    onClick={() => evt.recording_id && setSelectedEventId(evt.id)}
                    className={`hover:bg-surface-hover/80 cursor-pointer transition-colors ${
                      selectedEventId === evt.id ? 'bg-surface-secondary' : ''
                    }`}
                  >
                    <td className="py-2.5 px-5 font-mono text-secondary tabular-nums">
                      {new Date(evt.detected_at).toLocaleString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-2.5 px-5 text-primary font-medium">
                      {evt.event_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2.5 px-5">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-[999px] font-medium border ${
                          evt.severity === 'critical'
                            ? 'text-error border-error/30 bg-error-subtle'
                            : evt.severity === 'high'
                            ? 'text-warning border-warning/30 bg-warning-subtle'
                            : 'text-secondary border-border bg-surface-secondary'
                        }`}
                      >
                        {evt.severity || 'low'}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 font-mono text-xs">
                      {evt.recording_id ? (
                        <span className="text-accent hover:text-accent-hover font-medium underline cursor-pointer">
                          View replay
                        </span>
                      ) : (
                        <span className="text-muted">Not captured</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Replay Modal if an event is clicked - 20px RADIUS */}
      {selectedEventId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="w-full max-w-5xl bg-surface border border-border rounded-[20px] shadow-2xl overflow-hidden">
            <IncidentReplay
              eventId={selectedEventId}
              onClose={() => setSelectedEventId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
