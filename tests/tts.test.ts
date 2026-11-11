import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/tts/route';
import { getJapaneseTtsAudioUrl } from '../app/utils/helpers';

const text = '今日はいい天気ですね。';
const pcm = Buffer.from([0, 0, 0, 16, 0, 32, 0, 16]);
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0);
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
wav.writeUInt32LE(pcm.length, 40);
pcm.copy(wav, 44);

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
    body: JSON.stringify({ provider: 'gemini', text, ...body }),
  });
}

async function run() {
  const originalFetch = globalThis.fetch;
  const originalCode = process.env.CODE;
  const originalEdgeUrl = process.env.EDGE_TTS_URL;
  try {
    delete process.env.CODE;
    // Exercise client -> route -> upstream -> browser Blob, including style separation.
    for (const [style, voice] of [['', 'Kore'], ['Speak slowly.', 'Puck'], ['Speak clearly.', 'Aoede']]) {
      const controller = new AbortController();
      globalThis.fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        if (String(url) === '/api/tts') {
          assert.equal(body.text, text);
          assert.equal(body.style, style);
          assert.equal(init?.signal, controller.signal);
          return POST(new NextRequest('http://localhost/api/tts', init));
        }
        assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent');
        assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-key');
        assert.equal(body.model, 'gemini-3.8-flash-lite-tts');
        assert.deepEqual(body.contents, [{ parts: [{ text, ...(style ? { speech_metadata: { style } } : {}) }] }]);
        assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, voice);
        assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
        return Response.json({ candidates: [{ content: { parts: [
          { text: 'non-audio metadata' },
          { inlineData: { data: wav.toString('base64'), mimeType: 'audio/wav' } },
        ] } }] });
      };
      const url = await getJapaneseTtsAudioUrl(text, 'test-key', 'gemini', { style, voice, signal: controller.signal });
      try {
        const audio = await originalFetch(url);
        assert.equal(audio.headers.get('content-type'), 'audio/wav');
        assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wav, 'WAV bytes must not gain a second header');
      } finally { URL.revokeObjectURL(url); }
    }

    // Keep support for raw PCM, including its actual sample rate.
    globalThis.fetch = async () => Response.json({ audio: pcm.toString('base64'), mimeType: 'audio/L16;codec=pcm;rate=16000' });
    const pcmUrl = await getJapaneseTtsAudioUrl(text, 'test-key', 'gemini');
    try {
      const output = Buffer.from(await (await originalFetch(pcmUrl)).arrayBuffer());
      assert.equal(output.toString('ascii', 0, 4), 'RIFF');
      assert.equal(output.readUInt32LE(24), 16000);
      assert.equal(output.readUInt32LE(40), pcm.length);
      assert.deepEqual(output.subarray(44), pcm);
    } finally { URL.revokeObjectURL(pcmUrl); }

    // Edge still sends its own voice controls and plays compressed audio unchanged.
    const mp3 = Buffer.from('ID3test-audio');
    for (const endpoint of [undefined, 'https://tts.example.org/speech']) {
      if (endpoint) process.env.EDGE_TTS_URL = endpoint; else delete process.env.EDGE_TTS_URL;
      globalThis.fetch = async (url, init) => {
        if (String(url) === '/api/tts') {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.provider, 'edge');
          assert.equal(body.gender, 'male');
          return POST(new NextRequest('http://localhost/api/tts', init));
        }
        assert.equal(String(url), endpoint || 'https://api.howen.ink/api/tts');
        assert.deepEqual(JSON.parse(String(init?.body)), { text, voice: 'ja-JP-KeitaNeural', rate: -20, pitch: 0 });
        assert.ok(init?.signal);
        return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
      };
      const edgeUrl = await getJapaneseTtsAudioUrl(text, undefined, 'edge', { gender: 'male', rate: -20 });
      try {
        assert.deepEqual(Buffer.from(await (await originalFetch(edgeUrl)).arrayBuffer()), mp3);
      } finally { URL.revokeObjectURL(edgeUrl); }
    }
    globalThis.fetch = async (url, init) => String(url) === '/api/tts'
      ? POST(new NextRequest('http://localhost/api/tts', init))
      : Response.json({ error: 'TTS unavailable' }, { status: 503 });
    await assert.rejects(getJapaneseTtsAudioUrl(text, undefined, 'edge'), /TTS unavailable/);
    globalThis.fetch = async (url, init) => String(url) === '/api/tts'
      ? POST(new NextRequest('http://localhost/api/tts', init)) : new Response('');
    await assert.rejects(getJapaneseTtsAudioUrl(text, undefined, 'edge'), /无有效音频/);

    globalThis.fetch = async () => { throw new Error('Invalid input must not contact upstream'); };
    for (const body of [{ model: 'other-model' }, { voice: 'invalid' }, { style: {} }, { text: {} }, { text: '  ' }]) {
      assert.equal((await POST(request(body))).status, 400);
    }
    for (const parts of [[], [{ inlineData: { data: '', mimeType: 'audio/wav' } }], [{ inlineData: { data: 'AA==', mimeType: 'image/png' } }]]) {
      globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts } }] });
      assert.equal((await POST(request({}))).status, 500);
    }
    console.log('TTS migration tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEdgeUrl === undefined) delete process.env.EDGE_TTS_URL; else process.env.EDGE_TTS_URL = originalEdgeUrl;
    if (originalCode === undefined) delete process.env.CODE;
    else process.env.CODE = originalCode;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
