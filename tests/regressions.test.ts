import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as login, GET as authStatus } from '../app/api/auth/route';
import { POST as translate } from '../app/api/translate/route';
import { POST as imageToText } from '../app/api/image-to-text/route';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as chat } from '../app/api/chat/route';
import { POST as wordDetail } from '../app/api/word-detail/route';
import { POST as summary } from '../app/api/reasoning-summary/route';
import { POST as tts } from '../app/api/tts/route';
import { readJsonBody, AUTH_BODY_LIMIT, RequestBodyError } from '../app/api/_utils/requestBody';
import { createLoginRateLimiter } from '../app/api/_utils/loginRateLimit';
import { LatestRequest } from '../app/utils/latestRequest';
import { browserStorage } from '../app/utils/storage';
import { getPhraseReading } from '../app/utils/phraseRange';
import { getLocalRomaji } from '../app/utils/romaji';
import { secondsUntilJstMidnight } from '../app/utils/dailySentences';
import { extractTextFromImage, translateText, loadAISettingsFromStorage, saveAISettingsToStorage } from '../app/services/api';
import { sanitizeProfiles, resolveModelSelection, type ProviderProfile } from '../app/lib/aiModels';
import { testProviderConnection } from '../app/lib/providerConnection';

const request = (body: string, url = 'http://localhost/api/auth', headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...headers } });
const completion = (reason = 'stop') => ({ choices: [{ message: { content: '読みました' }, finish_reason: reason }] });
const endpointBody = { baseUrl: 'https://api.test.example', model: 'test-model' };

