import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeTimestamp,
  formatTelemetryTimestamp,
  formatTimelineOffset,
  formatElapsedMs
} from '../timestamp.ts';

describe('Timestamp Normalization & Formatting', () => {
  it('correctly handles valid ISO-8601 calendar timestamps', () => {
    const iso = '2026-10-09T18:30:00.000Z';
    const norm = normalizeTimestamp(iso);
    assert.strictEqual(norm.kind, 'CALENDAR');
    assert.ok(norm.date instanceof Date);
    assert.strictEqual(norm.date.getFullYear(), 2026);

    const formatted = formatTelemetryTimestamp(iso, { includeDate: true, useUtc: true });
    assert.ok(formatted.startsWith('2026-10-09 18:30:00'));
  });

  it('correctly handles Unix epoch milliseconds (values >= Jan 1 2000)', () => {
    const epochMs = 1791568200000; // year 2026
    const norm = normalizeTimestamp(epochMs);
    assert.strictEqual(norm.kind, 'CALENDAR');
    assert.ok(norm.date instanceof Date);
    assert.strictEqual(norm.date.getFullYear(), 2026);
  });

  it('correctly handles Unix epoch seconds', () => {
    const epochSec = 1791568200; // year 2026 in seconds
    const norm = normalizeTimestamp(epochSec);
    assert.strictEqual(norm.kind, 'CALENDAR');
    assert.ok(norm.date instanceof Date);
    assert.strictEqual(norm.date.getFullYear(), 2026);
  });

  it('identifies hardware uptime / relative elapsed ms (ESP32 millis) without showing 1969 or 1970', () => {
    // 1,000,000 ms is 1000 seconds = 16m 40s uptime from boot
    const uptimeMs = 1000000;
    const norm = normalizeTimestamp(uptimeMs);
    assert.strictEqual(norm.kind, 'RELATIVE');
    assert.strictEqual(norm.elapsedMs, 1000000);

    const formatted = formatTelemetryTimestamp(uptimeMs);
    assert.strictEqual(formatted, 'T+16:40');

    // Never output 1969 or 1970
    assert.ok(!formatted.includes('1969'));
    assert.ok(!formatted.includes('1970'));
  });

  it('prevents 1969/1970 date artifacts when ISO strings from epoch-zero are provided', () => {
    const epochZeroIso = '1970-01-01T00:16:40.000Z';
    const norm = normalizeTimestamp(epochZeroIso);
    assert.strictEqual(norm.kind, 'RELATIVE');

    const formatted = formatTelemetryTimestamp(epochZeroIso);
    assert.strictEqual(formatted, 'T+16:40');
    assert.ok(!formatted.includes('1969'));
    assert.ok(!formatted.includes('1970'));
  });

  it('correctly handles null, undefined, empty, and invalid timestamps', () => {
    assert.strictEqual(normalizeTimestamp(null).kind, 'UNAVAILABLE');
    assert.strictEqual(normalizeTimestamp(undefined).kind, 'UNAVAILABLE');
    assert.strictEqual(normalizeTimestamp('').kind, 'UNAVAILABLE');
    assert.strictEqual(normalizeTimestamp('Invalid Date').kind, 'UNAVAILABLE');

    assert.strictEqual(formatTelemetryTimestamp(null), 'N/A');
    assert.strictEqual(formatTelemetryTimestamp(undefined), 'N/A');
    assert.strictEqual(formatTelemetryTimestamp(''), 'N/A');
    assert.strictEqual(formatTelemetryTimestamp('not-a-date'), 'N/A');
  });

  it('correctly formats relative timeline offsets and elapsed durations', () => {
    assert.strictEqual(formatTimelineOffset(-300), 'T - 05:00');
    assert.strictEqual(formatTimelineOffset(0), 'T - 00:00');
    assert.strictEqual(formatTimelineOffset(30), 'T + 00:30');

    assert.strictEqual(formatElapsedMs(1000000), '16m 40s');
    assert.strictEqual(formatElapsedMs(1000000, true), '+16:40.0');
  });
});
