import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useTelemetry } from '../providers/TelemetryProvider';
import type { Recording } from '../types';
import { downloadRecordingCSV, downloadRecordingPDF } from '../services/exportService';
import { API_V1_URL } from '../config/api';

export const BlackBox: React.FC = () => {
  const { recordingStatus, loggerDevice, history } = useTelemetry();
  const [retrieving, setRetrieving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
  const [samples, setSamples] = useState<any[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportNotification, setExportNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRecordings = async () => {
    try {
      const res = await fetch(`${API_V1_URL}/recordings`);
      if (res.ok) {
        const data: Recording[] = await res.json();
        setRecordings(data);
        if (data.length > 0 && !activeRecording) {
          setActiveRecording(data[0]);
        }
      }
    } catch (err: any) {
      console.error("Failed to load recordings", err);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  useEffect(() => {
    if (!activeRecording?.id) return;
    setLoadingSamples(true);
    fetch(`${API_V1_URL}/recordings/${activeRecording.id}/samples`)
      .then(res => res.json())
      .then(data => {
        setSamples(data || []);
        setLoadingSamples(false);
      })
      .catch(err => {
        console.error("Failed to fetch recording samples", err);
        setSamples([]);
        setLoadingSamples(false);
      });
  }, [activeRecording?.id]);

  const handleRetrieve = async () => {
    const deviceId = loggerDevice?.device_identifier || 'logger-001';
    setRetrieving(true);
    setError(null);

    try {
      const res = await fetch(`${API_V1_URL}/blackbox/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'ApexESP32SecretKey_2097!'
        },
        body: JSON.stringify({
          device_id: deviceId,
          duration_sec: 300
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Retrieval request failed with status ${res.status}`);
      }

      const resJson = await res.json();
      const checkInterval = setInterval(async () => {
        const checkRes = await fetch(`${API_V1_URL}/recordings`);
        if (checkRes.ok) {
          const recs: Recording[] = await checkRes.json();
          setRecordings(recs);
          const found = recs.find(r => r.retrieval_request_id === resJson.request_id);
          if (found && found.transfer_status === 'COMPLETED') {
            setActiveRecording(found);
            setRetrieving(false);
            clearInterval(checkInterval);
          } else if (found && found.transfer_status === 'FAILED') {
            setError("Device reported recording transfer failure.");
            setRetrieving(false);
            clearInterval(checkInterval);
          }
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(checkInterval);
        setRetrieving(false);
      }, 30000);
    } catch (err: any) {
      setError(err.message || 'Retrieval error');
      setRetrieving(false);
    }
  };

  const handleExportCSV = async () => {
    if (!activeRecording) {
      setExportNotification({ type: 'error', message: 'No recording selected to export.' });
      return;
    }
    if (exportingCSV || exportingPDF) return;

    setExportingCSV(true);
    setExportNotification(null);

    try {
      let dataSamples = samples;
      if (!dataSamples || dataSamples.length === 0) {
        const res = await fetch(`${API_V1_URL}/recordings/${activeRecording.id}/samples`);
        if (!res.ok) throw new Error('Failed to retrieve recording samples from server.');
        dataSamples = await res.json();
        setSamples(dataSamples);
      }

      if (!dataSamples || dataSamples.length === 0) {
        throw new Error('This recording contains no telemetry samples to export.');
      }

      downloadRecordingCSV(activeRecording, dataSamples);
      setExportNotification({
        type: 'success',
        message: `CSV exported successfully (${dataSamples.length.toLocaleString()} samples).`
      });
      setTimeout(() => setExportNotification(null), 4000);
    } catch (err: any) {
      setExportNotification({
        type: 'error',
        message: err.message || 'CSV export failed.'
      });
    } finally {
      setExportingCSV(false);
    }
  };

  const handleExportPDF = async () => {
    if (!activeRecording) {
      setExportNotification({ type: 'error', message: 'No recording selected to export.' });
      return;
    }
    if (exportingCSV || exportingPDF) return;

    setExportingPDF(true);
    setExportNotification(null);

    try {
      let dataSamples = samples;
      if (!dataSamples || dataSamples.length === 0) {
        const res = await fetch(`${API_V1_URL}/recordings/${activeRecording.id}/samples`);
        if (!res.ok) throw new Error('Failed to retrieve recording samples from server.');
        dataSamples = await res.json();
        setSamples(dataSamples);
      }

      if (!dataSamples || dataSamples.length === 0) {
        throw new Error('This recording contains no telemetry samples to export.');
      }

      downloadRecordingPDF(activeRecording, dataSamples);
      setExportNotification({
        type: 'success',
        message: `PDF technical report generated successfully.`
      });
      setTimeout(() => setExportNotification(null), 4000);
    } catch (err: any) {
      setExportNotification({
        type: 'error',
        message: err.message || 'PDF report generation failed.'
      });
    } finally {
      setExportingPDF(false);
    }
  };

  const bufferDuration = activeRecording?.actual_duration_sec
    ? `${Math.floor(activeRecording.actual_duration_sec / 60)}m ${Math.floor(activeRecording.actual_duration_sec % 60)}s`
    : '05:00 (Target)';

  const earliestTs = activeRecording?.recording_start_at
    ? new Date(activeRecording.recording_start_at).toISOString().replace('T', ' ').slice(0, 19)
    : history.length > 0
    ? new Date(history[0].timestamp).toISOString().replace('T', ' ').slice(0, 19)
    : 'N/A';

  const latestTs = activeRecording?.recording_end_at
    ? new Date(activeRecording.recording_end_at).toISOString().replace('T', ' ').slice(0, 19)
    : history.length > 0
    ? new Date(history[history.length - 1].timestamp).toISOString().replace('T', ' ').slice(0, 19)
    : 'N/A';

  const sampleCount = activeRecording?.sample_count ?? samples.length ?? (history.length > 0 ? history.length : 'N/A');
  const integrityStatus = activeRecording?.integrity_status ?? 'UNVERIFIED';

  const chartOptions = useMemo(() => {
    if (samples.length === 0) return null;
    const timeLabels = samples.map(s =>
      new Date(s.original_timestamp_ms).toLocaleTimeString('en-US', {
        hour12: false,
        minute: '2-digit',
        second: '2-digit'
      })
    );

    return {
      backgroundColor: '#FFFFFF',
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FFFFFF',
        borderColor: '#E3E8EF',
        borderWidth: 1,
        textStyle: { color: '#17212F', fontFamily: '"IBM Plex Mono", monospace', fontSize: 11 },
        axisPointer: { type: 'line', lineStyle: { color: '#8590A0', type: 'dashed' } },
        extraCssText: 'box-shadow: 0 2px 6px rgba(0,0,0,0.06); border-radius: 4px;'
      },
      legend: {
        data: ['Speed', 'RPM', 'Deceleration'],
        textStyle: { color: '#596579', fontFamily: '"Inter", sans-serif', fontSize: 11 },
        right: 12,
        top: 0
      },
      grid: { left: 45, right: 45, top: 35, bottom: 25 },
      xAxis: {
        type: 'category',
        data: timeLabels,
        axisLine: { lineStyle: { color: '#E3E8EF' } },
        axisLabel: { color: '#8590A0', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Speed (km/h)',
          nameTextStyle: { color: '#8590A0', fontSize: 10 },
          splitLine: { lineStyle: { color: '#F1F5F9' } },
          axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
        },
        {
          type: 'value',
          name: 'RPM',
          nameTextStyle: { color: '#8590A0', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#596579', fontFamily: '"IBM Plex Mono", monospace', fontSize: 10 }
        }
      ],
      series: [
        {
          name: 'Speed',
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#087F9C', width: 1.5 },
          data: samples.map(s => s.telemetry_data?.vehicle_speed_kmh ?? null)
        },
        {
          name: 'RPM',
          type: 'line',
          yAxisIndex: 1,
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#946200', width: 1.5 },
          data: samples.map(s => s.telemetry_data?.engine_rpm ?? null)
        },
        {
          name: 'Deceleration',
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { color: '#B42332', width: 1.2, type: 'dotted' },
          data: samples.map(s => s.telemetry_data?.deceleration_mps2 ?? null)
        }
      ]
    };
  }, [samples]);

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-primary tracking-[-0.4px]">Black Box</h1>
          <p className="text-sm font-normal text-secondary mt-1">Retrieve and inspect the last five minutes of recorded vehicle telemetry.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* PRIMARY ACTION */}
          <button
            onClick={handleRetrieve}
            disabled={retrieving}
            className={`px-4 py-2 text-sm font-medium rounded-[7px] transition-colors flex items-center gap-2 ${
              retrieving
                ? 'bg-surface-secondary text-muted border border-border cursor-not-allowed'
                : 'bg-accent hover:bg-accent-hover text-white shadow-xs'
            }`}
          >
            {retrieving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Retrieving from device...</span>
              </>
            ) : (
              'Retrieve last 5 minutes'
            )}
          </button>
        </div>
      </div>

      {/* EXPORT NOTIFICATION BANNER */}
      {exportNotification && (
        <div
          className={`border rounded-[10px] p-3 text-xs flex items-center justify-between transition-all ${
            exportNotification.type === 'success'
              ? 'bg-success-subtle border-success/30 text-success'
              : 'bg-error-subtle border-error/30 text-error'
          }`}
        >
          <div className="flex items-center gap-2">
            {exportNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{exportNotification.message}</span>
          </div>
          <button
            onClick={() => setExportNotification(null)}
            className="text-secondary hover:text-primary font-medium text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* RECORDING STATUS SUMMARY */}
      <div className="glass-panel rounded-[18px] p-5.5">
        <div className="text-[13px] font-semibold text-secondary mb-4 tracking-wide">
          Recording status summary
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 text-xs divide-y lg:divide-y-0 lg:divide-x divide-border/80">
          <div className="pt-2 lg:pt-0 lg:pr-3">
            <div className="text-muted text-[11px] font-sans">Recorder state</div>
            <div className="text-success font-semibold mt-1">CYCLING (PSRAM)</div>
          </div>
          <div className="pt-2 lg:pt-0 lg:px-3">
            <div className="text-muted text-[11px] font-sans">Available duration</div>
            <div className="text-primary font-semibold font-mono mt-1 tabular-nums">{bufferDuration}</div>
          </div>
          <div className="pt-2 lg:pt-0 lg:px-3">
            <div className="text-muted text-[11px] font-sans">Earliest timestamp</div>
            <div className="text-secondary font-mono mt-1 tabular-nums text-[11px] truncate">{earliestTs}</div>
          </div>
          <div className="pt-2 lg:pt-0 lg:px-3">
            <div className="text-muted text-[11px] font-sans">Latest timestamp</div>
            <div className="text-secondary font-mono mt-1 tabular-nums text-[11px] truncate">{latestTs}</div>
          </div>
          <div className="pt-2 lg:pt-0 lg:px-3">
            <div className="text-muted text-[11px] font-sans">Recorded samples</div>
            <div className="text-primary font-semibold font-mono mt-1 tabular-nums">
              {typeof sampleCount === 'number' ? sampleCount.toLocaleString() : sampleCount}
            </div>
          </div>
          <div className="pt-2 lg:pt-0 lg:pl-3">
            <div className="text-muted text-[11px] font-sans">Integrity state</div>
            <div
              className={`font-semibold font-mono mt-1 ${
                integrityStatus === 'VERIFIED' ? 'text-success' : 'text-warning'
              }`}
            >
              {integrityStatus}
            </div>
          </div>
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="bg-error-subtle border border-error/30 rounded-[12px] p-3.5 text-xs text-error flex items-center justify-between">
          <span>Error during Black Box retrieval: {error}</span>
          <button onClick={() => setError(null)} className="text-secondary hover:text-primary font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* RETRIEVAL IN PROGRESS BANNER */}
      {(retrieving || recordingStatus?.status === 'TRANSFERRING') && (
        <div className="bg-accent-subtle border border-accent/30 rounded-[12px] p-3.5 text-xs text-accent flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-medium">
              Retrieval in progress: Gateway requesting 300s ring buffer from Logger ESP32 via ESP-NOW...
            </span>
          </div>
          {recordingStatus && (
            <span className="font-mono font-semibold tabular-nums">
              {Math.round(recordingStatus.progress * 100)}%
            </span>
          )}
        </div>
      )}

      {/* RECORDING TIMELINE */}
      <div className="glass-card rounded-[16px] p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[13px] font-semibold text-primary">Recording timeline</span>
          <span className="text-secondary font-mono text-[11px]">Interval: 300 seconds rolling buffer</span>
        </div>

        {/* Horizontal Timeline Bar */}
        <div className="w-full h-8 bg-surface-secondary border border-border/80 rounded-[8px] flex items-center px-2 relative overflow-hidden">
          <div className="h-4 bg-accent-subtle border border-accent/30 rounded-[5px] w-full flex items-center justify-between px-2.5 text-[11px] font-mono text-accent">
            <span>Continuous Ingestion</span>
            <span>10 Hz Sampling</span>
          </div>
        </div>

        <div className="flex justify-between text-xs font-mono text-secondary">
          <span>T - 5m:00s ({earliestTs})</span>
          <span>T - 0m:00s ({latestTs})</span>
        </div>
      </div>

      {/* TELEMETRY PREVIEW */}
      <div className="glass-card rounded-[16px] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between">
          <span className="text-[14px] font-semibold text-primary">Retrieved telemetry trace</span>
          <div className="text-xs font-mono text-secondary">
            {samples.length > 0 ? `${samples.length.toLocaleString()} samples loaded` : 'No samples loaded'}
          </div>
        </div>

        <div className="h-[280px] p-2">
          {loadingSamples ? (
            <div className="w-full h-full flex items-center justify-center text-xs font-mono text-muted">
              Loading retrieved recording telemetry...
            </div>
          ) : chartOptions ? (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
              lazyUpdate={true}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-muted">
              <span>No telemetry data available</span>
              <span className="text-[11px] mt-0.5">Select or retrieve a recording to preview speed, RPM, and deceleration traces.</span>
            </div>
          )}
        </div>
      </div>

      {/* RECORDING DETAILS & EXPORT */}
      <div className="glass-panel rounded-[18px] p-5.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-primary">Recording details & export</span>
            {recordings.length > 0 && (
              <select
                value={activeRecording?.id || ''}
                onChange={e => {
                  const rec = recordings.find(r => r.id === e.target.value);
                  if (rec) setActiveRecording(rec);
                }}
                className="bg-surface border border-border rounded-[9px] px-3 py-1.5 text-xs font-mono text-primary outline-none focus:border-accent"
              >
                {recordings.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.id.slice(0, 8)}... ({r.recording_type})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* EXPORT ACTIONS */}
          {activeRecording && (
            <div className="flex items-center gap-2">
              {/* EXPORT CSV BUTTON */}
              <button
                onClick={handleExportCSV}
                disabled={exportingCSV || exportingPDF || (samples.length === 0 && !loadingSamples)}
                title="Download complete telemetry dataset as CSV"
                className={`px-3.5 py-2 text-xs font-medium rounded-[9px] border transition-colors flex items-center gap-1.5 shadow-xs ${
                  exportingCSV || exportingPDF || (samples.length === 0 && !loadingSamples)
                    ? 'border-border text-muted bg-surface-secondary cursor-not-allowed'
                    : 'border-border text-primary bg-surface hover:bg-surface-hover hover:border-accent/40 active:bg-surface-secondary'
                }`}
              >
                {exportingCSV ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                    <span>Preparing CSV...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                    <span>Export CSV</span>
                  </>
                )}
              </button>

              {/* EXPORT PDF BUTTON */}
              <button
                onClick={handleExportPDF}
                disabled={exportingCSV || exportingPDF || (samples.length === 0 && !loadingSamples)}
                title="Generate and download A4 engineering technical report as PDF"
                className={`px-3.5 py-2 text-xs font-medium rounded-[9px] border transition-colors flex items-center gap-1.5 shadow-xs ${
                  exportingCSV || exportingPDF || (samples.length === 0 && !loadingSamples)
                    ? 'border-border text-muted bg-surface-secondary cursor-not-allowed'
                    : 'border-accent/40 text-accent bg-accent-subtle hover:bg-accent/15 active:bg-accent/20'
                }`}
              >
                {exportingPDF ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <span>Export PDF</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {activeRecording ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <span className="text-muted text-[11px] font-sans block">Recording ID</span>
              <span className="text-primary font-mono text-xs truncate block mt-0.5">
                {activeRecording.id}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">Time range</span>
              <span className="text-secondary text-xs block mt-0.5">
                {earliestTs} → {latestTs}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">Total samples</span>
              <span className="text-primary font-medium block mt-0.5 tabular-nums">
                {activeRecording.sample_count || samples.length}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">Integrity verification</span>
              <span
                className={`font-semibold block mt-0.5 ${
                  activeRecording.integrity_status === 'VERIFIED'
                    ? 'text-success'
                    : 'text-warning'
                }`}
              >
                {activeRecording.integrity_status} (CRC32 Verified)
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted">
            No active recording selected. Please trigger retrieval or select a recording above to load Black Box history.
          </div>
        )}
      </div>
    </div>
  );
};
