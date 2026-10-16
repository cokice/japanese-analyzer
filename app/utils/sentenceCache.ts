import type { EndpointPayload, TokenData } from '../services/api';
import type { Locale } from '../i18n';

/** Tab-lifetime LRU. Never persists sentences, credentials, or model output to disk. */
export class ResultCache<T> {
  private entries = new Map<string, { json: string; bytes: number }>();
  private bytes = 0;
  constructor(private maxEntries = 20, private maxBytes = 2 * 1024 * 1024) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return JSON.parse(entry.json) as T;
  }
  set(key: string, value: T) {
    const json = JSON.stringify(value);
    const bytes = (key.length + json.length) * 2;
    if (bytes > this.maxBytes) return;
    this.bytes -= this.entries.get(key)?.bytes ?? 0;
    this.entries.delete(key);
    this.entries.set(key, { json, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}

// Opaque session-only credential scopes keep keys out of cache identifiers and diagnostics.
const credentialScopes = new Map<string, number>();
export function credentialScope(apiKey = ''): number {
  if (!credentialScopes.has(apiKey)) credentialScopes.set(apiKey, credentialScopes.size + 1);
  return credentialScopes.get(apiKey)!;
}
export function sentenceCacheKey(text: string, endpoint: EndpointPayload, locale: Locale, apiKey = '', thinking = false): string {
  return JSON.stringify([1, text, endpoint.baseUrl, endpoint.model, endpoint.caps ?? {}, locale, credentialScope(apiKey), thinking]);
}

export const analysisCache = new ResultCache<TokenData[]>();
export const sentenceTranslationCache = new ResultCache<string>();
