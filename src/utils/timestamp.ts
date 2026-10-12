/**
 * APEX BLACKBOX - Timestamp Normalization & Formatting Utility
 *
 * Handles automotive telemetry timestamp representations:
 * - ISO-8601 absolute strings
 * - Unix epoch milliseconds (values >= Jan 1 2000)
 * - Unix epoch seconds (values >= Jan 1 2000)
 * - Hardware uptime / relative elapsed milliseconds (e.g. ESP32 millis() < Year 2000)
 * - Graceful handling of empty, invalid, and epoch 0 values (prevents 1969/1970 bug)
 */

const MIN_EPOCH_MS = 946684800000; // 2000-01-01T00:00:00.000Z in ms
const MIN_EPOCH_SEC = 946684800;   // 2000-01-01T00:00:00Z in seconds
const MAX_EPOCH_SEC = 2500000000;  // Year 2049 in seconds

export type TimestampKind = 'CALENDAR' | 'RELATIVE' | 'UNAVAILABLE';

export interface NormalizedTimestamp {
  kind: TimestampKind;
  date: Date | null;
  elapsedMs: number | null;
  raw: unknown;
}

/**
 * Normalizes any timestamp representation into a verified calendar Date or relative elapsed time.
 */
export function normalizeTimestamp(value: unknown): NormalizedTimestamp {
  if (value === null || value === undefined || value === '' || value === 'N/A') {
    return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
  }

  // Handle JavaScript Date objects
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
    }
    const ms = value.getTime();
    if (ms < MIN_EPOCH_MS) {
      // Date represents near-epoch 0 (e.g. 1969 or 1970), which is device uptime
      return { kind: 'RELATIVE', date: null, elapsedMs: Math.max(0, ms), raw: value };
    }
    return { kind: 'CALENDAR', date: value, elapsedMs: null, raw: value };
  }

  // Handle numeric timestamps
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value) || value < 0) {
      return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
    }

    // Unix epoch milliseconds (>= year 2000)
    if (value >= MIN_EPOCH_MS) {
      const d = new Date(value);
      return { kind: 'CALENDAR', date: d, elapsedMs: null, raw: value };
    }

    // Unix epoch seconds (>= year 2000)
    if (value >= MIN_EPOCH_SEC && value <= MAX_EPOCH_SEC) {
      const d = new Date(value * 1000);
      return { kind: 'CALENDAR', date: d, elapsedMs: null, raw: value };
    }

    // Otherwise, this is relative elapsed time or device uptime in milliseconds (e.g. 1000000ms = 1000s)
    return { kind: 'RELATIVE', date: null, elapsedMs: Math.round(value), raw: value };
  }

  // Handle string timestamps
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'N/A' || trimmed.toLowerCase() === 'invalid date') {
      return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
    }

    // Numeric string check
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      return normalizeTimestamp(num);
    }

    // ISO-8601 or date string parsing
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
    }

    const ms = parsed.getTime();
    // Detect 1969/1970 artifacts from epoch 0
    if (ms < MIN_EPOCH_MS) {
      return { kind: 'RELATIVE', date: null, elapsedMs: Math.max(0, ms), raw: value };
    }

    return { kind: 'CALENDAR', date: parsed, elapsedMs: null, raw: value };
  }

  return { kind: 'UNAVAILABLE', date: null, elapsedMs: null, raw: value };
}

/**
 * Format relative elapsed milliseconds as human-readable time (e.g. +16:40.0 or 16m 40s)
 */
export function formatElapsedMs(ms: number, compact: boolean = false): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const fraction = Math.floor((totalSeconds % 1) * 10);

  if (compact) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `+${mm}:${ss}.${fraction}`;
  }

  if (minutes === 0) {
    return `${seconds}.${fraction}s`;
  }
  return `${minutes}m ${seconds}s`;
}

/**
 * User-facing timestamp formatting that strictly avoids displaying 1969 or 1970.
 */
export function formatTelemetryTimestamp(
  value: unknown,
  options: {
    includeDate?: boolean;
    includeMilliseconds?: boolean;
    relativePrefix?: string;
    useUtc?: boolean;
  } = {}
): string {
  const normalized = normalizeTimestamp(value);

  if (normalized.kind === 'UNAVAILABLE') {
    return 'N/A';
  }

  if (normalized.kind === 'RELATIVE' && normalized.elapsedMs !== null) {
    const prefix = options.relativePrefix ?? 'T+';
    const totalSeconds = normalized.elapsedMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    if (options.includeMilliseconds) {
      const ms = String(normalized.elapsedMs % 1000).padStart(3, '0');
      return `${prefix}${mm}:${ss}.${ms}`;
    }
    return `${prefix}${mm}:${ss}`;
  }

  if (normalized.kind === 'CALENDAR' && normalized.date !== null) {
    const d = normalized.date;
    const pad = (n: number) => String(n).padStart(2, '0');

    const hh = pad(options.useUtc ? d.getUTCHours() : d.getHours());
    const mm = pad(options.useUtc ? d.getUTCMinutes() : d.getMinutes());
    const ss = pad(options.useUtc ? d.getUTCSeconds() : d.getSeconds());
    const ms = String(options.useUtc ? d.getUTCMilliseconds() : d.getMilliseconds()).padStart(3, '0');
    const timeStr = options.includeMilliseconds ? `${hh}:${mm}:${ss}.${ms}` : `${hh}:${mm}:${ss}`;

    if (options.includeDate) {
      const yyyy = options.useUtc ? d.getUTCFullYear() : d.getFullYear();
      const month = pad((options.useUtc ? d.getUTCMonth() : d.getMonth()) + 1);
      const day = pad(options.useUtc ? d.getUTCDate() : d.getDate());
      return `${yyyy}-${month}-${day} ${timeStr}${options.useUtc ? ' UTC' : ''}`;
    }

    return timeStr;
  }

  return 'N/A';
}

/**
 * Format relative recording offsets such as T - 05:00 or T - 00:00
 */
export function formatTimelineOffset(offsetSec: number): string {
  const sign = offsetSec <= 0 ? '-' : '+';
  const abs = Math.abs(offsetSec);
  const minutes = Math.floor(abs / 60);
  const seconds = Math.floor(abs % 60);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `T ${sign} ${mm}:${ss}`;
}