async function run() {
  const env = { CODE: process.env.CODE, AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE };
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.CODE;
    delete process.env.AUTH_COOKIE_SECURE;
    const testService = { id: 'test', name: 'Test', baseUrl: ' https://api.test.example/v1 ', apiKey: ' test-key ', models: [] };
    const testController = new AbortController();
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/chat');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, 'chosen-model');
      assert.equal(payload.baseUrl, 'https://api.test.example/v1');
      assert.equal(payload.useStream, false);
      assert.equal(payload.caps, undefined, 'Connection testing does not require structured output support');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key');
      assert.equal(new Headers(init?.headers).get('X-App-Locale'), 'en');
      assert.ok(init?.signal);
      return Response.json(completion());
    };
    await testProviderConnection(testService, ' chosen-model ', 'en', testController.signal);
    for (const result of [Response.json({}), new Response('<html>gateway</html>'), Response.json({ choices: [{ message: { content: '' } }] })]) {
      globalThis.fetch = async () => result;
      await assert.rejects(testProviderConnection(testService, 'chosen-model', 'en', testController.signal), /未返回有效/);
    }
    globalThis.fetch = async () => Response.json({ error: { message: 'Unknown model' } }, { status: 404 });
    await assert.rejects(testProviderConnection(testService, 'chosen-model', 'en', testController.signal), /Unknown model/);
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    const pendingTest = testProviderConnection(testService, 'chosen-model', 'en', testController.signal);
    testController.abort();
    await assert.rejects(pendingTest, { name: 'AbortError' });
    globalThis.fetch = originalFetch;
    const emptyProvider: ProviderProfile = { id: 'empty', name: 'Keep credentials', baseUrl: 'https://api.test.example/v1', apiKey: 'saved-key', models: [] };
    assert.deepEqual(sanitizeProfiles([emptyProvider]), [emptyProvider]);
    const availableProvider: ProviderProfile = { ...emptyProvider, id: 'available', models: [{ id: 'm', name: 'Model', model: 'model' }] };
    assert.equal(resolveModelSelection([emptyProvider, availableProvider], 'empty', 'deleted-model').service?.id, 'available');
    const settingsMap = new Map<string, string>();
    const settingsStorage = {
      getItem: (key: string) => settingsMap.get(key) ?? null,
      setItem: (key: string, value: string) => { settingsMap.set(key, value); },
      removeItem: (key: string) => { settingsMap.delete(key); },
    };
    saveAISettingsToStorage(settingsStorage, { services: [emptyProvider], activeServiceId: 'empty', activeModelId: '', geminiApiKey: '', thinkingEnabled: false });
    const loadedEmptyProvider = loadAISettingsFromStorage(settingsStorage);
    assert.deepEqual(loadedEmptyProvider.services, [emptyProvider], 'Removing the last model must retain the provider and credentials after reload');
    assert.equal(loadedEmptyProvider.activeModelId, '');
    for (const handler of [login, translate, imageToText, analyze, chat, wordDetail, summary, tts]) {
      for (const body of ['{', 'null', '[]', '"value"']) {
        assert.equal((await handler(request(body)))?.status, 400);
      }
    }
    // Fixed-length oversize and forged-small/missing lengths hit the same limit.
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': String(4 * 1024 * 1024) }] as Record<string, string>[]) {
      assert.equal((await login(request(JSON.stringify({ password: 'x'.repeat(4 * 1024 * 1024) }), undefined, headers))).status, 413);
    }
    let cancelled = false;
    let pulled = 0;
    const chunked = new Request('http://localhost/api/auth', {
      method: 'POST', duplex: 'half',
      body: new ReadableStream({
        pull(controller) { pulled++; controller.enqueue(new Uint8Array(1024)); },
        cancel() { cancelled = true; },
      }),
    } as RequestInit);
    await assert.rejects(readJsonBody(chunked, AUTH_BODY_LIMIT), (error: unknown) => error instanceof RequestBodyError && error.status === 413);
    assert.equal(cancelled, true);
    assert.ok(pulled < 10, 'stop reading without consuming the complete chunked body');
    assert.deepEqual(await readJsonBody(request('{"password":"日本語"}'), 64), { password: '日本語' });
    await assert.rejects(readJsonBody(request('{"password":"日本語"}'), 22), RequestBodyError);
    const limiter = createLoginRateLimiter(2, 1000);
    assert.equal(limiter(1000), 0);
    assert.equal(limiter(1000), 0);
    assert.equal(limiter(1001), 1);
    assert.equal(limiter(2000), 0);

    process.env.CODE = 'test-password';
    for (const [scheme, secure] of [['http', false], ['https', true]] as const) {
      const result = await login(request('{"password":"test-password"}', `${scheme}://localhost/api/auth`));
      assert.equal(result.status, 200);
      const cookie = result.headers.get('set-cookie')!;
      assert.equal(cookie.includes('; Secure'), secure);
      const session = new NextRequest(`${scheme}://localhost/api/auth`, { headers: { cookie: cookie.split(';')[0] } });
      assert.equal((await (await authStatus(session)).json()).authenticated, true);
    }
    process.env.AUTH_COOKIE_SECURE = 'true';
    assert.match((await login(request('{"password":"test-password"}'))).headers.get('set-cookie')!, /; Secure/);
    const attempts = await Promise.all(Array.from({ length: 30 }, (_, index) => login(request('{"password":"wrong"}', undefined, { 'x-forwarded-for': `192.0.2.${index}` }))));
    assert.equal(attempts.filter(result => result.status === 401).length, 7);
    assert.equal(attempts.filter(result => result.status === 429).length, 23);
    assert.ok(Number(attempts.at(-1)!.headers.get('retry-after')) > 0);
    // Authentication still rejects before parsing or contacting an upstream.
    assert.equal((await translate(request('{'))).status, 401);
    delete process.env.CODE;

    for (const handler of [translate, imageToText]) {
      for (const reason of ['length', 'content_filter']) {
        globalThis.fetch = async () => Response.json(completion(reason));
        const result = await handler(request(JSON.stringify({ text: '日本語', imageData: 'data:image/png;base64,AA==', ...endpointBody }), undefined, { Authorization: 'Bearer test-key' }));
        assert.equal(result.status, 502);
      }
      globalThis.fetch = async () => Response.json(completion());
      assert.equal((await handler(request(JSON.stringify({ text: '日本語', imageData: 'data:image/png;base64,AA==', ...endpointBody }), undefined, { Authorization: 'Bearer test-key' }))).status, 200);
    }
    for (const call of [() => translateText('日本語'), () => extractTextFromImage('data:image/png;base64,AA==')]) {
      globalThis.fetch = async () => Response.json(completion('length'));
      await assert.rejects(call(), /截断/);
      globalThis.fetch = async () => Response.json(completion());
      assert.equal(await call(), '読みました');
    }
    const controller = new AbortController();
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).model, 'test-model');
      assert.equal(init?.signal, controller.signal);
      return Response.json(completion());
    };
    await extractTextFromImage('image', undefined, undefined, endpointBody, controller.signal);
    let upstreamSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_url, init) => {
      upstreamSignal = init?.signal;
      controller.abort();
      assert.equal(upstreamSignal?.aborted, true);
      throw new DOMException('cancelled', 'AbortError');
    };
    const upstreamRequest = new NextRequest('http://localhost/api/image-to-text', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: 'Bearer test-key' }, body: JSON.stringify({ imageData: 'image', ...endpointBody }),
    });
    assert.equal((await imageToText(upstreamRequest)).status, 499);

    // Late promises cannot become current again after clear, replacement or unmount.
    const slot = new LatestRequest();
    const old = slot.start();
    const current = slot.start();
    assert.equal(old.isCurrent(), false);
    assert.equal(old.signal.aborted, true);
    assert.equal(current.isCurrent(), true);
    slot.cancel();
    await Promise.resolve();
    assert.equal(current.isCurrent(), false);

    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { get localStorage() { throw new Error('denied'); } } });
    try {
      assert.equal(browserStorage.getItem('theme'), null);
      assert.doesNotThrow(() => browserStorage.setItem('theme', 'dark'));
      assert.doesNotThrow(() => browserStorage.removeItem('theme'));
      assert.doesNotThrow(() => loadAISettingsFromStorage(browserStorage));
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
    const reading = getPhraseReading([
      { word: '私', pos: '名詞', furigana: 'わたし' }, { word: 'は', pos: '助詞', furigana: 'は' },
      { word: '東京', pos: '名詞', furigana: 'とうきょう' }, { word: 'へ', pos: '助詞' },
    ], { start: 0, end: 3 });
    assert.equal(getLocalRomaji('私は東京へ', reading), 'watashiwatoukyoue');
    assert.equal(secondsUntilJstMidnight(new Date('2026-10-04T14:59:59.500Z')), 0);
    assert.equal(secondsUntilJstMidnight(new Date('2026-10-04T14:59:30Z')), 30);
    console.log('Security and behavior regression tests passed');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
