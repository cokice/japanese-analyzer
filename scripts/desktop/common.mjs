import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
export const packageJson = () => readJson(new URL('../../package.json', import.meta.url));

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited with ${signal ?? code}`)));
  });
}

export const tauriCli = fileURLToPath(new URL('../../node_modules/@tauri-apps/cli/tauri.js', import.meta.url));
