import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { root, digest } from './prepare.mjs';
import { bucket, normalizeKey } from './format.mjs';
import { chineseBlock, traditionalContent, koreanBlock } from './localized-format.mjs';

const licenseUrl = 'https://creativecommons.org/licenses/by-sa/4.0/';
export function localizedSources(lock) {
  const source = (id, name, data, url) => ({ id, name, version: data.version, date: data.date, url, license: 'CC BY-SA 4.0', licenseUrl });
  return {
    'zh-Hans': { language: 'zh-Hans', origin: 'community-machine-translation', upstreamDate: lock.sources.zh.upstreamDate,
      source: source('jitendex-zh', 'Jitendex 中文社区版', lock.sources.zh, 'https://github.com/greyindex/jitendex-yomitan-zh') },
    'zh-Hant': { language: 'zh-Hant', origin: 'community-machine-translation', conversion: 'OpenCC cn→tw', upstreamDate: lock.sources.zh.upstreamDate,
      source: source('jitendex-zh', 'Jitendex 中文社区版', lock.sources.zh, 'https://github.com/greyindex/jitendex-yomitan-zh') },
    ko: { language: 'ko', origin: 'dictionary-original', upstreamDate: lock.sources.ko.upstreamDate,
      source: source('kowiktionary', '한국어 위키낱말사전 / Kaikki', lock.sources.ko, 'https://kaikki.org/kowiktionary/') },
  };
}
export function readZip(buffer) {
  let total = 0, count = 0;
  return unzipSync(buffer, { filter: file => {
    if (++count > 2000 || file.name.includes('\\') || file.name.startsWith('/') || file.name.split('/').includes('..') || file.originalSize > 8 * 1024 * 1024 || (total += file.originalSize) > 600 * 1024 * 1024) throw new Error('Unsafe dictionary ZIP');
    return /^term_bank_\d+\.json$/.test(file.name) || /^jitendex\/graphics\/[a-f0-9]+\.avif$/.test(file.name) || /^jitendex\/HanaMinA\/[a-f0-9]+\.svg$/.test(file.name) || file.name === 'index.json';
  } });
}
export async function prepareLocales() {
  const started = performance.now();
  const lock = JSON.parse(await readFile(join(root, 'dictionary.locales.lock.json'), 'utf8'));
  const english = JSON.parse(await readFile(join(root, 'data/dictionary/manifest.json'), 'utf8'));
  const target = join(root, 'data/dictionary/locales');
  const signature = digest(JSON.stringify([lock, english.archiveSha256]));
  try {
    const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
    if (manifest.signature === signature && Object.keys(manifest.files).length === 768) {
      for (const [name, hash] of Object.entries({ ...manifest.files, ...manifest.assets })) if (digest(await readFile(join(target, name))) !== hash) throw new Error('Corrupt localized shard');
      console.log('Localized dictionaries verified'); return;
    }
  } catch { /* Regenerate all derived files from pinned sources. */ }
  const cache = join(root, '.dictionary-cache'); await mkdir(cache, { recursive: true });
  const archive = join(cache, `${lock.sources.zh.sha256}.zip`);
  let buffer = await readFile(archive).catch(() => null);
  if (!buffer || digest(buffer) !== lock.sources.zh.sha256) {
    const response = await fetch(lock.sources.zh.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Chinese dictionary download failed: ${response.status}`);
    buffer = Buffer.from(await response.arrayBuffer());
    if (digest(buffer) !== lock.sources.zh.sha256) throw new Error('Chinese dictionary SHA-256 mismatch');
    await writeFile(archive, buffer);
  }
  const korean = await readFile(join(root, lock.sources.ko.snapshot));
  if (digest(korean) !== lock.sources.ko.sha256) throw new Error('Korean dictionary SHA-256 mismatch');
  const entries = new Map(), heads = new Map();
  for (let i = 0; i < 256; i++) {
    const data = JSON.parse(gunzipSync(await readFile(join(root, 'data/dictionary', `entries-${i.toString(16).padStart(2, '0')}.json.gz`))));
    for (const entry of Object.values(data)) {
      entries.set(entry.id, entry);
      for (const key of new Set([...entry.spellings, ...entry.readings].map(s => normalizeKey(s.text)))) (heads.get(key) ?? (heads.set(key, []), heads.get(key))).push(entry);
    }
  }
  const zip = readZip(buffer);
  const info = JSON.parse(Buffer.from(zip['index.json']).toString());
  if (info.format !== 3 || !info.sequenced || info.targetLanguage !== 'zh') throw new Error('Unexpected Chinese dictionary format');
  const stage = join(cache, `locales-${process.pid}`); await mkdir(join(stage, 'assets'), { recursive: true });
  const assetPaths = new Map(), assets = {};
  for (const [name, raw] of Object.entries(zip)) if (name.endsWith('.avif') || name.endsWith('.svg')) {
    let bytes = raw, extension = 'avif';
    if (name.endsWith('.svg')) {
      const svg = Buffer.from(raw).toString().replace(/\sstyle="font-size:100px;font-family:HanaMinA;text-anchor:middle"/g, '');
      // Only static path glyphs are accepted; SVG never reaches the browser.
      if (/<(?!\/?(?:svg|path|defs)\b|\?xml\b)[a-z!]|\b(?:href|on\w+|style)\s*=|url\s*\(/i.test(svg)) throw new Error('Unsafe glyph SVG');
      bytes = await sharp(Buffer.from(svg)).resize(160, 160).png().toBuffer(); extension = 'png';
    } else if (Buffer.from(raw.subarray(4, 32)).indexOf('ftypavif') === -1) throw new Error('Unsupported dictionary asset');
    const id = digest(bytes), file = `assets/${id}.${extension}`; assets[file] = id; assetPaths.set(name, id);
    await writeFile(join(stage, file), bytes); delete zip[name];
  }
  const zh = new Map();
  const report = { englishVersion: english.version, chineseRows: 0, nonpositiveIds: 0, incompatibleRows: 0, matchedChineseEntries: 0, koreanRows: 0, koreanMatchedEntries: 0, koreanAmbiguousOrMissing: 0, assets: Object.keys(assets).length, maxEntryBytes: 0, maxShardBytes: 0, compressedBytes: 0, converterVersion: lock.converterVersion, unknownNodes: 0 };
  for (const name of Object.keys(zip).filter(n => /^term_bank_\d+\.json$/.test(n)).sort()) {
    const rows = JSON.parse(Buffer.from(zip[name]).toString()); delete zip[name];
    for (const row of rows) {
      report.chineseRows++;
      if (!Number.isSafeInteger(row[6]) || row[6] <= 0) { report.nonpositiveIds++; continue; }
      const id = String(row[6]); const block = chineseBlock(row, entries.get(id), assetPaths);
      if (!block) { report.incompatibleRows++; continue; }
      const blocks = zh.get(id) ?? new Map(); zh.set(id, blocks);
      const existing = blocks.get(block.id);
      if (existing) { if (!existing.appliesTo.some(p => p.spelling === block.appliesTo[0].spelling && p.reading === block.appliesTo[0].reading)) existing.appliesTo.push(...block.appliesTo); }
      else blocks.set(block.id, block);
    }
  }
  report.matchedChineseEntries = zh.size;
  const ko = new Map();
  for (const line of gunzipSync(korean).toString().trim().split('\n')) {
    const row = JSON.parse(line); report.koreanRows++;
    const block = koreanBlock(row); if (!block) continue;
    // A spelling shared by several JMdict IDs cannot safely be disambiguated
    // from Korean gloss text. Keep those records in the source, not guessed UI.
    let candidates = heads.get(normalizeKey(row.word)) ?? [];
    const reading = (row.sounds ?? []).map(s => s.other).find(s => typeof s === 'string' && /^[\u3041-\u3096ー]+$/.test(s));
    if (reading) candidates = candidates.filter(e => e.readings.some(r => normalizeKey(r.text) === normalizeKey(reading)));
    if (candidates.length !== 1) { report.koreanAmbiguousOrMissing++; continue; }
    if (reading) block.appliesTo[0].reading = reading;
    const id = candidates[0].id; const blocks = ko.get(id) ?? new Map(); ko.set(id, blocks); blocks.set(block.id, block);
  }
  report.koreanMatchedEntries = ko.size;
  const files = {}, sources = localizedSources(lock);
  for (const language of ['zh-Hans', 'zh-Hant', 'ko']) {
    await mkdir(join(stage, language), { recursive: true });
    const buckets = Array.from({ length: 256 }, () => Object.create(null));
    for (const [id, blocks] of language === 'ko' ? ko : zh) {
      const data = [...blocks.values()].map(b => language === 'zh-Hant' ? { ...b, content: traditionalContent(b.content) } : b);
      report.maxEntryBytes = Math.max(report.maxEntryBytes, Buffer.byteLength(JSON.stringify(data)));
      buckets[parseInt(bucket(id), 16)][id] = data;
    }
    for (let i = 0; i < 256; i++) {
      const raw = JSON.stringify(buckets[i]); report.maxShardBytes = Math.max(report.maxShardBytes, Buffer.byteLength(raw));
      const bytes = gzipSync(raw); report.compressedBytes += bytes.length;
      const name = `${language}/entries-${i.toString(16).padStart(2, '0')}.json.gz`;
      files[name] = digest(bytes); await writeFile(join(stage, name), bytes);
    }
  }
  // Complete payloads are kept; fail explicitly instead of silently truncating.
  if (report.maxEntryBytes > 512 * 1024 || report.maxShardBytes > 16 * 1024 * 1024) throw new Error('Localized dictionary requires a paginated detail format');
  const manifest = { formatVersion: 1, signature, englishArchiveSha256: english.archiveSha256, sources, files, assets, report };
  await writeFile(join(stage, 'report.json'), JSON.stringify(report, null, 2));
  for (const sub of ['zh-Hans', 'zh-Hant', 'ko', 'assets']) {
    await mkdir(join(target, sub), { recursive: true });
    for (const name of await readdir(join(stage, sub))) await rename(join(stage, sub, name), join(target, sub, name));
  }
  await rename(join(stage, 'report.json'), join(target, 'report.json'));
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Localized dictionaries prepared in ${Math.round(performance.now() - started)}ms: ${JSON.stringify(report)}`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await prepareLocales();
