import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { root, tauriCli } from './common.mjs';

const listener = createServer();
await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
// Resources aren't needed in development, but the Tauri resource glob needs a directory.
await mkdir(join(root, 'src-tauri/resources/server'), { recursive: true });
await rm(join(root, '.next/desktop-build.json'), { force: true });
const children = new Set();
let stopping = false;
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  });
  children.add(child);
  child.once('error', (error) => { console.error(error); stop(1); });
  child.once('exit', (code) => { children.delete(child); stop(code ?? 1); });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      if (process.platform !== 'win32') {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
      }
    }
  }, 5000);
  timer.unref();
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
start([join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '-p', String(port)], {
  NEXT_TELEMETRY_DISABLED: '1',
});
// Keep the packaged startup screen in dev too; Rust waits for the Next dev server.
start([tauriCli, 'dev', ...process.argv.slice(2)], { DESKTOP_DEV_PORT: String(port) });
