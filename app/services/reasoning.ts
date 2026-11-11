import { type ReasoningSummaryRequestOptions } from '../lib/apiTypes';
import { getApiEndpoint, getHeaders } from './request';
import { apiErrorFromResponse } from '../utils/requestErrors';

export async function summarizeDeepSeekReasoningProgress(
  options: ReasoningSummaryRequestOptions
): Promise<string> {
  const response = await fetch(getApiEndpoint('/reasoning-summary'), {
    method: 'POST',
    headers: getHeaders(options.userApiKey),
    body: JSON.stringify({
      reasoningSnippet: options.reasoningSnippet,
    }),
    signal: options.signal,
  });

  const data = await response.json().catch(() => null) as {
    summary?: unknown;
    error?: { message?: unknown };
  } | null;

  if (!response.ok) {
    throw apiErrorFromResponse(data, response.status);
  }

  if (typeof data?.summary !== 'string' || !data.summary.trim()) {
    throw new Error('思考摘要响应格式错误');
  }

  return data.summary.trim();
}
