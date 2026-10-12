import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, Loader2, CheckCircle2, AlertCircle, Eye, X } from 'lucide-react';
import type { Recording } from '../types';
import { downloadRecordingCSV, downloadRecordingPDF } from '../services/exportService';

export const Recordings: React.FC = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [samples, setSamples] = useState<any[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [exportingState, setExportingState] = useState<{ id: string; type: 'csv' | 'pdf' } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/recordings');
      if (!res.ok) throw new Error('Failed to load recordings');
      const data: Recording[] = await res.json();
      setRecordings(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const handleView = async (rec: Recording) => {
    setSelectedRecording(rec);
    setLoadingSamples(true);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/recordings/${rec.id}/samples`);
      if (res.ok) {
        const s = await res.json();
        setSamples(s || []);
      }
    } catch (e) {
      console.error('Failed to load recording samples', e);
      setSamples([]);
    } finally {
      setLoadingSamples(false);
    }
  };

  const fetchSamplesForRecording = async (rec: Recording): Promise<any[]> => {
    if (selectedRecording?.id === rec.id && samples.length > 0) {
      return samples;
    }
    const res = await fetch(`http://localhost:8000/api/v1/recordings/${rec.id}/samples`);
    if (!res.ok) throw new Error('Failed to fetch recording samples from server');
    const data = await res.json();
    return data || [];
  };

  const handleExportCSV = async (rec: Recording) => {
    if (exportingState) return;
    setExportingState({ id: rec.id, type: 'csv' });
    setNotification(null);

    try {
      const sampleList = await fetchSamplesForRecording(rec);
      if (!sampleList || sampleList.length === 0) {
        throw new Error('No recorded samples available for this block.');
      }

      downloadRecordingCSV(rec, sampleList);
      setNotification({
        type: 'success',
        message: `CSV exported for ${rec.id.slice(0, 8)}... (${sampleList.length.toLocaleString()} samples).`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Export CSV failed.'
      });
    } finally {
      setExportingState(null);
    }
  };

  const handleExportPDF = async (rec: Recording) => {
    if (exportingState) return;
    setExportingState({ id: rec.id, type: 'pdf' });
    setNotification(null);

    try {
      const sampleList = await fetchSamplesForRecording(rec);
      if (!sampleList || sampleList.length === 0) {
        throw new Error('No recorded samples available for this block.');
      }

      downloadRecordingPDF(rec, sampleList);
      setNotification({
        type: 'success',
        message: `PDF report generated for ${rec.id.slice(0, 8)}...`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Export PDF failed.'
      });
    } finally {
      setExportingState(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1720px] mx-auto select-none">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-primary tracking-[-0.4px]">Recordings</h1>
          <p className="text-sm font-normal text-secondary mt-1">Persisted Black Box telemetry recordings library.</p>
        </div>
        <div className="text-xs font-mono text-muted">
          Total Blocks: <span className="text-primary font-medium tabular-nums">{recordings.length}</span>
        </div>
      </div>

      {/* NOTIFICATION FEEDBACK */}
      {notification && (
        <div
          className={`border rounded-[10px] p-3 text-xs flex items-center justify-between transition-all ${
            notification.type === 'success'
              ? 'bg-success-subtle border-success/30 text-success'
              : 'bg-error-subtle border-error/30 text-error'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-secondary hover:text-primary font-medium text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-error-subtle border border-error/30 rounded-[10px] p-3.5 text-xs text-error">
          Database query failed: {error}
        </div>
      )}

      {/* SAMPLE DETAIL DRAWER IF VIEWING */}
      {selectedRecording && (
        <div className="glass-panel rounded-[18px] p-5.5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
            <div className="text-sm font-semibold text-primary">
              Recording Inspection: <span className="font-mono text-accent text-xs bg-accent-subtle/80 px-2 py-0.5 rounded-[6px]">{selectedRecording.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportCSV(selectedRecording)}
                disabled={!!exportingState}
                className="px-3 py-1.5 text-xs font-medium rounded-[9px] border border-border bg-surface text-primary hover:bg-surface-hover flex items-center gap-1.5 transition-colors shadow-xs disabled:cursor-not-allowed disabled:text-muted"
              >
                {exportingState?.id === selectedRecording.id && exportingState.type === 'csv' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                )}
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => handleExportPDF(selectedRecording)}
                disabled={!!exportingState}
                className="px-3 py-1.5 text-xs font-medium rounded-[9px] border border-accent/40 bg-accent-subtle text-accent hover:bg-accent/15 flex items-center gap-1.5 transition-colors shadow-xs disabled:cursor-not-allowed disabled:text-muted"
              >
                {exportingState?.id === selectedRecording.id && exportingState.type === 'pdf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-accent" />
                )}
                <span>Export PDF</span>
              </button>
              <button
                onClick={() => setSelectedRecording(null)}
                className="p-1.5 rounded-[9px] text-secondary hover:text-primary hover:bg-surface-hover ml-1"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono text-secondary">
            <div>
              <span className="text-muted text-[11px] font-sans block">Start timestamp</span>
              <span className="text-primary mt-1 block">
                {selectedRecording.recording_start_at
                  ? new Date(selectedRecording.recording_start_at).toISOString().replace('T', ' ').slice(0, 19)
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">End timestamp</span>
              <span className="text-primary mt-1 block">
                {selectedRecording.recording_end_at
                  ? new Date(selectedRecording.recording_end_at).toISOString().replace('T', ' ').slice(0, 19)
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">Samples loaded</span>
              <span className="text-primary mt-1 block tabular-nums">
                {loadingSamples ? 'Fetching...' : `${samples.length.toLocaleString()} Samples`}
              </span>
            </div>
            <div>
              <span className="text-muted text-[11px] font-sans block">Transfer status</span>
              <span className="text-success mt-1 block font-semibold">
                {selectedRecording.transfer_status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RECORDINGS TABLE */}
      <div className="glass-card rounded-[16px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-surface-secondary text-xs text-secondary font-medium">
                <th className="py-2.5 px-5 font-medium">Recording ID</th>
                <th className="py-2.5 px-5 font-medium">Recorded at</th>
                <th className="py-2.5 px-5 font-medium">Duration</th>
                <th className="py-2.5 px-5 font-medium">Sample count</th>
                <th className="py-2.5 px-5 font-medium">Associated event</th>
                <th className="py-2.5 px-5 font-medium">Integrity</th>
                <th className="py-2.5 px-5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs font-mono text-muted">
                    Loading telemetry archive database...
                  </td>
                </tr>
              ) : recordings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-muted">
                    No recordings found in persistent storage.
                  </td>
                </tr>
              ) : (
                recordings.map(rec => {
                  const isExportingThisCSV = exportingState?.id === rec.id && exportingState.type === 'csv';
                  const isExportingThisPDF = exportingState?.id === rec.id && exportingState.type === 'pdf';
                  const isBusy = !!exportingState;

                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-surface-hover/80 transition-colors"
                    >
                      <td className="py-2.5 px-5 font-mono text-xs text-accent font-medium">
                        {rec.id.slice(0, 8)}...
                      </td>
                      <td className="py-2.5 px-5 font-mono text-secondary tabular-nums">
                        {new Date(rec.created_at).toLocaleString('en-US', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="py-2.5 px-5 font-mono text-primary tabular-nums">
                        {rec.actual_duration_sec ? `${Math.round(rec.actual_duration_sec)}s` : `${rec.requested_duration_sec}s`}
                      </td>
                      <td className="py-2.5 px-5 font-mono text-primary tabular-nums">
                        {rec.sample_count.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-5 text-secondary">
                        {rec.recording_type.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-5">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[11px] font-mono rounded-[999px] font-medium border ${
                            rec.integrity_status === 'VERIFIED'
                              ? 'text-success border-success/30 bg-success-subtle'
                              : 'text-warning border-warning/30 bg-warning-subtle'
                          }`}
                        >
                          {rec.integrity_status}
                        </span>
                      </td>
                      <td className="py-2.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs">
                          {/* VIEW BUTTON */}
                          <button
                            onClick={() => handleView(rec)}
                            title="Inspect recording samples"
                            className="px-2.5 py-1 rounded-[9px] border border-border bg-surface text-primary hover:bg-surface-hover transition-colors shadow-xs flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3 text-secondary" />
                            <span>View</span>
                          </button>

                          {/* EXPORT CSV BUTTON */}
                          <button
                            onClick={() => handleExportCSV(rec)}
                            disabled={isBusy}
                            title="Export CSV dataset"
                            className="px-2.5 py-1 rounded-[9px] border border-border bg-surface text-primary hover:bg-surface-hover transition-colors shadow-xs flex items-center gap-1 disabled:cursor-not-allowed disabled:text-muted"
                          >
                            {isExportingThisCSV ? (
                              <Loader2 className="w-3 h-3 animate-spin text-accent" />
                            ) : (
                              <FileSpreadsheet className="w-3 h-3 text-accent" />
                            )}
                            <span>CSV</span>
                          </button>

                          {/* EXPORT PDF BUTTON */}
                          <button
                            onClick={() => handleExportPDF(rec)}
                            disabled={isBusy}
                            title="Export PDF technical report"
                            className="px-2.5 py-1 rounded-[9px] border border-accent/30 bg-accent-subtle text-accent hover:bg-accent/15 transition-colors shadow-xs flex items-center gap-1 disabled:cursor-not-allowed disabled:text-muted"
                          >
                            {isExportingThisPDF ? (
                              <Loader2 className="w-3 h-3 animate-spin text-accent" />
                            ) : (
                              <FileText className="w-3 h-3 text-accent" />
                            )}
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
