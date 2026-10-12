import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeTelemetrySamples } from '../sparseData.ts';

describe('Sparse Data Analysis & Handling', () => {
  it('identifies 2 samples as sparse data and preserves exact points without fabrication', () => {
    // Exact scenario from the inspected database: 2 samples in reverse order
    const raw = [
      {
        original_timestamp_ms: 1001000,
        original_sequence_number: 2,
        telemetry_data: { vehicle_speed_kmh: 70.0, engine_rpm: 1500 }
      },
      {
        original_timestamp_ms: 1000000,
        original_sequence_number: 1,
        telemetry_data: { vehicle_speed_kmh: 100.0, engine_rpm: 2000 }
      }
    ];

    const analysis = analyzeTelemetrySamples(raw);

    assert.strictEqual(analysis.status, 'SPARSE');
    assert.strictEqual(analysis.isSparse, true);
    assert.strictEqual(analysis.sampleCount, 2);
    assert.strictEqual(analysis.points.length, 2);

    // Verify chronological ordering by sequence number
    assert.strictEqual(analysis.points[0].speed, 100.0);
    assert.strictEqual(analysis.points[0].rpm, 2000);
    assert.strictEqual(analysis.points[1].speed, 70.0);
    assert.strictEqual(analysis.points[1].rpm, 1500);

    // Verify no fabricated intermediate points were added
    assert.strictEqual(analysis.points.length, 2);

    // Verify relative uptime timestamps
    assert.strictEqual(analysis.timeMode, 'RELATIVE');
    assert.strictEqual(analysis.points[0].label, 'T+16:40.000');
    assert.strictEqual(analysis.points[1].label, 'T+16:41.000');
    assert.ok(analysis.sparseNotice?.includes('2 discrete samples'));
  });

  it('identifies continuous streams with >5 samples without marking them sparse', () => {
    const raw = Array.from({ length: 50 }, (_, i) => ({
      original_timestamp_ms: 1791568200000 + i * 100,
      original_sequence_number: i,
      telemetry_data: { vehicle_speed_kmh: 50 + i * 0.5, engine_rpm: 3000 + i * 10 }
    }));

    const analysis = analyzeTelemetrySamples(raw);

    assert.strictEqual(analysis.status, 'CONTINUOUS');
    assert.strictEqual(analysis.isSparse, false);
    assert.strictEqual(analysis.sampleCount, 50);
    assert.strictEqual(analysis.points.length, 50);
    assert.strictEqual(analysis.timeMode, 'CALENDAR');
    assert.strictEqual(analysis.sparseNotice, undefined);
  });

  it('handles empty arrays gracefully without crashing', () => {
    const analysis = analyzeTelemetrySamples([]);
    assert.strictEqual(analysis.status, 'EMPTY');
    assert.strictEqual(analysis.sampleCount, 0);
    assert.strictEqual(analysis.points.length, 0);
  });
});
