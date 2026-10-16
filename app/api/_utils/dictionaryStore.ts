import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { dictionaryLanguage, normalizeDictionaryKey, type DictionaryEntry, type DictionaryQuery, type DictionaryResult, type DictionarySource, type DictionaryLanguage, type DictionaryLocalizationInfo, type LocalizedBlock } from '../../lib/dictionary';

interface Manifest { formatVersion: number; version: string; date: string; archiveSha256?: string; entries: number; files: Record<string, string>; source: DictionarySource; tags: Record<string, string>; }
interface LocalizedManifest { formatVersion: number; englishArchiveSha256: string; files: Record<string, string>; assets: Record<string, string>; sources: Record<DictionaryLanguage, DictionaryLocalizationInfo>; }
export class DictionaryUnavailableError extends Error { constructor() { super('词典数据不可用，请重新准备词典数据'); } }
export class DictionaryStore {
  private cache = new Map<string, { data: Record<string, unknown>; bytes: number }>();
  private bytes = 0;
  private pending = new Map<string, Promise<Record<string, unknown>>>();
  private manifest?: Promise<Manifest>;
  private localizedManifest?: Promise<LocalizedManifest>;
  constructor(private directory = join(process.cwd(), 'data/dictionary'), private maxBytes = 32 * 1024 * 1024) {}
  async metadata() {
    return this.manifest ??= readFile(join(this.directory, 'manifest.json'), 'utf8').then(text => {
      const m = JSON.parse(text) as Manifest;
      if (m.formatVersion !== 1 || !m.source || Object.keys(m.files).length !== 512) throw new Error();
      return m;
    }).catch(() => { this.manifest = undefined; throw new DictionaryUnavailableError(); });
  }
  async localizedMetadata() {
    return this.localizedManifest ??= readFile(join(this.directory, 'locales/manifest.json'), 'utf8').then(async text => {
      const m = JSON.parse(text) as LocalizedManifest;
      if (m.formatVersion !== 1 || Object.keys(m.files).length !== 768 || m.englishArchiveSha256 !== (await this.metadata()).archiveSha256 || !m.sources?.['zh-Hans'] || !m.sources?.['zh-Hant'] || !m.sources?.ko) throw new Error();
      return m;
    }).catch(() => { this.localizedManifest = undefined; throw new DictionaryUnavailableError(); });
  }
  private async shard(kind: string, key: string): Promise<Record<string, unknown>> {
    const name = `${kind}-${createHash('sha256').update(key).digest('hex').slice(0, 2)}.json.gz`;
    const files = (await this.metadata()).files;
    return this.loadShard(name, files[name]);
  }
  private async loadShard(name: string, hash: string): Promise<Record<string, unknown>> {
    const key = `${name}:${hash}`;
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached.data; }
    const existing = this.pending.get(key);
    if (existing) return existing;
    const loading = this.readShard(name, hash, key);
    this.pending.set(key, loading);
    try { return await loading; } finally { this.pending.delete(key); }
  }
  private async readShard(name: string, hash: string, key: string): Promise<Record<string, unknown>> {
    try {
      const buffer = await readFile(join(this.directory, name));
      if (!hash || createHash('sha256').update(buffer).digest('hex') !== hash) throw new Error();
      const raw = gunzipSync(buffer, { maxOutputLength: 16 * 1024 * 1024 }); const data = JSON.parse(raw.toString());
      if (raw.length <= this.maxBytes) {
        while (this.bytes + raw.length > this.maxBytes && this.cache.size) {
          const oldest = this.cache.keys().next().value!;
          this.bytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
        }
        this.cache.set(key, { data, bytes: raw.length }); this.bytes += raw.length;
      }
      return data;
    } catch { throw new DictionaryUnavailableError(); }
  }
  async asset(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new DictionaryUnavailableError();
    const manifest = await this.localizedMetadata();
    const name = [`assets/${id}.avif`, `assets/${id}.png`].find(n => manifest.assets[n] === id);
    if (!name) throw new DictionaryUnavailableError();
    const bytes = await readFile(join(this.directory, 'locales', name));
    if (createHash('sha256').update(bytes).digest('hex') !== id) throw new DictionaryUnavailableError();
    return { bytes, mime: name.endsWith('.avif') ? 'image/avif' : 'image/png' };
  }
  async lookup(query: DictionaryQuery): Promise<DictionaryResult> {
    const m = await this.metadata();
    const keys = [...new Set([query.query, query.dictionaryForm, query.reading].filter((k): k is string => !!k).map(normalizeDictionaryKey))];
    const ranks = new Map<string, number>();
    for (const [rank, key] of keys.entries()) {
      const index = await this.shard('index', key);
      const ids = Object.hasOwn(index, key) ? index[key] as string[] : undefined;
      for (const id of ids ?? []) if (!ranks.has(id)) ranks.set(id, rank);
    }
    const entries: DictionaryEntry[] = [];
    for (const id of ranks.keys()) {
      const entry = (await this.shard('entries', id))[id] as DictionaryEntry | undefined;
      if (!entry) throw new DictionaryUnavailableError();
      entries.push({ ...entry, source: m.source });
    }
    const surface = normalizeDictionaryKey(query.query);
    const lemma = query.dictionaryForm ? normalizeDictionaryKey(query.dictionaryForm) : '';
    const headMatches = (entry: DictionaryEntry, key: string) => entry.spellings.some(s => normalizeDictionaryKey(s.text) === key)
      || !entry.spellings.length && entry.readings.some(r => normalizeDictionaryKey(r.text) === key);
    const rank = (entry: DictionaryEntry) => headMatches(entry, surface) ? 0 : lemma && headMatches(entry, lemma) ? 1 : 2;
    entries.sort((a, b) => rank(a) - rank(b) || Number(b.common) - Number(a.common) || a.id.localeCompare(b.id));
    const offset = query.offset ?? 0;
    const result: DictionaryResult = { entries: entries.slice(offset, offset + 20), total: entries.length, offset, hasMore: entries.length > offset + 20, source: m.source, tags: m.tags };
    const language = query.locale && dictionaryLanguage(query.locale);
    if (!language) {
      if (query.locale === 'en') { try { result.datasets = Object.values((await this.localizedMetadata()).sources); } catch { /* English remains independently usable. */ } }
      return result;
    }
    try {
      const localized = await this.localizedMetadata();
      // One decompressed LRU and one in-flight map serve all four languages.
      const enriched = await Promise.all(result.entries.map(async entry => {
        const name = `${language}/entries-${createHash('sha256').update(entry.id).digest('hex').slice(0, 2)}.json.gz`;
        const shard = await this.loadShard(`locales/${name}`, localized.files[name]);
        const blocks = Object.hasOwn(shard, entry.id) ? shard[entry.id] as LocalizedBlock[] : [];
        return { ...entry, localizations: blocks.length ? [{ ...localized.sources[language], blocks }] : [] };
      }));
      result.entries = enriched;
      result.datasets = Object.values(localized.sources);
      result.localizationStatus = { language, status: 'ready' };
    } catch {
      result.localizationStatus = { language, status: 'unavailable' };
    }
    return result;
  }
  get cachedBytes() { return this.bytes; }
}
export const dictionaryStore = new DictionaryStore();
