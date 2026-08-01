import {
  UPSTREAM_STREAM_IDLE_TIMEOUT_MS,
  createUpstreamSignal,
  createUpstreamTimeoutController,
  isUpstreamTimeoutError,
} from './requestTimeout';

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

export function wrapStreamingResponseWithIdleTimeout(
  response: Response,
  upstreamController: AbortController,
  idleTimeoutMs = UPSTREAM_STREAM_IDLE_TIMEOUT_MS
): Response {
  if (!response.body) return response;

  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  let idleTimeout: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const clearIdleTimeout = () => {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const resetIdleTimeout = () => {
        clearIdleTimeout();
        idleTimeout = setTimeout(() => {
          if (finished) return;
          finished = true;
          const error = new DOMException('上游流式响应长时间没有返回数据', 'TimeoutError');
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ error: { message: '上游流式响应空闲超时，请重试。' } })}\n\n`
          ));
          controller.close();
          upstreamController.abort(error);
          void reader.cancel(error).catch(() => undefined);
        }, idleTimeoutMs);
      };

      const pump = async () => {
        resetIdleTimeout();
        try {
          while (!finished) {
            const { value, done } = await reader.read();
            if (done) {
              finished = true;
              clearIdleTimeout();
              controller.close();
              return;
            }

            resetIdleTimeout();
            controller.enqueue(value);
          }
        } catch (error) {
          clearIdleTimeout();
          if (!finished) {
            finished = true;
            controller.error(error);
          }
        }
      };

      void pump();
    },
    async cancel(reason) {
      finished = true;
      clearIdleTimeout();
      if (!upstreamController.signal.aborted) {
        upstreamController.abort(reason);
      }
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
  const isStreamingRequest = options.payload.stream === true;
  const streamConnectionTimeout = isStreamingRequest
    ? createUpstreamTimeoutController()
    : null;

  let response: Response;
  try {
    response = await fetch(options.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.payload),
      signal: streamConnectionTimeout?.controller.signal ?? createUpstreamSignal(),
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
  } finally {
    streamConnectionTimeout?.clear();
  }

  if (response.ok) {
    return {
      ok: true,
      response: streamConnectionTimeout
        ? wrapStreamingResponseWithIdleTimeout(response, streamConnectionTimeout.controller)
        : response,
    };
  }

  const upstreamError = await parseUpstreamError(response);
  return { ok: false, status: response.status, error: upstreamError };
}
