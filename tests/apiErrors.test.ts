import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as analyze } from '../app/api/analyze/route';
import { API_ERROR_MESSAGES, isApiErrorCode } from '../app/lib/apiErrors';
import { messages } from '../app/i18n/messages';
import { LOCALES, localizeError } from '../app/i18n';
import { apiErrorFromResponse } from '../app/utils/requestErrors';

export async function runApiErrorTests() {
  assert.equal(isApiErrorCode('__proto__'), false);
  for (const code of Object.keys(API_ERROR_MESSAGES) as (keyof typeof API_ERROR_MESSAGES)[]) {
    for (const locale of LOCALES) {
      const key = API_ERROR_MESSAGES[code];
      assert.equal(localizeError({ code }, locale), locale === 'zh-CN' ? key : messages[key][locale]);
    }
  }
  assert.equal(apiErrorFromResponse({ error: { code: '__proto__' } }, 500).code, 'SERVER_ERROR');
  assert.equal(apiErrorFromResponse({ error: { code: 'RATE_LIMITED', params: [{}] } }, 429).params, undefined);
  assert.deepEqual(apiErrorFromResponse({ error: { code: 'RATE_LIMITED', params: [60] } }, 429).params, [60]);
  const env = { CODE: process.env.CODE, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY };
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.CODE;
    delete process.env.DEEPSEEK_API_KEY;
    const request = (body: string, ownKey = false) => new NextRequest('http://localhost/api/analyze', {
      method: 'POST', headers: ownKey ? { Authorization: 'Bearer own-key' } : {}, body,
    });
    const invalid = await analyze(request('{'));
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: { code: 'INVALID_REQUEST' } });
    const missing = await analyze(request('{"sentence":"本"}'));
    assert.equal(missing.status, 500);
    assert.deepEqual(await missing.json(), { error: { code: 'MISSING_API_KEY' } });
    globalThis.fetch = async () => Response.json({ error: { message: 'provider-specific diagnostics' } }, { status: 401 });
    const denied = await analyze(request('{"sentence":"本"}', true));
    assert.equal(denied.status, 401);
    const payload = await denied.json();
    assert.deepEqual(payload, { error: { code: 'INVALID_API_KEY' } });
    assert.equal(localizeError(apiErrorFromResponse(payload, 401), 'en'), 'Invalid API key. Check it in Settings.');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
