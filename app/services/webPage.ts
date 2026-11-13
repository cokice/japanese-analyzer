import { getApiEndpoint, getHeaders } from './request';
import { apiErrorFromResponse } from '../utils/requestErrors';
import { normalizePastedText } from '../utils/pastedText';

export async function readWebPage(url: string, apiKey?: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(getApiEndpoint('/fetch-url'), {
    method: 'POST', headers: getHeaders(apiKey), body: JSON.stringify({ url }), signal,
  });
  if (!response.ok) throw apiErrorFromResponse(await response.json().catch(() => null), response.status);
  const page = await response.json();
  if (typeof page.content !== 'string') throw apiErrorFromResponse({ error: { code: 'INVALID_RESPONSE' } }, 502);
  const text = normalizePastedText(page.content).trim();
  if (!text) throw apiErrorFromResponse({ error: { code: 'WEB_PAGE_UNAVAILABLE' } }, 422);
  return text;
}
