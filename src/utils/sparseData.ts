import { formatTelemetryTimestamp, normalizeTimestamp } from './timestamp.ts';

export interface TelemetrySamplePoint {
  index: number;
  label: string;
  timestampRaw: unknown;
  speed: number | null;
  rpm: number | null;
  deceleration: number | null;
  throttle: number | null;
}

export interface TelemetryAnalysis {
  status: 'EMPTY' | 'SPARSE' | 'CONTINUOUS';
  sampleCount: number;
  isSparse: boolean;
  timeMode: 'CALENDAR' | 'RELATIVE' | 'UNAVAILABLE';
  durationSeconds: number;
  firstTimestampStr: string;
  lastTimestampStr: string;
  points: TelemetrySamplePoint[];
  sparseNotice?: string;
}

/**
 * Analyzes telemetry samples from the backend without fabrication,
 * ensuring sample points are ordered chronologically and sparse recordings are clearly identified.
 */
export function analyzeTelemetrySamples(rawSamples: any[]): TelemetryAnalysis {
  if (!rawSamples || !Array.isArray(rawSamples) || rawSamples.length === 0) {
    return {
      status: 'EMPTY',
      sampleCount: 0,
      isSparse: false,
      timeMode: 'UNAVAILABLE',
      durationSeconds: 0,
      firstTimestampStr: 'N/A',
      lastTimestampStr: 'N/A',
      points: []
    };
  }

  // Sort chronologically by sequence number, falling back to timestamp
  const sorted = [...rawSamples].sort((a, b) => {
    if (typeof a.original_sequence_number === 'number' && typeof b.original_sequence_number === 'number') {
      return a.original_sequence_number - b.original_sequence_number;
    }
    const tA = Number(a.original_timestamp_ms ?? 0);
    const tB = Number(b.original_timestamp_ms ?? 0);
    return tA - tB;
  });

  const firstRaw = sorted[0]?.original_timestamp_ms;
  const lastRaw = sorted[sorted.length - 1]?.original_timestamp_ms;

  const firstNorm = normalizeTimestamp(firstRaw);

  const timeMode = firstNorm.kind;
  const firstTimestampStr = formatTelemetryTimestamp(firstRaw, { includeDate: timeMode === 'CALENDAR', useUtc: true });
  const lastTimestampStr = formatTelemetryTimestamp(lastRaw, { includeDate: timeMode === 'CALENDAR', useUtc: true });

  // Calculate actual duration in seconds
  let durationSeconds = 0;
  if (typeof firstRaw === 'number' && typeof lastRaw === 'number' && lastRaw >= firstRaw) {
    durationSeconds = (lastRaw - firstRaw) / 1000;
  }

  // Extract points without interpolation or fabrication
  const points: TelemetrySamplePoint[] = sorted.map((s, idx) => {
    const rawTs = s.original_timestamp_ms;
    const label = formatTelemetryTimestamp(rawTs, { includeMilliseconds: true, relativePrefix: 'T+' });
    const data = s.telemetry_data || {};

    return {
      index: idx,
      label,
      timestampRaw: rawTs,
      speed: typeof data.vehicle_speed_kmh === 'number' ? data.vehicle_speed_kmh : null,
      rpm: typeof data.engine_rpm === 'number' ? data.engine_rpm : null,
      deceleration: typeof data.deceleration_mps2 === 'number' ? data.deceleration_mps2 : null,
      throttle: typeof data.throttle_percent === 'number' ? data.throttle_percent : null
    };
  });

  const sampleCount = points.length;
  const isSparse = sampleCount > 0 && sampleCount <= 5;

  let sparseNotice: string | undefined;
  if (isSparse) {
    sparseNotice = `Sparse dataset: ${sampleCount} discrete samples recorded (${durationSeconds > 0 ? `${durationSeconds.toFixed(1)}s span` : 'single capture'}). Discrete sample points plotted directly without interpolation.`;
  }

  return {
    status: isSparse ? 'SPARSE' : 'CONTINUOUS',
    sampleCount,
    isSparse,
    timeMode,
    durationSeconds,
    firstTimestampStr,
    lastTimestampStr,
    points,
    sparseNotice
  };
}
