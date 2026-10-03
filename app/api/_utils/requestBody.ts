import { NextResponse } from 'next/server';

export const JSON_BODY_LIMIT = 1024 * 1024;
export const IMAGE_BODY_LIMIT = 9 * 1024 * 1024;
export const AUTH_BODY_LIMIT = 4096;

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Bound actual bytes before decoding/JSON parsing, including chunked bodies. */
export async function readJsonBody(request: Request, limit = JSON_BODY_LIMIT): Promise<Record<string, unknown>> {
  const tooLarge = () => new RequestBodyError('请求正文过大', 413);
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > limit) {
    void request.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('请求正文必须是 JSON 对象', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new RequestBodyError('请求正文必须是有效的 JSON 对象', 400);
  }
}

export function requestBodyErrorResponse(error: unknown): NextResponse | null {
  return error instanceof RequestBodyError
    ? NextResponse.json({ error: { message: error.message }, success: false, message: error.message }, { status: error.status })
    : null;
}
