import { getClientLocale } from '../i18n';
import type { EndpointPayload } from './api';
import type { DictionaryProvider, DictionaryQuery, DictionaryResult } from '../lib/dictionary';
import { ApiRequestError } from '../utils/requestErrors';

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
export const queryDictionary = (query: DictionaryQuery, provider: DictionaryProvider, signal: AbortSignal, test = false) => postLearning<DictionaryResult>('/api/dictionary/lookup', { ...query, provider, test }, signal);
