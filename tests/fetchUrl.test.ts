import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/fetch-url/route';
import { getSingleWebUrl } from '../app/lib/webUrl';
import { readWebPage } from '../app/services/webPage';
import { ApiRequestError } from '../app/utils/requestErrors';
import { splitJapaneseText, reconstructJapaneseChunks } from '../app/utils/japaneseChunking';
import { LatestRequest } from '../app/utils/latestRequest';

const url = 'https://example.com/article?lang=ja';
const paragraph = '今日はいい天気ですね。図書館で日本語を勉強します。';
const markdown = `# 記事\n\n${Array(60).fill(`**${paragraph}**\n\n[続きを読む](https://example.com/more)`).join('\n\n')}`;
const request = (body: unknown, key = 'user-key', signal?: AbortSignal) => new NextRequest('http://localhost/api/fetch-url', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  body: JSON.stringify(body), signal,
});

async function run() {
  const originalFetch = globalThis.fetch;
  const env = { CODE: process.env.CODE, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY };
  try {
    delete process.env.CODE;
    process.env.DEEPSEEK_API_KEY = 'server-key';
    for (const invalid of [null, {}, '', 'text https://example.com', `${url}\n${url}`, 'ftp://example.com', 'javascript:alert(1)', 'https://a:b@example.com', 'https://example.com/a b', 'https://', `https://example.com/${'a'.repeat(8192)}`]) {
      assert.equal(getSingleWebUrl(invalid), null, String(invalid));
      globalThis.fetch = async () => { throw new Error('Invalid input reached upstream'); };
      assert.equal((await POST(request({ url: invalid }))).status, 400);
    }
    assert.equal(getSingleWebUrl(` \n${url}\n`), url);
    assert.equal(getSingleWebUrl('https://example.com/a_(b)#section'), 'https://example.com/a_(b)#section');
    assert.equal(getSingleWebUrl('https://例.jp/日本語'), new URL('https://例.jp/日本語').href);

    for (const key of ['user-key', undefined]) {
      const controller = new AbortController();
      globalThis.fetch = async (target, init) => {
        if (target === '/api/fetch-url') {
          assert.equal(init?.signal, controller.signal);
          return POST(new NextRequest('http://localhost/api/fetch-url', { ...init, signal: init?.signal ?? undefined }));
        }
        assert.equal(String(target), 'https://api.deepseek.com/v1/tools/fetch');
        assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${key || 'server-key'}`);
        assert.deepEqual(JSON.parse(String(init?.body)), { url });
        return Response.json({ title: '記事', content: markdown });
      };
      const text = await readWebPage(url, key, controller.signal);
      assert.ok(text.startsWith('記事\n\n' + paragraph));
      assert.ok(!text.includes('https://') && !text.includes('**') && !text.includes('#'));
      const chunks = splitJapaneseText(text);
      assert.ok(chunks.length > 1, 'Fetched articles must use existing long-text chunking');
      assert.equal(reconstructJapaneseChunks(chunks), text, 'Keep all paragraphs without truncation');
    }
    globalThis.fetch = async () => { throw new Error('Unauthenticated request reached upstream'); };
    process.env.CODE = 'password';
    assert.equal((await POST(request({ url }))).status, 401);
    delete process.env.CODE;
    delete process.env.DEEPSEEK_API_KEY;
    assert.equal((await POST(request({ url }, ''))).status, 500);
    assert.equal((await POST(new NextRequest('http://localhost/api/fetch-url', { method: 'POST', body: '{' }))).status, 400);
    for (const content of [null, 5, undefined]) {
      globalThis.fetch = async () => Response.json({ content });
      assert.equal((await POST(request({ url }))).status, 502);
    }
    globalThis.fetch = async () => new Response('not json');
    assert.equal((await POST(request({ url }))).status, 502);
    globalThis.fetch = async () => Response.json({ content: '  ' });
    assert.equal((await POST(request({ url }))).status, 422);
    for (const status of [401, 402, 403, 404, 429, 503, 504]) {
      globalThis.fetch = async () => new Response(null, { status });
      const response = await POST(request({ url }));
      assert.equal(response.status, status === 403 || status === 404 ? 422 : status);
      if (status === 403 || status === 404) assert.equal((await response.json()).error.code, 'WEB_PAGE_UNAVAILABLE');
    }
    globalThis.fetch = async () => Response.json({ content: 'https://example.com' });
    await assert.rejects(readWebPage(url), (error: unknown) => error instanceof ApiRequestError && error.code === 'WEB_PAGE_UNAVAILABLE');
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.equal((await POST(request({ url }))).status, 504);
    // Editing, cancelling, or pasting a newer link aborts the client request and invalidates stale output.
    const latest = new LatestRequest();
    const first = latest.start();
    globalThis.fetch = async (_target, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    });
    const pending = readWebPage(url, 'user-key', first.signal);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    latest.start();
    await rejected;
    assert.equal(first.isCurrent(), false);
    console.log('Fetch URL tests passed (validation, auth, content cleanup, chunking, errors and cancellation).');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
