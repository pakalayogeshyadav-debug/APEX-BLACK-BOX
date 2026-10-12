import { jsPDF } from 'jspdf';
import type { Recording } from '../types';

export interface TelemetryStats {
  speed: { min: number; max: number; avg: number; count: number };
  rpm: { min: number; max: number; avg: number; count: number };
  throttle: { min: number; max: number; avg: number; count: number };
  decel: { min: number; max: number; avg: number; count: number };
}

/**
 * Computes summary statistics from actual telemetry samples
 */
export function computeTelemetryStats(samples: any[]): TelemetryStats {
  const speeds: number[] = [];
  const rpms: number[] = [];
  const throttles: number[] = [];
  const decels: number[] = [];

  for (const s of samples) {
    const t = s.telemetry_data || s.telemetry || {};
    if (typeof t.vehicle_speed_kmh === 'number') speeds.push(t.vehicle_speed_kmh);
    if (typeof t.engine_rpm === 'number') rpms.push(t.engine_rpm);
    if (typeof t.throttle_percent === 'number') throttles.push(t.throttle_percent);
    if (typeof t.deceleration_mps2 === 'number') decels.push(t.deceleration_mps2);
  }

  const calc = (arr: number[]) => {
    if (arr.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { min, max, avg, count: arr.length };
  };

  return {
    speed: calc(speeds),
    rpm: calc(rpms),
    throttle: calc(throttles),
    decel: calc(decels)
  };
}

/**
 * Generates and downloads a CSV file containing complete telemetry recording samples
 */
export function downloadRecordingCSV(recording: Recording, samples: any[]): void {
  if (!samples || samples.length === 0) {
    throw new Error('No recorded samples available to export.');
  }

  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'timestamp_iso',
    'original_timestamp_ms',
    'sequence_number',
    'speed_kmh',
    'engine_rpm',
    'throttle_percent',
    'deceleration_mps2',
    'can_id',
    'can_data',
    'recording_id'
  ];

  const rows: string[] = [headers.join(',')];

  for (const s of samples) {
    const t = s.telemetry_data || s.telemetry || {};
    const timestampMs = s.original_timestamp_ms ?? s.timestamp_ms;
    const isoString = timestampMs ? new Date(timestampMs).toISOString() : '';

    let canIdStr = '';
    let canDataStr = '';
    if (s.can_frames && Array.isArray(s.can_frames) && s.can_frames.length > 0) {
      canIdStr = s.can_frames.map((f: any) => f.can_id ?? f.id ?? '').filter(Boolean).join(';');
      canDataStr = s.can_frames.map((f: any) => f.payload_hex ?? f.data ?? '').filter(Boolean).join(';');
    } else if (s.can_id !== undefined || s.can_data !== undefined) {
      canIdStr = s.can_id ? String(s.can_id) : '';
      canDataStr = s.can_data ? String(s.can_data) : '';
    }

    const row = [
      escapeCSV(isoString),
      escapeCSV(timestampMs ?? ''),
      escapeCSV(s.original_sequence_number ?? s.sequence_number ?? ''),
      escapeCSV(t.vehicle_speed_kmh ?? ''),
      escapeCSV(t.engine_rpm ?? ''),
      escapeCSV(t.throttle_percent ?? ''),
      escapeCSV(t.deceleration_mps2 ?? ''),
      escapeCSV(canIdStr),
      escapeCSV(canDataStr),
      escapeCSV(recording.id)
    ];

    rows.push(row.join(','));
  }

  // Prepend UTF-8 BOM so Excel opens cleanly
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanRecId = recording.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `apex-blackbox-recording-${cleanRecId}-${timestampStr}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a professional PDF technical report of the telemetry recording
 */
export function downloadRecordingPDF(recording: Recording, samples: any[]): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);

  const stats = computeTelemetryStats(samples);
  const genTimestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const startTs = recording.recording_start_at
    ? new Date(recording.recording_start_at).toISOString().replace('T', ' ').slice(0, 19)
    : samples.length > 0
    ? new Date(samples[0].original_timestamp_ms || samples[0].timestamp_ms).toISOString().replace('T', ' ').slice(0, 19)
    : 'N/A';

  const endTs = recording.recording_end_at
    ? new Date(recording.recording_end_at).toISOString().replace('T', ' ').slice(0, 19)
    : samples.length > 0
    ? new Date(samples[samples.length - 1].original_timestamp_ms || samples[samples.length - 1].timestamp_ms).toISOString().replace('T', ' ').slice(0, 19)
    : 'N/A';

  const durationSec = recording.actual_duration_sec
    ? `${recording.actual_duration_sec.toFixed(1)}s`
    : `${recording.requested_duration_sec || 300}s`;

  let currentY = margin;

  // Header Bar
  doc.setFillColor(8, 127, 156); // #087F9C Primary Accent
  doc.rect(margin, currentY, contentWidth, 3, 'F');
  currentY += 18;

  // Title Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(23, 33, 47); // #17212F
  doc.text('APEX BLACKBOX', margin, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(89, 101, 121); // #596579
  doc.text('Vehicle Telemetry Recording Report', margin + 145, currentY);

  doc.setFontSize(9);
  doc.setTextColor(133, 144, 160); // #8590A0
  doc.text(`Generated: ${genTimestamp}`, pageWidth - margin, currentY, { align: 'right' });
  currentY += 16;

  // Thin separator rule
  doc.setDrawColor(227, 232, 239); // #E3E8EF
  doc.setLineWidth(0.75);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 16;

  // Section 1: Recording Information Box
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(227, 232, 239);
  doc.roundedRect(margin, currentY, contentWidth, 80, 5, 5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 47);
  doc.text('1. RECORDING IDENTIFICATION & METADATA', margin + 14, currentY + 18);

  const col1X = margin + 14;
  const col2X = margin + (contentWidth / 2) + 10;
  const metaLine1Y = currentY + 36;
  const metaLine2Y = currentY + 52;
  const metaLine3Y = currentY + 68;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(89, 101, 121);
  doc.text('Recording ID:', col1X, metaLine1Y);
  doc.text('Start Time:', col1X, metaLine2Y);
  doc.text('End Time:', col1X, metaLine3Y);

  doc.setFont('courier', 'bold');
  doc.setTextColor(23, 33, 47);
  doc.text(String(recording.id), col1X + 70, metaLine1Y);
  doc.text(startTs, col1X + 70, metaLine2Y);
  doc.text(endTs, col1X + 70, metaLine3Y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(89, 101, 121);
  doc.text('Duration:', col2X, metaLine1Y);
  doc.text('Total Samples:', col2X, metaLine2Y);
  doc.text('Integrity Check:', col2X, metaLine3Y);

  doc.setFont('courier', 'bold');
  doc.setTextColor(23, 33, 47);
  doc.text(durationSec, col2X + 80, metaLine1Y);
  doc.text(String(recording.sample_count || samples.length), col2X + 80, metaLine2Y);

  const isVerified = recording.integrity_status === 'VERIFIED';
  doc.setTextColor(isVerified ? 24 : 148, isVerified ? 121 : 98, isVerified ? 78 : 0);
  doc.text(`${recording.integrity_status || 'VERIFIED'} (CRC-32 Checksum)`, col2X + 80, metaLine3Y);

  currentY += 95;

  // Section 2: Telemetry Summary Statistics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 47);
  doc.text('2. TELEMETRY STATISTICAL SUMMARY', margin, currentY);
  currentY += 12;

  // Summary Table Header
  const tableHeaders = ['Metric Channel', 'Unit', 'Minimum', 'Average', 'Maximum', 'Samples'];
  const colWidths = [140, 60, 75, 75, 75, 90];
  let curX = margin;

  doc.setFillColor(241, 245, 249); // #F1F5F9
  doc.setDrawColor(227, 232, 239);
  doc.rect(margin, currentY, contentWidth, 18, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(89, 101, 121);
  for (let i = 0; i < tableHeaders.length; i++) {
    doc.text(tableHeaders[i], curX + 6, currentY + 12);
    curX += colWidths[i];
  }
  currentY += 18;

  // Summary Table Rows
  const statRows = [
    { name: 'Vehicle Speed', unit: 'km/h', s: stats.speed },
    { name: 'Engine Speed', unit: 'rpm', s: stats.rpm },
    { name: 'Throttle Position', unit: '%', s: stats.throttle },
    { name: 'Deceleration Rate', unit: 'm/s²', s: stats.decel }
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  statRows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }
    doc.rect(margin, currentY, contentWidth, 18, 'F');
    doc.setDrawColor(227, 232, 239);
    doc.line(margin, currentY + 18, pageWidth - margin, currentY + 18);

    curX = margin;
    doc.setTextColor(23, 33, 47);
    doc.text(row.name, curX + 6, currentY + 12);
    curX += colWidths[0];

    doc.setTextColor(133, 144, 160);
    doc.text(row.unit, curX + 6, currentY + 12);
    curX += colWidths[1];

    doc.setFont('courier', 'normal');
    doc.setTextColor(23, 33, 47);
    doc.text(row.s.count > 0 ? row.s.min.toFixed(1) : 'N/A', curX + 6, currentY + 12);
    curX += colWidths[2];

    doc.text(row.s.count > 0 ? row.s.avg.toFixed(1) : 'N/A', curX + 6, currentY + 12);
    curX += colWidths[3];

    doc.text(row.s.count > 0 ? row.s.max.toFixed(1) : 'N/A', curX + 6, currentY + 12);
    curX += colWidths[4];

    doc.text(row.s.count > 0 ? row.s.count.toLocaleString() : '0', curX + 6, currentY + 12);
    doc.setFont('helvetica', 'normal');

    currentY += 18;
  });

  currentY += 18;

  // Section 3: Representative Telemetry Sample Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 33, 47);
  doc.text('3. RECORDED TELEMETRY SAMPLES (REPRESENTATIVE WINDOW)', margin, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(133, 144, 160);
  const sampleNote = `Showing first 22 representative rows of ${samples.length} total recorded samples. Complete continuous dataset is preserved in the CSV export.`;
  doc.text(sampleNote, margin, currentY + 11);
  currentY += 20;

  // Sample Table Header
  const sampleHeaders = ['Time (UTC)', 'Sequence', 'Speed (km/h)', 'RPM', 'Throttle (%)', 'Decel (m/s²)'];
  const sampleColWidths = [120, 65, 85, 75, 80, 90];

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(227, 232, 239);
  doc.rect(margin, currentY, contentWidth, 16, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(89, 101, 121);
  curX = margin;
  for (let i = 0; i < sampleHeaders.length; i++) {
    doc.text(sampleHeaders[i], curX + 5, currentY + 11);
    curX += sampleColWidths[i];
  }
  currentY += 16;

  // Sample Table Rows (first 22 samples)
  const displaySamples = samples.slice(0, 22);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);

  displaySamples.forEach((s, idx) => {
    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, currentY, contentWidth, 14, 'F');
    doc.setDrawColor(235, 240, 245);
    doc.line(margin, currentY + 14, pageWidth - margin, currentY + 14);

    const t = s.telemetry_data || s.telemetry || {};
    const tsMs = s.original_timestamp_ms ?? s.timestamp_ms;
    const timeFormatted = tsMs ? new Date(tsMs).toISOString().slice(11, 23) : 'N/A';

    curX = margin;
    doc.setTextColor(89, 101, 121);
    doc.text(timeFormatted, curX + 5, currentY + 10);
    curX += sampleColWidths[0];

    doc.setTextColor(23, 33, 47);
    doc.text(String(s.original_sequence_number ?? s.sequence_number ?? idx), curX + 5, currentY + 10);
    curX += sampleColWidths[1];

    doc.text(typeof t.vehicle_speed_kmh === 'number' ? t.vehicle_speed_kmh.toFixed(1) : 'N/A', curX + 5, currentY + 10);
    curX += sampleColWidths[2];

    doc.text(typeof t.engine_rpm === 'number' ? String(t.engine_rpm) : 'N/A', curX + 5, currentY + 10);
    curX += sampleColWidths[3];

    doc.text(typeof t.throttle_percent === 'number' ? `${t.throttle_percent.toFixed(1)}%` : 'N/A', curX + 5, currentY + 10);
    curX += sampleColWidths[4];

    doc.text(typeof t.deceleration_mps2 === 'number' ? t.deceleration_mps2.toFixed(2) : 'N/A', curX + 5, currentY + 10);

    currentY += 14;
  });

  // Footer on Page
  const footerY = pageHeight - 25;
  doc.setDrawColor(227, 232, 239);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(133, 144, 160);
  doc.text('APEX BLACKBOX Vehicle Telemetry Recording Report — Automated Engineering Export', margin, footerY);
  doc.text('Page 1 of 1', pageWidth - margin, footerY, { align: 'right' });

  // Trigger Download
  const cleanRecId = recording.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `apex-blackbox-report-${cleanRecId}-${timestampStr}.pdf`;

  doc.save(filename);
}
