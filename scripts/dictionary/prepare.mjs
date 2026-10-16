import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bucket, normalizeKey, convertWord } from './format.mjs';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const digest = data => createHash('sha256').update(data).digest('hex');
// Read the archive as data; never extract paths supplied by an archive to disk.
export function readArchive(buffer) {
  const tar = gunzipSync(buffer);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
    if (name.endsWith('.json') && header[156] !== 53) return JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString());
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('Dictionary archive contains no JSON data');
}
export async function prepare() {
  const lock = JSON.parse(await readFile(join(root, 'dictionary.lock.json'), 'utf8'));
  const target = join(root, 'data/dictionary');
  try {
    const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
    if (manifest.archiveSha256 === lock.sha256 && manifest.formatVersion === lock.formatVersion && Object.keys(manifest.files).length === 512) {
      for (const [name, hash] of Object.entries(manifest.files)) {
        if (digest(await readFile(join(target, name))) !== hash) throw new Error('Corrupt dictionary shard');
      }
      console.log(`Dictionary verified: ${manifest.entries} entries (${manifest.date})`);
      return;
    }
  } catch { /* Missing/corrupt/old generated output is rebuilt from the verified archive. */ }
  const cache = join(root, '.dictionary-cache');
  await mkdir(cache, { recursive: true });
  const archive = join(cache, `${lock.sha256}.tgz`);
  let buffer = await readFile(archive).catch(() => null);
  if (!buffer || digest(buffer) !== lock.sha256) {
    const response = await fetch(lock.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Dictionary download failed: HTTP ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
    if (digest(buffer) !== lock.sha256) throw new Error('Dictionary SHA-256 mismatch');
    await writeFile(archive, buffer);
  }
  const source = readArchive(buffer);
  if (!Array.isArray(source.words) || source.words.length < 200_000) throw new Error('Expected the full English JMdict');
  const indices = Array.from({ length: 256 }, () => Object.create(null));
  const entries = Array.from({ length: 256 }, () => Object.create(null));
  for (const raw of source.words) {
    const entry = convertWord(raw);
    entries[parseInt(bucket(entry.id), 16)][entry.id] = entry;
    for (const key of new Set([...entry.spellings, ...entry.readings].map(k => normalizeKey(k.text)))) {
      (indices[parseInt(bucket(key), 16)][key] ??= []).push(entry.id);
    }
  }
  const stage = join(cache, `generated-${process.pid}`);
  await mkdir(stage, { recursive: true });
  const files = {};
  for (let i = 0; i < 256; i++) {
    for (const [kind, data] of [['index', indices[i]], ['entries', entries[i]]]) {
      const name = `${kind}-${i.toString(16).padStart(2, '0')}.json.gz`;
      const compressed = gzipSync(JSON.stringify(data));
      await writeFile(join(stage, name), compressed); files[name] = digest(compressed);
    }
  }
  const manifest = {
    formatVersion: lock.formatVersion, version: lock.version, date: lock.date, archiveSha256: lock.sha256,
    entries: source.words.length, tags: source.tags, files,
    source: { id: 'jmdict', name: 'JMdict / jmdict-simplified', version: lock.version, date: lock.date,
      url: 'https://www.edrdg.org/jmdict/j_jmdict.html', license: 'CC BY-SA 4.0', licenseUrl: 'https://www.edrdg.org/edrdg/licence.html' },
  };
  await mkdir(target, { recursive: true });
  // Commit manifest last so readers never accept a partial new generation.
  for (const name of await readdir(stage)) await rename(join(stage, name), join(target, name));
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Dictionary prepared: ${manifest.entries} entries, ${Object.keys(files).length} shards`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await prepare();
