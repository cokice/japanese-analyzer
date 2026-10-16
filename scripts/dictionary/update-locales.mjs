import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { root, digest } from './prepare.mjs';

export function checkLocalizedDates(lock, now = Date.now()) {
  for (const [name, data] of Object.entries(lock.sources)) {
    for (const [field, days] of [['date', 90], ['upstreamDate', 180]]) {
      const time = Date.parse(`${data[field]}T00:00:00Z`);
      if (!Number.isFinite(time) || now - time > days * 86400_000) throw new Error(`${name} dictionary ${field} exceeds ${days} days; update the pinned source before publishing.`);
    }
  }
}
async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`Dictionary update failed: HTTP ${response.status}`);
  return response;
}
export async function updateLocales(check = false) {
  const path = join(root, 'dictionary.locales.lock.json');
  const lock = JSON.parse(await readFile(path, 'utf8'));
  if (check) { checkLocalizedDates(lock); return; }
  const release = await (await fetchOk('https://api.github.com/repos/greyindex/jitendex-yomitan-zh/releases/latest')).json();
  const asset = release.assets.find(a => /^jitendex-yomitan-zh-full.*\.zip$/.test(a.name));
  const upstream = /^v(\d{4})\.(\d{2})\.(\d{2})-zh\./.exec(release.tag_name);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !upstream) throw new Error('Chinese release requires a full archive, digest and upstream date');
  lock.sources.zh = { ...lock.sources.zh, version: release.tag_name, date: release.published_at.slice(0, 10), upstreamDate: upstream.slice(1).join('-'), url: asset.browser_download_url, sha256: asset.digest.slice(7) };

  const html = await (await fetchOk('https://kaikki.org/kowiktionary/')).text();
  const dates = /structured data extracted on (\d{4}-\d{2}-\d{2}) from the kowiktionary dump dated (\d{4}-\d{2}-\d{2})/.exec(html);
  if (!dates) throw new Error('Korean extraction/dump dates unavailable; do not substitute the download date');
  const raw = Buffer.from(await (await fetchOk(lock.sources.ko.url)).arrayBuffer());
  const rows = gunzipSync(raw, { maxOutputLength: 512 * 1024 * 1024 }).toString().trim().split('\n').map(line => JSON.parse(line)).filter(row => row.lang_code === 'ja');
  if (rows.length < 10_000) throw new Error('Unexpected Korean Japanese-entry coverage drop; review before updating');
  const snapshot = gzipSync(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  lock.sources.ko = { ...lock.sources.ko, version: `kaikki-ko-${dates[1].replaceAll('-', '')}`, date: dates[1], upstreamDate: dates[2], rawSha256: digest(raw), sha256: digest(snapshot) };
  checkLocalizedDates(lock);
  // Kaikki's raw URL is mutable. Commit only its small Japanese-language slice
  // so old application commits remain reproducible after upstream rotates it.
  await writeFile(join(root, lock.sources.ko.snapshot), snapshot);
  await writeFile(path, JSON.stringify(lock, null, 2) + '\n');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await updateLocales(process.argv.includes('--check'));
