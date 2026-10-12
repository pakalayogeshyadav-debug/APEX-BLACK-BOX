import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getWsUrl } from '../../config/api.ts';

describe('Cloud Deployment API & WebSocket URL Selection', () => {
  it('correctly maps HTTP endpoints to WS telemetry streams', () => {
    const wsUrl = getWsUrl('/api/v1/ws/telemetry');
    assert.ok(wsUrl.includes('/api/v1/ws/telemetry'));
    assert.ok(wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://'));
  });

  it('normalizes custom path slashes consistently', () => {
    const url1 = getWsUrl('api/v1/ws/telemetry');
    const url2 = getWsUrl('/api/v1/ws/telemetry');
    assert.strictEqual(url1, url2);
  });
});
