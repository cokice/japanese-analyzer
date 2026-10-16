import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { root } from './common.mjs';

const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const directory = join(root, 'src-tauri/resources/server');
const child = spawn(join(directory, process.platform === 'win32' ? 'node.exe' : 'node'), ['server.js'], {
  cwd: directory,
  env: { ...process.env, NODE_OPTIONS: '', HOSTNAME: '127.0.0.1', PORT: String(port), NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', CODE: 'desktop-smoke-password' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let logs = '';
for (const pipe of [child.stdout, child.stderr]) pipe.on('data', (chunk) => { logs = (logs + chunk).slice(-16_384); });
process.once('SIGINT', () => child.kill());
process.once('SIGTERM', () => child.kill());
const base = `http://127.0.0.1:${port}`;
try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${base}/api/auth`, { signal: AbortSignal.timeout(1000) });
      ready = response.ok;
      if (ready) break;
    } catch { /* Starting. */ }
    await setTimeout(250);
  }
  assert.ok(ready, `Bundled Node/server did not become healthy.\n${logs}`);
  const auth = await fetch(`${base}/api/auth`).then((response) => response.json());
  assert.equal(auth.requiresAuth, true);
  assert.equal(auth.authenticated, false);
  const login = await fetch(`${base}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'desktop-smoke-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.ok(cookie?.toLowerCase().includes('httponly'));
  assert.ok(cookie?.toLowerCase().includes('samesite=lax'));
  assert.ok(!cookie?.toLowerCase().includes('; secure'));
  const authenticated = await fetch(`${base}/api/auth`, { headers: { Cookie: cookie.split(';')[0] } }).then((response) => response.json());
  assert.equal(authenticated.authenticated, true);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy')?.includes("media-src 'self' blob: data:"));
  const html = await page.text();
  const asset = html.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+)"/)?.[1];
  assert.ok(asset, 'Next page must reference a bundled static asset.');
  assert.equal((await fetch(new URL(asset.replaceAll('&amp;', '&'), base))).status, 200);
  assert.equal((await fetch(`${base}/logo/logo.png`)).status, 200);
  for (const query of ['駅', '食べる']) {
    const dictionary = await fetch(`${base}/api/dictionary/lookup`, { method: 'POST', headers: { Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    assert.equal(dictionary.status, 200);
    const result = await dictionary.json();
    assert.ok(result.entries.length > 0);
    assert.equal(result.source.id, 'jmdict');
  }
  console.log('Bundled server smoke passed: health, auth cookie, page, static files, public logo.');
} finally {
  child.kill();
  await exited;
}
await assert.rejects(fetch(`${base}/api/auth`, { signal: AbortSignal.timeout(1000) }));
console.log('Bundled Node exited and released its port.');
