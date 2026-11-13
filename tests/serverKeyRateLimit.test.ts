import assert from 'node:assert/strict';
import { localizeError } from '../app/i18n';
import { NextRequest } from 'next/server';
import { createServerKeyRateLimiter, ServerKeyRateLimitError, serverKeyRateLimitResponse } from '../app/api/_utils/serverKeyRateLimit';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as translate } from '../app/api/translate/route';

export async function runServerKeyRateLimitTests() {
  const reserve = createServerKeyRateLimiter();
  assert.equal(reserve('a', 2, 1000, 0), 0);
  assert.equal(reserve('a', 2, 1000, 1), 0);
  assert.equal(reserve('a', 2, 1000, 2), 1);
  assert.equal(reserve('b', 2, 1000, 2), 0);
  assert.equal(reserve('a', 2, 1000, 1000), 0);
  // 限流响应的格式仍然有效（实现保留，随时可以重新启用）。
  const limited = serverKeyRateLimitResponse(new ServerKeyRateLimitError(7));
  assert.ok(limited);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '7');
  const payload = (await limited.json()).error;
  assert.equal(payload.code, 'RATE_LIMITED');
  assert.equal(payload.message, undefined);
  assert.equal(localizeError(payload, 'en'), 'Too many requests. Please try again later.');
  assert.equal(serverKeyRateLimitResponse(new Error('other')), null);

  // 限流已停用：共享服务器 Key 的请求不受次数限制，也不读取任何环境变量。
  const env = { CODE: process.env.CODE, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  try {
    delete process.env.CODE;
    process.env.GEMINI_API_KEY = 'server-test-key';
    globalThis.fetch = async () => {
      upstreamCalls++;
      return Response.json({ choices: [{ message: { content: 'book' } }] });
    };
    const request = (ip: string) => new NextRequest('http://localhost/api/test', {
      method: 'POST', headers: { 'x-forwarded-for': ip, 'X-App-Locale': 'en' },
      body: JSON.stringify({ sentence: '本', text: '本', provider: 'gemini' }),
    });
    for (let i = 0; i < 40; i++) {
      const handler = i % 2 ? translate : analyze;
      assert.equal((await handler(request('192.0.2.42'))).status, 200, 'Shared server key requests are not rate limited');
    }
    assert.equal(upstreamCalls, 40);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
