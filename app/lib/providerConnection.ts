import type { ProviderProfile } from './aiModels';
import type { Locale } from '../i18n';

/** A connection check is a plain completion, independent of analysis JSON schemas. */
export async function testProviderConnection(
  service: ProviderProfile,
  model: string,
  locale: Locale,
  signal: AbortSignal,
): Promise<void> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${service.apiKey.trim()}`,
      'X-App-Locale': locale,
    },
    signal: requestSignal,
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Connection test. Reply with OK only.' }],
      useStream: false,
      baseUrl: service.baseUrl.trim(),
      model: model.trim(),
    }),
  });
  const data = await response.json().catch(() => null);
  requestSignal.throwIfAborted();
  if (!response.ok || data?.error) {
    throw new Error(typeof data?.error?.message === 'string' ? data.error.message
      : typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`);
  }
  if (typeof data?.choices?.[0]?.message?.content !== 'string' || !data.choices[0].message.content.trim()) {
    throw new Error('接口未返回有效的模型回复，请检查地址和模型名称');
  }
}
