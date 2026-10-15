import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, packageJson } from './common.mjs';

const pkg = await packageJson();
await writeFile(join(root, '.next/desktop-build.json'), JSON.stringify({
  appVersion: pkg.version,
  nodeVersion: process.versions.node,
  platform: process.platform,
  arch: process.arch,
}, null, 2) + '\n');
