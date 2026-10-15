import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root, packageJson, readJson } from './common.mjs';

const pkg = await packageJson();
const version = process.env.GITHUB_REF_TYPE === 'tag'
  ? process.env.GITHUB_REF_NAME.replace(/^v/, '') : pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid release version: ${version}`);
pkg.version = version;
await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
const lock = await readJson(join(root, 'package-lock.json'));
lock.version = lock.packages[''].version = version;
await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
const cargo = join(root, 'src-tauri/Cargo.toml');
await writeFile(cargo, (await readFile(cargo, 'utf8')).replace(/^version = ".*"$/m, `version = "${version}"`));
console.log(`Desktop release version: ${version}`);
