import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { serverKeyRateLimitResponse, reserveServerKeyRequest } from '../_utils/serverKeyRateLimit';
import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { NextRequest, NextResponse } from 'next/server';
import { createUpstreamSignal, isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';
import { DEEPSEEK_VOICES, GEMINI_TTS_MODEL_NAME } from '../../lib/tts';

// API配置
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL_NAME}:generateContent`;
const EDGE_TTS_URL = 'https://api.howen.ink/api/tts';
const MODEL_NAME = GEMINI_TTS_MODEL_NAME;

// Edge TTS 声音配置
const EDGE_VOICES = {
  male: 'ja-JP-KeitaNeural',
  female: 'ja-JP-NanamiNeural'
};

// Gemini TTS 声音配置
const GEMINI_VOICES = [
  'Kore', 'Puck', 'Zephyr', 'Aoede', 'Leda', 'Charon'
];

export async function POST(req: NextRequest) {
  try {
    const authError = requireApiSession(req);
    if (authError) return authError;

    const { text, provider = 'edge', gender = 'female', voice = provider === 'deepseek' ? 'stella' : 'Kore', model = MODEL_NAME, rate = 0, pitch = 0, style = '' } = await readJsonBody(req);

    if (typeof text !== 'string' || !text.trim()) {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }

    if (provider !== 'edge' && provider !== 'gemini' && provider !== 'deepseek') {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }

    if (provider === 'deepseek') {
      if (!DEEPSEEK_VOICES.includes(voice as 'stella' | 'tide') ||
          Buffer.byteLength(JSON.stringify({ text, voice_id: voice, format: 'wav', filter_markdown: true })) > 64 * 1024 ||
          Array.from(text).reduce((count, char) => count + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0) > 10000) {
        return apiErrorResponse('INVALID_REQUEST', 400);
      }
      const apiKey = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) return apiErrorResponse('MISSING_API_KEY', 500);
      reserveServerKeyRequest(req);
      const response = await fetch('https://api.deepseek.com/v1/tools/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ text, voice_id: voice, format: 'wav', filter_markdown: true }),
        signal: AbortSignal.any([req.signal, createUpstreamSignal()!]),
      });
      if (!response.ok) return upstreamErrorResponse(response.status);
      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' ||
          (audio.readUInt32LE(4) !== 0xffffffff && audio.readUInt32LE(4) + 8 > audio.length)) {
        return apiErrorResponse('INVALID_RESPONSE', 502);
      }
      return NextResponse.json({ audio: audio.toString('base64'), mimeType: 'audio/wav' });
    }

    if (provider === 'edge') {
      // 使用 Edge TTS
      if (!EDGE_VOICES[gender as keyof typeof EDGE_VOICES]) {
        return apiErrorResponse('INVALID_REQUEST', 400);
      }

      const payload = {
        text,
        voice: EDGE_VOICES[gender as keyof typeof EDGE_VOICES],
        rate,
        pitch
      };

      const response = await fetch(process.env.EDGE_TTS_URL || EDGE_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([req.signal, createUpstreamSignal()!])
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('Edge TTS API error:', data);
        return upstreamErrorResponse(response.status);
      }

      const audioBuffer = await response.arrayBuffer();

      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return apiErrorResponse('INVALID_RESPONSE', 500);
      }

      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      return NextResponse.json({
        audio: base64Audio,
        mimeType: response.headers.get('content-type') || 'audio/mpeg'
      });

    } else if (provider === 'gemini') {
      // 使用 Gemini TTS
      const authHeader = req.headers.get('Authorization');
      const userApiKey = authHeader ? authHeader.replace('Bearer ', '') : '';
      const effectiveApiKey = userApiKey || process.env.GEMINI_API_KEY || '';
      const modelName = typeof model === 'string' ? model.trim() : '';

      if (!effectiveApiKey) {
        return apiErrorResponse('MISSING_API_KEY', 500);
      }

      if (modelName !== MODEL_NAME) {
        return apiErrorResponse('INVALID_REQUEST', 400);
      }

      if (typeof voice !== 'string' || !GEMINI_VOICES.includes(voice)) {
        return apiErrorResponse('INVALID_REQUEST', 400);
      }

      if (typeof style !== 'string') {
        return apiErrorResponse('INVALID_REQUEST', 400);
      }

      reserveServerKeyRequest(req);

      const payload = {
        contents: [{ parts: [{ text, ...(style.trim() ? { speech_metadata: { style: style.trim() } } : {}) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
          }
        },
        model: modelName
      };

      const response = await fetch(GEMINI_TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': effectiveApiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([req.signal, createUpstreamSignal()!])
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('Gemini TTS API error:', data);
        return upstreamErrorResponse(response.status);
      }

      const result = await response.json();
      const inlineData = result.candidates?.[0]?.content?.parts?.find(
        (part: { inlineData?: { data?: string; mimeType?: string } }) =>
          typeof part.inlineData?.data === 'string' && part.inlineData.data.length > 0 &&
          typeof part.inlineData.mimeType === 'string' && part.inlineData.mimeType.startsWith('audio/')
      )?.inlineData;
      if (!inlineData) {
        return apiErrorResponse('INVALID_RESPONSE', 500);
      }

      return NextResponse.json({ audio: inlineData.data, mimeType: inlineData.mimeType });
    }

    return apiErrorResponse('INVALID_REQUEST', 400);
  } catch (error) {
    const quotaError = serverKeyRateLimitResponse(error);
    if (quotaError) return quotaError;
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (isUpstreamTimeoutError(error)) {
      return apiErrorResponse('UPSTREAM_TIMEOUT', 504);
    }

    console.error('Server error (TTS):', error);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
}
