import type { DictionaryProvider, DictionaryQuery, DictionaryResult } from '../../lib/dictionary';
import { validateBaseUrl } from './validateBaseUrl';
import { dictionaryStore } from './dictionaryStore';

export function validateDictionaryResult(value: unknown): DictionaryResult {
  const data = value as DictionaryResult;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
  const sourceValid = (s: DictionaryResult['source']) => s && ['id','name','version','date','url','license','licenseUrl'].every(k => typeof s[k as keyof typeof s] === 'string') && /^https?:\/\//.test(s.url) && /^https?:\/\//.test(s.licenseUrl);
  if (!data || !sourceValid(data.source) || !Number.isInteger(data.total) || data.total < 0 || !Number.isInteger(data.offset) || data.offset < 0 || typeof data.hasMore !== 'boolean' || !Array.isArray(data.entries) || data.entries.length > 20) throw new Error('Invalid dictionary response');
  if (data.tags !== undefined && (!data.tags || typeof data.tags !== 'object' || !Object.values(data.tags).every(v => typeof v === 'string'))) throw new Error('Invalid dictionary tags');
  for (const e of data.entries) {
    if (!e || typeof e.id !== 'string' || typeof e.common !== 'boolean' || !sourceValid(e.source) || !Array.isArray(e.spellings) || !e.spellings.every(s => typeof s.text === 'string' && typeof s.common === 'boolean' && strings(s.tags)) || !Array.isArray(e.readings) || !e.readings.every(r => typeof r.text === 'string' && typeof r.common === 'boolean' && strings(r.appliesTo) && strings(r.tags)) || !Array.isArray(e.senses) || e.senses.length > 200 || !e.senses.every(s => typeof s.id === 'string' && strings(s.pos) && strings(s.glosses) && strings(s.appliesToSpellings) && strings(s.appliesToReadings) && strings(s.tags) && strings(s.notes))) throw new Error('Invalid dictionary entry');
    // HTTP v1 has no trusted JMdict identity or localization schema. Never
    // accept unvalidated rich content or join its numeric IDs to builtin data.
    delete e.localizations;
  }
  delete data.localizationStatus; delete data.datasets;
  if (new Set(data.entries.map(e => `${e.source.id}:${e.id}`)).size !== data.entries.length || data.entries.some(e => new Set(e.senses.map(s => s.id)).size !== e.senses.length)) throw new Error('Duplicate dictionary IDs');
  return data;
}
type Adapter = (query: DictionaryQuery, provider: DictionaryProvider, signal: AbortSignal) => Promise<DictionaryResult>;
// Add vendor-specific protocol conversion here; the public interface remains stable.
export const dictionaryAdapters: Record<DictionaryProvider['adapter'], Adapter> = {
  builtin: query => dictionaryStore.lookup(query),
  'http-v1': async (query, provider, signal) => {
    const url = validateBaseUrl(provider.lookupUrl);
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid dictionary URL');
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      headers: { 'Content-Type': 'application/json', ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify({ query: query.query, dictionaryForm: query.dictionaryForm, reading: query.reading, offset: query.offset ?? 0, limit: 20 }) });
    if (!response.ok) throw new Error('Dictionary upstream failed');
    const reader = response.body?.getReader(); if (!reader) throw new Error('Empty dictionary response');
    let text = ''; let bytes = 0; const decoder = new TextDecoder();
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1024 * 1024) throw new Error('Dictionary response too large'); text += decoder.decode(value, { stream: true }); }
      return validateDictionaryResult(JSON.parse(text + decoder.decode()));
    } finally { await reader.cancel().catch(() => {}); }
  },
};
export async function lookupDictionary(query: DictionaryQuery, provider: DictionaryProvider | undefined, signal: AbortSignal, test = false): Promise<DictionaryResult> {
  if (!provider || provider.adapter === 'builtin') return dictionaryStore.lookup(query);
  let fallback: DictionaryResult['fallback'];
  try {
    if (!(provider.adapter in dictionaryAdapters)) throw new Error();
    const result = await dictionaryAdapters[provider.adapter](query, provider, signal);
    if (result.entries.length || query.offset || test) return result;
    fallback = 'empty';
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (test) throw new Error('外部词典连接失败');
    fallback = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unavailable';
  }
  return { ...await dictionaryStore.lookup({ ...query, offset: 0 }), fallback };
}
