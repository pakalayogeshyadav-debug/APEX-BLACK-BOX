import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Play, Pause, X } from 'lucide-react';
import { API_V1_URL } from '../config/api';

interface IncidentReplayProps {
  eventId: string;
  onClose: () => void;
}

export const IncidentReplay: React.FC<IncidentReplayProps> = ({ eventId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    fetch(`${API_V1_URL}/events/${eventId}/replay`)
      .then(res => {
        if (!res.ok) throw new Error("Replay telemetry unavailable for this incident");
        return res.json();
      })
      .then(resData => {
        setData(resData);
        if (resData.samples && resData.samples.length > 0) {
          setCurrentTimeMs(resData.samples[0].timestamp_ms);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [eventId]);

  const stopPlayback = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
    } else {
      if (!data?.samples || data.samples.length === 0) return;
      setIsPlaying(true);

      const firstTs = data.samples[0].timestamp_ms;
      const lastTs = data.samples[data.samples.length - 1].timestamp_ms;

      if (currentTimeMs >= lastTs) {
        setCurrentTimeMs(firstTs);
      }

      const stepIntervalMs = 100;
      timerRef.current = window.setInterval(() => {
        setCurrentTimeMs(prev => {
          const next = prev + (stepIntervalMs * playbackSpeed);
          if (next >= lastTs) {
            stopPlayback();
            setIsPlaying(false);
            return lastTs;
          }
          return next;
        });
      }, stepIntervalMs);
    }
  };

  const samples = data?.samples || [];
  const event = data?.event;

  const activeSample = useMemo(() => {
    if (samples.length === 0) return null;
    return samples.reduce((prev: any, curr: any) =>
      Math.abs(curr.timestamp_ms - currentTimeMs) < Math.abs(prev.timestamp_ms - currentTimeMs)
        ? curr
        : prev
    );
  }, [samples, currentTimeMs]);

  const chartOptions = useMemo(() => {
    if (samples.length === 0) return null;

    const timeLabels = samples.map((s: any) =>
      new Date(s.timestamp_ms).toLocaleTimeString('en-US', {
        hour12: false,
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 1
      } as any)
    );

    const triggerIdx = event
      ? samples.findIndex((s: any) => s.timestamp_ms >= event.trigger_timestamp_ms)
      : -1;

    return {
      backgroundColor: '#FFFFFF',
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FFFFFF',
        borderColor: '#E3E8EF',
        borderWidth: 1,
        textStyle: { color: '#17212F', fontFamily: '"IBM Plex Mono", monospace', fontSize: 11 },
        extraCssText: 'box-shadow: 0 2px 6px rgba(0,0,0,0.06); border-radius: 4px;'
      },
      legend: {
        data: ['Speed (km/h)', 'RPM', 'Decel (m/s²)'],
        textStyle: { color: '#596579', fontFamily: '"Inter", sans-serif', fontSize: 11 },
        right: 12,
        top: 0
      },
      grid: { left: 45, right: 45, top: 32, bottom: 25 },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: '#E3E8EF' } },
        axisLabel: { color: '#8590A0', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Speed',
          splitLine: { lineStyle: { color: '#F1F5F9' } },
          axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
        },
        {
          type: 'value',
          name: 'RPM',
          splitLine: { show: false },
          axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
        }
      ],
      series: [
        {
          name: 'Speed (km/h)',
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#087F9C', width: 1.5 },
          data: samples.map((s: any) => s.telemetry?.vehicle_speed_kmh ?? null),
          markLine: triggerIdx >= 0 ? {
            symbol: ['none', 'none'],
            label: {
              show: true,
              position: 'start',
              formatter: 'EVENT TRIGGER',
              color: '#B42332',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 9
            },
            lineStyle: { color: '#B42332', type: 'dashed', width: 1.5 },
            data: [{ xAxis: triggerIdx }]
          } : undefined
        },
        {
          name: 'RPM',
          type: 'line',
          yAxisIndex: 1,
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#946200', width: 1.5 },
          data: samples.map((s: any) => s.telemetry?.engine_rpm ?? null)
        },
        {
          name: 'Decel (m/s²)',
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#B42332', width: 1.2, type: 'dotted' },
          data: samples.map((s: any) => s.telemetry?.deceleration_mps2 ?? null)
        }
      ]
    };
  }, [samples, event]);

  if (loading) {
    return (
      <div className="bg-surface p-6 text-center text-xs font-mono text-muted">
        Loading synchronized incident telemetry data...
      </div>
    );
  }

  if (error || samples.length === 0) {
    return (
      <div className="bg-surface p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-semibold text-error">Replay unavailable</span>
          <button onClick={onClose} className="text-muted hover:text-primary">
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-secondary">
          {error || "No recorded telemetry samples are associated with this incident trigger."}
        </p>
        <div className="text-[11px] text-muted">
          Pre-event data gap: Recording transfer was not completed or no matching time interval exists in the database.
        </div>
      </div>
    );
  }

  const firstTs = samples[0]?.timestamp_ms || 0;
  const lastTs = samples[samples.length - 1]?.timestamp_ms || 1;

  return (
    <div className="bg-surface flex flex-col select-none">
      {/* Top Replay Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 bg-accent-subtle border border-accent/25 text-accent text-xs font-mono font-medium rounded-[6px]">
            REPLAY MODE
          </span>
          <span className="text-sm font-semibold text-primary">
            Incident: {event?.type?.replace(/_/g, ' ') || 'Event'}
          </span>
          <span className="text-xs font-mono text-muted">
            Recording ID: {data.recording_id}
          </span>
        </div>

        <button onClick={onClose} className="text-muted hover:text-primary p-1 rounded-[6px] hover:bg-surface-hover">
          <X size={16} />
        </button>
      </div>

      {/* Synchronized Metrics Bar */}
      <div className="px-5 py-2.5 border-b border-border bg-surface-secondary flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-secondary font-sans text-[11px]">Playback Time:</span>{' '}
            <span className="text-primary tabular-nums font-medium">
              {new Date(currentTimeMs).toISOString().replace('T', ' ').slice(11, 23)}
            </span>
          </div>
          <div>
            <span className="text-secondary font-sans text-[11px]">Speed:</span>{' '}
            <span className="text-accent tabular-nums font-semibold">
              {activeSample?.telemetry?.vehicle_speed_kmh?.toFixed(1) ?? 'N/A'} km/h
            </span>
          </div>
          <div>
            <span className="text-secondary font-sans text-[11px]">RPM:</span>{' '}
            <span className="text-warning tabular-nums font-medium">
              {activeSample?.telemetry?.engine_rpm ?? 'N/A'} rpm
            </span>
          </div>
          <div>
            <span className="text-secondary font-sans text-[11px]">Deceleration:</span>{' '}
            <span className="text-error tabular-nums font-medium">
              {activeSample?.telemetry?.deceleration_mps2?.toFixed(2) ?? 'N/A'} m/s²
            </span>
          </div>
        </div>

        <div className="text-[11px] text-muted">
          Trigger: {new Date(event?.trigger_timestamp_ms).toLocaleTimeString()}
        </div>
      </div>

      {/* Chart Display */}
      <div className="h-[220px] p-2 bg-surface">
        {chartOptions && (
          <ReactECharts
            option={chartOptions}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={true}
          />
        )}
      </div>

      {/* Scrubbing Timeline & Playback Controls */}
      <div className="p-4 border-t border-border bg-surface-secondary flex items-center gap-4">
        <button
          onClick={togglePlayback}
          className="p-2 border border-border bg-surface rounded-[7px] text-primary hover:bg-surface-hover transition-colors shadow-xs"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Scrubbing slider */}
        <input
          type="range"
          min={firstTs}
          max={lastTs}
          value={currentTimeMs}
          onChange={e => {
            stopPlayback();
            setIsPlaying(false);
            setCurrentTimeMs(Number(e.target.value));
          }}
          className="flex-1 accent-accent h-1.5 bg-border rounded-full cursor-pointer"
        />

        {/* Playback speed selector */}
        <div className="flex items-center bg-surface border border-border rounded-[7px] p-0.5 text-xs font-mono shadow-xs">
          {[0.5, 1, 2, 5].map(spd => (
            <button
              key={spd}
              onClick={() => setPlaybackSpeed(spd)}
              className={`px-2 py-0.5 rounded-[5px] transition-colors ${
                playbackSpeed === spd
                  ? 'bg-accent-subtle text-accent font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
