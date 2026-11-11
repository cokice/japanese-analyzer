import assert from 'node:assert/strict';
import { localizeError } from '../app/i18n';
import { NextRequest } from 'next/server';
import { createServerKeyRateLimiter } from '../app/api/_utils/serverKeyRateLimit';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as translate } from '../app/api/translate/route';

export async function runServerKeyRateLimitTests() {
  const reserve = createServerKeyRateLimiter();
  assert.equal(reserve('a', 2, 1000, 0), 0);
  assert.equal(reserve('a', 2, 1000, 1), 0);
  assert.equal(reserve('a', 2, 1000, 2), 1);
  assert.equal(reserve('b', 2, 1000, 2), 0);
  assert.equal(reserve('a', 2, 1000, 1000), 0);
  const env = { CODE: process.env.CODE, GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SERVER_KEY_RATE_LIMIT: process.env.SERVER_KEY_RATE_LIMIT, SERVER_KEY_RATE_WINDOW_SECONDS: process.env.SERVER_KEY_RATE_WINDOW_SECONDS };
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  try {
    delete process.env.CODE;
    process.env.GEMINI_API_KEY = 'server-test-key';
    process.env.SERVER_KEY_RATE_LIMIT = '2';
    process.env.SERVER_KEY_RATE_WINDOW_SECONDS = '60';
    globalThis.fetch = async () => {
      upstreamCalls++;
      return Response.json({ choices: [{ message: { content: 'book' } }] });
    };
    const request = (ip: string, ownKey = false) => new NextRequest('http://localhost/api/test', {
      method: 'POST', headers: { 'x-forwarded-for': ip, 'X-App-Locale': 'en', ...(ownKey ? { Authorization: 'Bearer own-key' } : {}) },
      body: JSON.stringify({ sentence: '本', text: '本', provider: 'gemini' }),
    });
    assert.equal((await analyze(request('192.0.2.42'))).status, 200);
    assert.equal((await translate(request('192.0.2.42'))).status, 200);
    const limited = await analyze(request('192.0.2.42'));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('Retry-After')) > 0);
    const payload = (await limited.json()).error;
    assert.equal(payload.code, 'RATE_LIMITED');
    assert.equal(payload.message, undefined);
    assert.equal(localizeError(payload, 'en'), 'Too many requests. Please try again later.');
    assert.equal(upstreamCalls, 2, 'Quota is shared by endpoints and reserves before upstream requests');
    assert.equal((await analyze(request('192.0.2.43'))).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await analyze(request('192.0.2.42', true))).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
