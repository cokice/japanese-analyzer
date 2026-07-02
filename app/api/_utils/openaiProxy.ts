import { createUpstreamSignal, isUpstreamTimeoutError } from './requestTimeout';

type ParsedUpstreamError = {
  message: string;
  raw?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractMessageFromUnknownJson(json: unknown): string | undefined {
  if (Array.isArray(json) && json.length > 0) {
    const first = json[0];
    if (isRecord(first) && 'error' in first) {
      const err = first.error;
      if (isRecord(err) && typeof err.message === 'string') return err.message;
      if (typeof err === 'string') return err;
    }
    if (isRecord(first) && typeof first.message === 'string') return first.message;
  }

  if (isRecord(json) && 'error' in json) {
    const err = json.error;
    if (isRecord(err) && typeof err.message === 'string') return err.message;
    if (typeof err === 'string') return err;
  }

  if (isRecord(json) && typeof json.message === 'string') return json.message;
  if (isRecord(json) && typeof json.error_description === 'string') return json.error_description;
  return undefined;
}

async function parseUpstreamError(response: Response): Promise<ParsedUpstreamError> {
  const text = await response.text();
  if (!text) return { message: response.statusText || '上游接口返回空错误响应' };

  try {
    const json = JSON.parse(text) as unknown;
    const extracted = extractMessageFromUnknownJson(json);
    const message = extracted || response.statusText || '处理请求时出错';
    return { message, raw: json };
  } catch {
    return { message: text || response.statusText || '处理请求时出错', raw: text };
  }
}

export async function proxyOpenAICompatibleRequest(options: {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
}): Promise<
  | { ok: true; response: Response }
  | { ok: false; status: number; error: ParsedUpstreamError }
> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${options.apiKey}`,
  };

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.payload),
      signal: createUpstreamSignal(),
    });
  } catch (error) {
    if (isUpstreamTimeoutError(error)) {
      return {
        ok: false,
        status: 504,
        error: { message: '上游接口请求超时，请稍后重试。' },
      };
    }

    throw error;
  }

  if (response.ok) return { ok: true, response };

  const upstreamError = await parseUpstreamError(response);
  return { ok: false, status: response.status, error: upstreamError };
}
