import React, { useState, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTelemetry } from '../providers/TelemetryProvider';

type TimeWindow = '10s' | '30s' | '1m' | '5m';

export const LiveTelemetry: React.FC = () => {
  const { history, status, lastUpdate, rate, isStale } = useTelemetry();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30s');

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

  const timeData = filteredHistory.map(h =>
    new Date(h.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 1
    } as any)
  );

  const options = {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: 'rgba(148, 163, 184, 0.22)',
      borderWidth: 1,
      textStyle: { color: '#172334', fontFamily: '"IBM Plex Mono", monospace', fontSize: 11 },
      axisPointer: { type: 'cross', lineStyle: { color: '#8996A8', type: 'dashed' } },
      extraCssText: 'box-shadow: 0 4px 16px rgba(25, 42, 70, 0.08); border-radius: 9px;'
    },
    legend: {
      data: ['Speed', 'RPM', 'Throttle', 'Deceleration'],
      textStyle: { color: '#596A7F', fontFamily: '"Inter", sans-serif', fontSize: 11 },
      top: 0,
      right: 12
    },
    grid: { left: 55, right: 55, top: 40, bottom: 35 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeData,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.22)' } },
      axisLabel: { color: '#8996A8', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Speed (km/h) / Throttle (%)',
        position: 'left',
        nameTextStyle: { color: '#8996A8', fontFamily: '"Inter", sans-serif', fontSize: 10, padding: [0, 0, 8, 0] },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)' } },
        axisLabel: { color: '#596A7F', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
      },
      {
        type: 'value',
        name: 'Engine RPM',
        position: 'right',
        nameTextStyle: { color: '#8996A8', fontFamily: '"Inter", sans-serif', fontSize: 10, padding: [0, 0, 8, 0] },
        splitLine: { show: false },
        axisLabel: { color: '#596A7F', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
      }
    ],
    series: [
      {
        name: 'Speed',
        type: 'line',
        data: filteredHistory.map(h => h.speed),
        color: '#0891B2',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.6 }
      },
      {
        name: 'RPM',
        type: 'line',
        yAxisIndex: 1,
        data: filteredHistory.map(h => h.rpm),
        color: '#B77916',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.5 }
      },
      {
        name: 'Throttle',
        type: 'line',
        data: filteredHistory.map(h => h.throttle),
        color: '#16865A',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.2, type: 'dashed' }
      },
      {
        name: 'Deceleration',
        type: 'line',
        data: filteredHistory.map(h => h.deceleration),
        color: '#C93C4B',
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 1.2, type: 'dotted' }
      }
    ]
  };

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-[25px] font-semibold tracking-tight leading-tight text-primary">Live telemetry</h1>
          <p className="text-[14px] text-secondary mt-1">Real-time multi-channel telemetry strip chart.</p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'LIVE' || status === 'SIMULATION' ? 'bg-success' : isStale ? 'bg-warning' : 'bg-error'
              }`}
            />
            <span className="font-sans font-medium text-primary">
              {status === 'DISCONNECTED' ? 'Offline' : isStale ? 'Stream Stalled' : 'Active Stream'}
            </span>
          </div>

          <div className="w-px h-3.5 bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-muted font-sans">Rate</span>
            <span className="text-primary tabular-nums font-medium">{rate} Hz</span>
          </div>

          <div className="w-px h-3.5 bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-muted font-sans">Last Msg</span>
            <span className="text-primary tabular-nums">
              {lastUpdate
                ? new Date(lastUpdate).toLocaleTimeString('en-US', { hour12: false })
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* STRIP CHART CONTAINER */}
      <div className="rounded-[16px] glass-card flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
          <div>
            <span className="text-[15px] font-semibold text-primary">Multi-channel oscilloscope</span>
            <span className="text-xs text-muted ml-2 font-mono">CAN CH0</span>
          </div>

          {/* Time Selector */}
          <div className="flex items-center bg-surface-secondary border border-border rounded-[9px] p-0.5 text-xs font-mono">
            {(['10s', '30s', '1m', '5m'] as TimeWindow[]).map(win => (
              <button
                key={win}
                onClick={() => setTimeWindow(win)}
                className={`px-3 py-1 rounded-[7px] transition-colors ${
                  timeWindow === win
                    ? 'bg-white text-accent font-semibold shadow-xs'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {win}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 h-[540px]">
          {filteredHistory.length > 0 ? (
            <ReactECharts
              option={options}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
              lazyUpdate={true}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-muted">
              <span className="font-medium text-secondary text-sm">No telemetry data available</span>
              <span className="text-xs text-muted mt-1">Waiting for incoming data.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
