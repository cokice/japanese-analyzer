import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { DictionaryStore } from '../app/api/_utils/dictionaryStore';
import { validateDictionaryResult } from '../app/api/_utils/dictionaryProvider';
import type { DictionaryEntry } from '../app/lib/dictionary';
import { NextRequest } from 'next/server';
import { GET as imageRoute } from '../app/api/dictionary/assets/[id]/route';
import { AUTH_COOKIE_NAME, createAuthToken } from '../app/api/_utils/sessionAuth';

const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const source = { id: 'jmdict', name: 'JMdict fixture', version: '1', date: '2026-10-16', url: 'https://example.com/dict', license: 'CC BY-SA 4.0', licenseUrl: 'https://example.com/license' };
async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'localized-dictionary-'));
  const previousCode = process.env.CODE;
  try {
    process.env.CODE = 'localized-fixture';
    assert.equal((await imageRoute(new NextRequest('http://localhost/api/dictionary/assets/nope'), { params: Promise.resolve({ id: 'nope' }) })).status, 401);
    const authenticated = new NextRequest('http://localhost/api/dictionary/assets/nope', { headers: { cookie: `${AUTH_COOKIE_NAME}=${createAuthToken()}` } });
    assert.equal((await imageRoute(authenticated, { params: Promise.resolve({ id: 'nope' }) })).status, 404);
    const files: Record<string, string> = {}, localizedFiles: Record<string, string> = {};
    for (let i = 0; i < 256; i++) {
      const suffix = i.toString(16).padStart(2, '0');
      for (const kind of ['entries', 'index']) files[`${kind}-${suffix}.json.gz`] = 'unused';
      for (const lang of ['zh-Hans', 'zh-Hant', 'ko']) localizedFiles[`${lang}/entries-${suffix}.json.gz`] = 'unused';
    }
    const put = async (name: string, data: unknown, hashes: Record<string, string>) => {
      const bytes = gzipSync(JSON.stringify(data)); const path = join(directory, name);
      await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); hashes[name.replace(/^locales\//, '')] = digest(bytes);
    };
    const bucket = (key: string) => digest(key).slice(0, 2);
    const entry: DictionaryEntry = { id: '1', common: true, spellings: [{ text: '駅', common: true, tags: [] }], readings: [{ text: 'えき', common: true, appliesTo: ['*'], tags: [] }], senses: [{ id: '1:0', pos: ['n'], glosses: ['station'], appliesToSpellings: ['*'], appliesToReadings: ['*'], tags: [], notes: [] }], source };
    await put(`index-${bucket('駅')}.json.gz`, { '駅': ['1'] }, files);
    await put(`entries-${bucket('1')}.json.gz`, { '1': entry }, files);
    const block = { id: 'zh:1:independent', appliesTo: [{ spelling: '駅', reading: 'えき' }], content: { tag: 'p', content: '火车站' } };
    await put(`locales/zh-Hans/entries-${bucket('1')}.json.gz`, { '1': [block] }, localizedFiles);
    await put(`locales/ko/entries-${bucket('1')}.json.gz`, {}, localizedFiles);
    const archive = 'a'.repeat(64);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ formatVersion: 1, files, source, archiveSha256: archive }));
    const info = { origin: 'community-machine-translation', source, upstreamDate: source.date };
    const sources = Object.fromEntries(['zh-Hans', 'zh-Hant', 'ko'].map(language => [language, { ...info, language }]));
    const image = Buffer.from('fixture-image'), imageId = digest(image);
    await mkdir(join(directory, 'locales/assets'), { recursive: true }); await writeFile(join(directory, `locales/assets/${imageId}.png`), image);
    const manifest = { formatVersion: 1, englishArchiveSha256: archive, files: localizedFiles, sources, assets: { [`assets/${imageId}.png`]: imageId } };
    await writeFile(join(directory, 'locales/manifest.json'), JSON.stringify(manifest));

    const store = new DictionaryStore(directory, 2048);
    const english = await store.lookup({ query: '駅', locale: 'en' });
    assert.equal(english.entries[0].localizations, undefined); assert.equal(english.datasets?.length, 3);
    const localized = await store.lookup({ query: '駅', locale: 'zh-CN' });
    assert.equal(localized.entries[0].senses[0].glosses[0], 'station');
    assert.equal(localized.entries[0].localizations?.[0].blocks[0].id, block.id);
    assert.equal(localized.localizationStatus?.status, 'ready');
    const initialBytes = store.cachedBytes;
    await Promise.all(Array.from({ length: 10 }, () => store.lookup({ query: '駅', locale: 'zh-CN' })));
    assert.equal(store.cachedBytes, initialBytes, 'Concurrent and repeated localized reads share the LRU');
    assert.ok(store.cachedBytes <= 2048);
    const missing = await store.lookup({ query: '駅', locale: 'ko' });
    assert.deepEqual(missing.entries[0].localizations, []); assert.equal(missing.localizationStatus?.status, 'ready');
    const imageResult = await store.asset(imageId); assert.equal(imageResult.mime, 'image/png'); assert.deepEqual(imageResult.bytes, image);
    await assert.rejects(() => store.asset('../escape'));
    await writeFile(join(directory, `locales/assets/${imageId}.png`), 'tampered'); await assert.rejects(() => store.asset(imageId));
    await writeFile(join(directory, `locales/zh-Hans/entries-${bucket('1')}.json.gz`), 'tampered');
    const corrupt = await new DictionaryStore(directory).lookup({ query: '駅', locale: 'zh-CN' });
    assert.equal(corrupt.localizationStatus?.status, 'unavailable'); assert.equal(corrupt.entries[0].senses[0].glosses[0], 'station');
    assert.equal(corrupt.entries[0].localizations, undefined, 'Corruption is never reported as missing definitions');
    await writeFile(join(directory, 'locales/manifest.json'), JSON.stringify({ ...manifest, englishArchiveSha256: 'newer-english' }));
    assert.equal((await new DictionaryStore(directory).lookup({ query: '駅', locale: 'zh-CN' })).localizationStatus?.status, 'unavailable');
    const untrusted = validateDictionaryResult({ ...localized, entries: [{ ...localized.entries[0] }] });
    assert.equal(untrusted.entries[0].localizations, undefined); assert.equal(untrusted.datasets, undefined); assert.equal(untrusted.localizationStatus, undefined);
    console.log('Localized dictionary passed: independent senses, missing/corrupt states, shared bounded cache, images and untrusted external IDs.');
  } finally { if (previousCode === undefined) delete process.env.CODE; else process.env.CODE = previousCode; await rm(directory, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
