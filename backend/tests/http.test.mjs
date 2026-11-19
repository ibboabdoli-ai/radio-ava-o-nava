import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import worker from '../worker.js';
import { testDatabase } from './helpers.mjs';

test('local HTTP adapter starts and answers health without external network access', async () => {
  const env = { DB: testDatabase(), RADIO_FEATURES_ENABLED: 'false' };
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, configured: true, featuresEnabled: false });
    const disabled = await fetch(base + '/api/queue');
    assert.equal(disabled.status, 503);
    assert.equal((await disabled.json()).error, 'service_disabled');
  } finally { await new Promise(resolve => server.close(resolve)); env.DB.sqlite.close(); }
});
