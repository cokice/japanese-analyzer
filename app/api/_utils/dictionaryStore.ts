import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeDictionaryKey, type DictionaryEntry, type DictionaryQuery, type DictionaryResult, type DictionarySource } from '../../lib/dictionary';

interface Manifest { formatVersion: number; version: string; date: string; entries: number; files: Record<string, string>; source: DictionarySource; tags: Record<string, string>; }
export class DictionaryUnavailableError extends Error { constructor() { super('词典数据不可用，请重新准备词典数据'); } }
export class DictionaryStore {
  private cache = new Map<string, { data: Record<string, unknown>; bytes: number }>();
  private bytes = 0;
  private pending = new Map<string, Promise<Record<string, unknown>>>();
  private manifest?: Promise<Manifest>;
  constructor(private directory = join(process.cwd(), 'data/dictionary'), private maxBytes = 32 * 1024 * 1024) {}
  async metadata() {
    return this.manifest ??= readFile(join(this.directory, 'manifest.json'), 'utf8').then(text => {
      const m = JSON.parse(text) as Manifest;
      if (m.formatVersion !== 1 || !m.source || Object.keys(m.files).length !== 512) throw new Error();
      return m;
    }).catch(() => { this.manifest = undefined; throw new DictionaryUnavailableError(); });
  }
  private async shard(kind: string, key: string): Promise<Record<string, unknown>> {
    const name = `${kind}-${createHash('sha256').update(key).digest('hex').slice(0, 2)}.json.gz`;
    const cached = this.cache.get(name);
    if (cached) { this.cache.delete(name); this.cache.set(name, cached); return cached.data; }
    const existing = this.pending.get(name);
    if (existing) return existing;
    const loading = this.readShard(name);
    this.pending.set(name, loading);
    try { return await loading; } finally { this.pending.delete(name); }
  }
  private async readShard(name: string): Promise<Record<string, unknown>> {
    try {
      const m = await this.metadata();
      const buffer = await readFile(join(this.directory, name));
      if (createHash('sha256').update(buffer).digest('hex') !== m.files[name]) throw new Error();
      const raw = gunzipSync(buffer); const data = JSON.parse(raw.toString());
      if (raw.length <= this.maxBytes) {
        while (this.bytes + raw.length > this.maxBytes && this.cache.size) {
          const oldest = this.cache.keys().next().value!;
          this.bytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
        }
        this.cache.set(name, { data, bytes: raw.length }); this.bytes += raw.length;
      }
      return data;
    } catch { throw new DictionaryUnavailableError(); }
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
    return { entries: entries.slice(offset, offset + 20), total: entries.length, offset, hasMore: entries.length > offset + 20, source: m.source, tags: m.tags };
  }
  get cachedBytes() { return this.bytes; }
}
export const dictionaryStore = new DictionaryStore();
