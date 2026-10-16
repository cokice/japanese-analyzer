import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/tts/route';
import { createSpeechService, loadSpeechSettings, sanitizeSpeechSettings, normalizeSpeechEndpoint } from '../app/lib/speechServices';
import { getJapaneseTtsAudioUrl } from '../app/utils/helpers';

const request = (body: Record<string, unknown>, key = 'test-key') => new NextRequest('http://localhost/api/tts', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: key ? `Bearer ${key}` : '' }, body: JSON.stringify(body),
});
async function run() {
  const originalFetch = globalThis.fetch;
  const saved = { CODE: process.env.CODE, GEMINI_API_KEY: process.env.GEMINI_API_KEY, ALLOW_PRIVATE_BASE_URL: process.env.ALLOW_PRIVATE_BASE_URL };
  delete process.env.CODE; delete process.env.GEMINI_API_KEY; delete process.env.ALLOW_PRIVATE_BASE_URL;
  try {
    const legacy = new Map([['ttsProvider', 'gemini'], ['geminiApiKey', 'legacy-key'], ['ttsVoice', 'Puck']]);
    const migrated = loadSpeechSettings({ getItem: (key) => legacy.get(key) ?? null });
    assert.equal(migrated.activeId, 'gemini'); assert.equal(migrated.services[1].apiKey, 'legacy-key'); assert.equal(migrated.services[1].voice, 'Puck');
    const custom = { ...createSpeechService('minimax'), model: 'my-model', voice: 'my-voice' };
    const sanitized = sanitizeSpeechSettings({ services: [custom, custom, { ...custom, id: 'bad', provider: 'unsupported' }], activeId: custom.id })!;
    assert.equal(sanitized.services.length, 2); assert.equal(sanitized.activeId, custom.id);
    const reloaded = loadSpeechSettings({ getItem: (key) => key === 'speechSettings' ? JSON.stringify(sanitized) : null });
    assert.deepEqual(reloaded, sanitized);
    assert.equal(sanitizeSpeechSettings({ services: [], activeId: 'deleted' })?.activeId, 'edge');
    assert.equal(normalizeSpeechEndpoint('openai', 'https://speech.example/v1/audio/speech', 'custom'), 'https://speech.example/v1/audio/speech');
    assert.equal(normalizeSpeechEndpoint('gemini', 'https://speech.example/v1beta', 'new-model'), 'https://speech.example/v1beta/models/new-model:generateContent');

    const volc = createSpeechService('volcengine');
    assert.equal(sanitizeSpeechSettings({ services: [volc], activeId: volc.id })?.activeId, volc.id);
    assert.equal(normalizeSpeechEndpoint('volcengine', volc.baseUrl, volc.model), volc.baseUrl);
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), volc.baseUrl);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('X-Api-Key'), 'test-key');
      assert.equal(headers.get('X-Api-Resource-Id'), 'seed-tts-2.0');
      assert.equal(headers.get('Authorization'), null);
      assert.deepEqual(JSON.parse(String(init?.body)), { req_params: { text: '日本語', speaker: volc.voice, audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: 20 }, additions: JSON.stringify({ explicit_language: 'ja' }) } });
      const bytes = new TextEncoder().encode('{"code":0,"data":"SUQ="}\n{"code":0,"data":"Mw=="}\n{"code":20000000}');
      return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
    };
    const volcBody = { text: '日本語', provider: 'volcengine', model: volc.model, voice: volc.voice, speed: 1.2 };
    const volcano = await POST(request(volcBody));
    assert.equal(volcano.status, 200); assert.equal((await volcano.json()).audio, 'SUQz');
    for (const response of ['{"code":0,"data":"SUQz"}\n{"code":45000000,"message":"unauthorized voice"}', '{"code":0,"data":"SUQz"}', '{"code":0,"data":"bad!"}\n{"code":20000000}', '{"code":20000000}', 'not json']) {
      globalThis.fetch = async () => new Response(response);
      assert.equal((await POST(request(volcBody))).status, 502, 'Upstream errors or incomplete audio must not be treated as success');
    }
    globalThis.fetch = async () => { throw new Error('Incorrect Ark chat endpoint must never be called'); };
    const wrongArk = await POST(request({ text: '日本語', provider: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', model: volc.model }));
    assert.equal(wrongArk.status, 400);
    assert.match((await wrongArk.json()).error.message, /Agent Plan/);

    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://speech.example/v1/audio/speech');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key');
      assert.equal(init?.redirect, 'error');
      assert.deepEqual(JSON.parse(String(init?.body)), { model: 'custom-tts', input: '日本語', voice: 'custom-voice', speed: 1.2, response_format: 'mp3' });
      return new Response(new Uint8Array([73, 68, 51]), { headers: { 'Content-Type': 'audio/mpeg' } });
    };
    const body = { text: '日本語', provider: 'openai', baseUrl: 'https://speech.example/v1', model: 'custom-tts', voice: 'custom-voice', speed: 1.2 };
    const openai = await POST(request(body)); assert.equal(openai.status, 200); assert.equal((await openai.json()).audio, 'SUQz');
    for (const patch of [{ baseUrl: 'http://127.0.0.1:9000' }, { baseUrl: 'https://u:p@speech.example/v1' }, { voice: '' }, { speed: -1 }, { text: 'x'.repeat(4097) }, { rate: 'fast' }]) {
      assert.equal((await POST(request({ ...body, ...patch }))).status, 400);
    }
    assert.equal(calls, 1, 'Invalid settings must never contact the upstream');
    globalThis.fetch = async () => Response.json({ error: { message: 'not audio' } });
    assert.equal((await POST(request(body))).status, 502);
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://speech.example/v1/t2a_v2');
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, 'my-model'); assert.equal(payload.voice_setting.voice_id, 'my-voice'); assert.equal(payload.output_format, 'hex'); assert.equal(payload.language_boost, 'Japanese');
      return Response.json({ base_resp: { status_code: 0 }, data: { audio: '494433' } });
    };
    const minimax = await POST(request({ text: '日本語', provider: 'minimax', baseUrl: 'https://speech.example/v1', model: 'my-model', voice: 'my-voice' }));
    assert.equal(minimax.status, 200); assert.equal((await minimax.json()).audio, 'SUQz');
    globalThis.fetch = async () => Response.json({ base_resp: { status_code: 1008, status_msg: 'Insufficient balance' } });
    assert.equal((await POST(request({ ...body, provider: 'minimax' }))).status, 502);
    globalThis.fetch = async () => Response.json({ base_resp: { status_code: 0 }, data: { audio: 'abc' } });
    assert.equal((await POST(request({ ...body, provider: 'minimax' }))).status, 502);
    process.env.GEMINI_API_KEY = 'server-secret';
    globalThis.fetch = async () => { throw new Error('Server credential must not be sent to a custom host'); };
    assert.equal((await POST(request({ ...body, provider: 'gemini' }, ''))).status, 400);
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://speech.example/v1beta/models/custom-gemini:generateContent');
      assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-key');
      assert.equal(JSON.parse(String(init?.body)).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'NewVoice');
      return Response.json({ candidates: [{ content: { parts: [{ text: 'metadata' }, { inlineData: { data: 'AQI=', mimeType: 'audio/L16;rate=24000' } }] } }] });
    };
    assert.equal((await POST(request({ ...body, provider: 'gemini', baseUrl: 'https://speech.example/v1beta', model: 'custom-gemini', voice: 'NewVoice' }))).status, 200);

    for (const mimeType of ['audio/mpeg', 'audio/wav', 'audio/L16;rate=24000']) {
      globalThis.fetch = async () => Response.json({ audio: 'AQI=', mimeType });
      const url = await getJapaneseTtsAudioUrl('日本語', 'test-key', 'gemini');
      try {
        const bytes = new Uint8Array(await (await originalFetch(url)).arrayBuffer());
        assert.equal(bytes.length, mimeType.includes('L16') ? 46 : 2, 'Only raw PCM should gain a WAV header');
      } finally { URL.revokeObjectURL(url); }
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.log('Speech tests passed: migration, persistence, custom models/voices, protocol payloads, URL validation, key isolation, error responses, and audio formats.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
