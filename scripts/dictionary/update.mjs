import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './prepare.mjs';

const path = join(root, 'dictionary.lock.json');
const lock = JSON.parse(await readFile(path, 'utf8'));
if (process.argv.includes('--check')) {
  if (Date.now() - Date.parse(`${lock.date}T00:00:00Z`) > 30 * 86_400_000) throw new Error('Dictionary snapshot is older than 30 days; run dictionary update before publishing.');
} else {
  const response = await fetch('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`Release metadata unavailable: ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find(a => /^jmdict-eng-[\d.+]+\.json\.tgz$/.test(a.name));
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('Full English asset with SHA-256 required');
  const version = release.tag_name;
  const timestamp = version.split('+')[1];
  if (!/^\d{14}$/.test(timestamp)) throw new Error('Unknown release version');
  const date = `${timestamp.slice(0,4)}-${timestamp.slice(4,6)}-${timestamp.slice(6,8)}`;
  await writeFile(path, JSON.stringify({ ...lock, version, date, url: asset.browser_download_url, sha256: asset.digest.slice(7) }, null, 2) + '\n');
}
