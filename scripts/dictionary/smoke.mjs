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
  for (const [locale, expected] of [['zh-CN', '火车站'], ['zh-TW', '火車站'], ['ko', '역']]) {
    const start = performance.now();
    const response = await fetch(`${base}/api/dictionary/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Locale': locale }, body: JSON.stringify({ query: '駅' }) });
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.localizationStatus.status, 'ready');
    assert.match(JSON.stringify(data.entries[0].localizations), new RegExp(expected));
    assert.ok(data.entries[0].senses.length, 'English original remains available');
    measurements.push({ locale, duration_ms: Math.round(performance.now() - start), bytes: JSON.stringify(data).length });
  }
  const complex = await (await fetch(`${base}/api/dictionary/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Locale': 'zh-CN' }, body: JSON.stringify({ query: 'に' }) })).json();
  assert.equal(complex.localizationStatus.status, 'ready');
  // Probe both rasterized glyphs and original illustrations from the manifest.
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(resolve(directory, 'data/dictionary/locales/manifest.json'), 'utf8'));
  for (const extension of ['png', 'avif']) {
    const path = Object.keys(manifest.assets).find(name => name.endsWith(`.${extension}`)); assert.ok(path);
    const id = manifest.assets[path]; const response = await fetch(`${base}/api/dictionary/assets/${id}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), `image/${extension}`);
    const { createHash } = await import('node:crypto');
    assert.equal(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex'), id);
  }
  console.log(JSON.stringify({ standalone: directory, measurements }));
} finally { child.kill(); await exited; }
