import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { NextRequest, NextResponse } from 'next/server';
import { createUpstreamSignal, isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';
import { BaseUrlError, validateBaseUrl } from '../_utils/validateBaseUrl';
import { normalizeSpeechEndpoint, SPEECH_PRESETS, type SpeechProtocol } from '../../lib/speechServices';
import { readVolcengineAudio } from '../_utils/volcengineSpeech';

const EDGE_TTS_URL = 'https://api.howen.ink/api/tts';
const EDGE_VOICES = { male: 'ja-JP-KeitaNeural', female: 'ja-JP-NanamiNeural' };
const failure = (message: string, status = 400) => NextResponse.json({ error: { message } }, { status });

export async function POST(req: NextRequest) {
  try {
    const authError = requireApiSession(req);
    if (authError) return authError;
    const body = await readJsonBody(req);
    const { text, provider = 'edge', gender = 'female', rate = 0, pitch = 0 } = body;
    if (typeof text !== 'string' || !text.trim()) return failure('缺少必要的文本内容');
    if (text.length > 50_000) return failure('朗读文本过长，请分段朗读');
    if (typeof provider !== 'string' || !['edge', 'gemini', 'openai', 'minimax', 'volcengine'].includes(provider)) return failure('不支持的TTS提供商');
    if (typeof rate !== 'number' || !Number.isFinite(rate) || typeof pitch !== 'number' || !Number.isFinite(pitch)) return failure('语音参数无效');
    const preset = SPEECH_PRESETS.find((item) => item.provider === provider)!;
    if ((body.model !== undefined && typeof body.model !== 'string') || (body.voice !== undefined && typeof body.voice !== 'string')) return failure('语音参数无效');
    const model = typeof body.model === 'string' ? body.model.trim() : preset.model;
    const voice = typeof body.voice === 'string' ? body.voice.trim() : preset.voice;
    const speed = body.speed ?? 1;
    if (!model || !voice || typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.5 || speed > 2) return failure('语音参数无效');
    let url: string;
    let payload: Record<string, unknown>;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'edge') {
      if (typeof gender !== 'string' || !Object.hasOwn(EDGE_VOICES, gender)) return failure('不支持的声音类型，请使用 male 或 female');
      if (rate < -100 || rate > 100 || pitch < -100 || pitch > 100) return failure('语音参数无效');
      url = EDGE_TTS_URL;
      payload = { text, voice: EDGE_VOICES[gender as keyof typeof EDGE_VOICES], rate, pitch };
    } else {
      const baseUrl = validateBaseUrl(body.baseUrl ?? preset.baseUrl);
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) return failure('语音服务地址不能包含凭据、查询参数或片段');
      if (provider === 'openai' && parsedUrl.hostname === 'ark.cn-beijing.volces.com') return failure('Agent Plan 语音不支持 OpenAI /audio/speech，请在接口类型选择火山引擎 Agent Plan，并使用其语音专用地址和音色');
      url = normalizeSpeechEndpoint(provider as SpeechProtocol, baseUrl, model);
      const apiKey = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
        || (provider === 'gemini' && baseUrl === preset.baseUrl ? process.env.GEMINI_API_KEY : '') || '';
      if (!apiKey) return failure('未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥');
      if (provider === 'gemini') {
        headers['x-goog-api-key'] = apiKey;
        payload = { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
      } else if (provider === 'volcengine') {
        if (!['doubao-seed-tts-2.0', 'seed-tts-2.0'].includes(model)) return failure('Agent Plan 语音模型请使用 doubao-seed-tts-2.0');
        headers['X-Api-Key'] = apiKey;
        headers['X-Api-Resource-Id'] = 'seed-tts-2.0';
        headers['X-Api-Request-Id'] = crypto.randomUUID();
        payload = { req_params: { text, speaker: voice, audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: Math.round((speed - 1) * 100) }, additions: JSON.stringify({ explicit_language: 'ja' }) } };
      } else {
        headers.Authorization = `Bearer ${apiKey}`;
        if (provider === 'openai') {
          if (text.length > 4096) return failure('此语音接口每次最多支持 4096 个字符，请分段朗读');
          payload = { model, input: text, voice, speed, response_format: 'mp3' };
        } else {
          payload = { model, text, stream: false, output_format: 'hex', language_boost: 'Japanese', voice_setting: { voice_id: voice, speed, vol: 1, pitch }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } };
        }
      }
    }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.any([req.signal, createUpstreamSignal()!]) });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return failure(typeof data?.error === 'string' ? data.error : data?.error?.message || (typeof data?.message === 'string' ? data.message : '') || `TTS 请求失败（HTTP ${response.status}）`, response.status);
    }
    if (provider === 'volcengine') {
      try {
        const audio = await readVolcengineAudio(response);
        return NextResponse.json({ audio: audio.toString('base64'), mimeType: 'audio/mpeg' });
      } catch (error) {
        if (req.signal.aborted || isUpstreamTimeoutError(error)) throw error;
        return failure(error instanceof Error ? error.message : '语音接口未返回有效音频', 502);
      }
    }
    if (provider === 'edge' || provider === 'openai') {
      const contentType = response.headers.get('content-type') || '';
      if (provider === 'openai' && !/^(audio\/|application\/octet-stream)/i.test(contentType)) return failure('语音接口未返回有效音频', 502);
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) return failure('无有效音频数据', 502);
      return NextResponse.json({ audio: audio.toString('base64'), mimeType: contentType.startsWith('audio/') ? contentType.split(';')[0] : 'audio/mpeg' });
    }
    const result = await response.json().catch(() => null);
    if (!result || typeof result !== 'object') return failure('语音接口未返回有效音频', 502);
    if (provider === 'minimax') {
      if (result.base_resp?.status_code !== 0) return failure(result.base_resp?.status_msg || '语音接口未返回有效音频', 502);
      const hex = result.data?.audio;
      if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(hex)) return failure('无有效音频数据', 502);
      return NextResponse.json({ audio: Buffer.from(hex, 'hex').toString('base64'), mimeType: 'audio/mpeg' });
    }
    const inlineData = result.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { mimeType?: string } }) => part.inlineData?.mimeType?.startsWith('audio/'))?.inlineData;
    if (typeof inlineData?.data !== 'string' || !inlineData.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(inlineData.data)) return failure('无有效音频数据', 502);
    return NextResponse.json({ audio: inlineData.data, mimeType: inlineData.mimeType });
  } catch (error) {
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof BaseUrlError) return failure(error.message, error.status);
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (isUpstreamTimeoutError(error)) return failure('上游 TTS 请求超时，请稍后重试。', 504);
    return failure(error instanceof Error ? error.message : '服务器错误', 500);
  }
}
