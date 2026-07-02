import { NextRequest, NextResponse } from 'next/server';
import { createUpstreamSignal, isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';

// API配置
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent';
const EDGE_TTS_URL = 'https://api.howen.ink/api/tts';
const MODEL_NAME = 'gemini-3.1-flash-tts-preview';

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

    const { text, provider = 'edge', gender = 'female', voice = 'Kore', model = MODEL_NAME, rate = 0, pitch = 0 } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: { message: '缺少必要的文本内容' } },
        { status: 400 }
      );
    }

    if (provider !== 'edge' && provider !== 'gemini') {
      return NextResponse.json(
        { error: { message: '不支持的TTS提供商' } },
        { status: 400 }
      );
    }

    if (provider === 'edge') {
      // 使用 Edge TTS
      if (!EDGE_VOICES[gender as keyof typeof EDGE_VOICES]) {
        return NextResponse.json(
          { error: { message: '不支持的声音类型，请使用 male 或 female' } },
          { status: 400 }
        );
      }

      const payload = {
        text,
        voice: EDGE_VOICES[gender as keyof typeof EDGE_VOICES],
        rate,
        pitch
      };

      const response = await fetch(EDGE_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: createUpstreamSignal()
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('Edge TTS API error:', data);
        const message = typeof data.error === 'string'
          ? data.error
          : data.error?.message || `Edge TTS 请求失败（HTTP ${response.status}）`;
        return NextResponse.json(
          { error: { message } },
          { status: response.status }
        );
      }

      const audioBuffer = await response.arrayBuffer();
      
      if (!audioBuffer || audioBuffer.byteLength === 0) {
        return NextResponse.json(
          { error: { message: '无有效音频数据' } },
          { status: 500 }
        );
      }

      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      return NextResponse.json({ 
        audio: base64Audio, 
        mimeType: 'audio/mp3' 
      });

    } else if (provider === 'gemini') {
      // 使用 Gemini TTS
      const authHeader = req.headers.get('Authorization');
      const userApiKey = authHeader ? authHeader.replace('Bearer ', '') : '';
      const effectiveApiKey = userApiKey || process.env.GEMINI_API_KEY || '';
      const modelName = typeof model === 'string' ? model.trim() : '';

      if (!effectiveApiKey) {
        return NextResponse.json(
          { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
          { status: 500 }
        );
      }

      if (modelName !== MODEL_NAME) {
        return NextResponse.json(
          { error: { message: '不支持的Gemini TTS模型' } },
          { status: 400 }
        );
      }

      if (!GEMINI_VOICES.includes(voice)) {
        return NextResponse.json(
          { error: { message: '不支持的Gemini语音类型' } },
          { status: 400 }
        );
      }

      const payload = {
        contents: [{ parts: [{ text }] }],
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
        signal: createUpstreamSignal()
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('Gemini TTS API error:', data);
        return NextResponse.json(
          { error: data.error || { message: 'Gemini TTS 请求失败' } },
          { status: response.status }
        );
      }

      const result = await response.json();
      const inlineData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData) {
        return NextResponse.json(
          { error: { message: '无有效音频数据' } },
          { status: 500 }
        );
      }

      return NextResponse.json({ audio: inlineData.data, mimeType: inlineData.mimeType });
    }

  } catch (error) {
    if (isUpstreamTimeoutError(error)) {
      return NextResponse.json(
        { error: { message: '上游 TTS 请求超时，请稍后重试。' } },
        { status: 504 }
      );
    }

    console.error('Server error (TTS):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
