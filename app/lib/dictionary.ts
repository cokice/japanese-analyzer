import { toHiragana } from '../utils/romaji';

export interface DictionarySource { id: string; name: string; version: string; date: string; url: string; license: string; licenseUrl: string; }
export interface DictionarySense { id: string; pos: string[]; glosses: string[]; appliesToSpellings: string[]; appliesToReadings: string[]; tags: string[]; notes: string[]; }
export interface DictionaryEntry {
  id: string; common: boolean;
  spellings: { text: string; common: boolean; tags: string[] }[];
  readings: { text: string; common: boolean; appliesTo: string[]; tags: string[] }[];
  senses: DictionarySense[];
  source: DictionarySource;
}
export interface DictionaryProvider { id: string; name: string; adapter: 'builtin' | 'http-v1'; lookupUrl?: string; apiKey?: string; }
export interface DictionarySettings { providers: DictionaryProvider[]; activeId: string; }
export interface DictionaryQuery { query: string; dictionaryForm?: string; reading?: string; offset?: number; }
export interface DictionaryResult { entries: DictionaryEntry[]; total: number; offset: number; hasMore: boolean; source: DictionarySource; fallback?: 'empty' | 'timeout' | 'unavailable'; tags?: Record<string, string>; }
export const BUILTIN_DICTIONARY: DictionaryProvider = { id: 'builtin', name: 'JMdict', adapter: 'builtin' };
export const DICTIONARY_SETTINGS_KEY = 'japaneseAnalyzer:dictionary:v1';
export const normalizeDictionaryKey = (value: string) => toHiragana(value).trim();
export type DictionaryMatch = 'surface' | 'lemma' | 'reading' | 'other';
export function dictionaryMatch(entry: DictionaryEntry, word: string, lemma = '', reading = ''): DictionaryMatch {
  const matches = (key: string) => !!key && [...entry.spellings, ...entry.readings].some(value => normalizeDictionaryKey(value.text) === normalizeDictionaryKey(key));
  if (matches(word)) return 'surface';
  if (matches(lemma)) return 'lemma';
  if (reading && entry.readings.some(value => normalizeDictionaryKey(value.text) === normalizeDictionaryKey(reading))) return 'reading';
  return 'other';
}
export function readDictionarySettings(raw: string | null): DictionarySettings {
  try {
    const data = JSON.parse(raw || '{}');
    const providers: DictionaryProvider[] = [BUILTIN_DICTIONARY, ...(Array.isArray(data.providers) ? data.providers.filter((p: DictionaryProvider) => p && p.id !== 'builtin' && typeof p.id === 'string' && typeof p.name === 'string' && p.adapter === 'http-v1' && typeof p.lookupUrl === 'string').map((p: DictionaryProvider) => ({ id: p.id, name: p.name, adapter: 'http-v1' as const, lookupUrl: p.lookupUrl, apiKey: typeof p.apiKey === 'string' ? p.apiKey : '' })) : [])];
    return { providers, activeId: providers.some(p => p.id === data.activeId) ? data.activeId : 'builtin' };
  } catch { return { providers: [BUILTIN_DICTIONARY], activeId: 'builtin' }; }
}
export function externalDictionaryLinks(word: string, lemma?: string) {
  const key = lemma?.trim() || word;
  return { ichi: `https://ichi.moe/cl/word/?q=${encodeURIComponent(key)}`, wiktionary: `https://en.wiktionary.org/wiki/${encodeURIComponent(key)}` };
}
