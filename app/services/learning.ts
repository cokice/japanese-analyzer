import { getClientLocale } from '../i18n';
import type { EndpointPayload } from './api';
import type { DictionaryProvider, DictionaryQuery, DictionaryResult } from '../lib/dictionary';
import { ApiRequestError } from '../utils/requestErrors';
import { credentialScope, ResultCache } from '../utils/sentenceCache';

export interface LearningModel { endpoint: EndpointPayload; apiKey?: string; }
export async function postLearning<T>(path: string, data: unknown, signal: AbortSignal, model?: LearningModel): Promise<T> {
  const started = performance.now();
  const sourceType = model ? 'ai' : (data as { provider?: DictionaryProvider })?.provider?.adapter ?? 'builtin';
  const metric = (outcome: string) => { if (typeof window !== 'undefined') { try { window.umami?.track?.('learning_tool', { feature: path.split('/').at(-1) ?? '', outcome, duration_ms: Math.round(performance.now() - started), source_type: sourceType }); } catch {} } };
  try {
    const response = await fetch(path, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-App-Locale': getClientLocale(), ...(model?.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}) }, body: JSON.stringify({ ...(data as object), ...(model ? { ...model.endpoint } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new ApiRequestError(result.error?.message || '学习工具请求失败', response.status);
    metric('success'); return result;
  } catch (error) { metric(signal.aborted ? 'cancel' : 'error'); throw error; }
}
const dictionaryCache = new ResultCache<{ result: DictionaryResult; expires: number }>(80, 4 * 1024 * 1024);
export async function queryDictionary(query: DictionaryQuery, provider: DictionaryProvider, signal: AbortSignal, test = false, force = false): Promise<DictionaryResult> {
  signal.throwIfAborted();
  const key = JSON.stringify([provider.adapter, provider.id, provider.lookupUrl || '', credentialScope(provider.apiKey), getClientLocale(), query.query, query.dictionaryForm || '', query.reading || '', query.offset ?? 0]);
  const cached = !test && !force ? dictionaryCache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = await postLearning<DictionaryResult>('/api/dictionary/lookup', { ...query, provider, test }, signal);
  signal.throwIfAborted();
  // Fallbacks must retry the chosen service next time; never cache temporary outages.
  if (!test && !result.fallback) dictionaryCache.set(key, { result, expires: Date.now() + (provider.adapter === 'builtin' ? 10 : 2) * 60_000 });
  return result;
}
