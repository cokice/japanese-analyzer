import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

const listener = createServer();
await new Promise(r => listener.listen(0, '127.0.0.1', r));
const port = listener.address().port;
await new Promise(r => listener.close(r));
const directory = resolve(process.argv[2] || '.next/standalone');
const child = spawn(process.execPath, ['server.js'], { cwd: directory,
  env: { ...process.env, CODE: '', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: '', NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore','pipe','pipe'] });
const exited = once(child, 'exit'); let logs = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-4000); });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/auth`, { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* starting */ }
    if (child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, `Standalone server did not start: ${logs}`);
  const measurements = [];
  for (const query of ['駅','食べる','前','ぜん','駅']) {
    const start = performance.now();
    const response = await fetch(`${base}/api/dictionary/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    const data = await response.json();
    assert.equal(response.status, 200); assert.ok(data.entries.length); assert.ok(data.source.version);
    assert.equal(data.entries[0].source.id, 'jmdict');
    measurements.push({ query, total: data.total, duration_ms: Math.round(performance.now() - start) });
  }
  console.log(JSON.stringify({ standalone: directory, measurements }));
} finally { child.kill(); await exited; }
