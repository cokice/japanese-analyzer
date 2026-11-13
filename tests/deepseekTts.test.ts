import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as tts } from '../app/api/tts/route';
import { getJapaneseTtsAudioUrl } from '../app/utils/helpers';

async function run() {
  const originalFetch = globalThis.fetch;
  const originalCode = process.env.CODE;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  // A minimal valid PCM WAV fixture for the TTS response.
  const wav = Buffer.alloc(48);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(4, 40);
  const makeTts = (extra: Record<string, unknown> = {}) => new NextRequest('http://localhost/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer personal-key' },
    body: JSON.stringify({ text: 'こんにちは。', provider: 'deepseek', ...extra }),
  });
  try {
    delete process.env.CODE;
    process.env.DEEPSEEK_API_KEY = 'server-key';
    for (const voice of ['stella', 'tide']) {
      globalThis.fetch = async (url, init) => {
        if (String(url) === '/api/tts') return tts(new NextRequest('http://localhost/api/tts', { ...init, signal: init?.signal ?? undefined }));
        assert.equal(String(url), 'https://api.deepseek.com/v1/tools/tts');
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer personal-key');
        assert.deepEqual(JSON.parse(String(init?.body)), { text: 'こんにちは。', voice_id: voice, format: 'wav', filter_markdown: true });
        return new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
      };
      const url = await getJapaneseTtsAudioUrl('こんにちは。', 'personal-key', 'deepseek', { voice });
      try { assert.deepEqual(Buffer.from(await (await originalFetch(url)).arrayBuffer()), wav); } finally { URL.revokeObjectURL(url); }
    }
    globalThis.fetch = async () => { throw new Error('Invalid input must not reach upstream'); };
    assert.equal((await tts(makeTts({ voice: 'Kore' }))).status, 400);
    assert.equal((await tts(makeTts({ text: '漢'.repeat(5001) }))).status, 400);
    delete process.env.DEEPSEEK_API_KEY;
    process.env.CODE = 'test-password';
    assert.equal((await tts(makeTts())).status, 401);
    delete process.env.CODE;
    for (const status of [400, 429, 503, 504]) {
      globalThis.fetch = async () => new Response(null, { status });
      assert.equal((await tts(makeTts())).status, status);
    }
    globalThis.fetch = async () => new Response(wav.slice(0, 45));
    assert.equal((await tts(makeTts())).status, 502);
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    assert.equal((await tts(makeTts())).status, 504);
    console.log('DeepSeek TTS tests passed (both voices, auth, limits and errors).');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCode === undefined) delete process.env.CODE; else process.env.CODE = originalCode;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
