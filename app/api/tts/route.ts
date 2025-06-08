import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY || '';
const MODEL_NAME = 'gemini-2.5-flash-preview-tts';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GENERATE_ENDPOINT = 'streamGenerateContent';

export async function POST(req: NextRequest) {
  try {
    const { text, voice = 'Zephyr', model = MODEL_NAME } = await req.json();

    const authHeader = req.headers.get('Authorization');
    const userApiKey = authHeader ? authHeader.replace('Bearer ', '') : '';
    const effectiveApiKey = userApiKey || API_KEY;
    if (!effectiveApiKey) {
      return NextResponse.json({ error: { message: '未提供API密钥' } }, { status: 500 });
    }

    if (!text) {
      return NextResponse.json({ error: { message: '缺少必要的文本内容' } }, { status: 400 });
    }

    const url = `${BASE_URL}/models/${model}:${GENERATE_ENDPOINT}?key=${effectiveApiKey}`;

    const payload = {
      contents: [
        { role: 'user', parts: [{ text }] }
      ],
      generationConfig: {
        responseModalities: ['audio'],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: voice }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: '无法解析错误响应' };
      }
      return NextResponse.json({ error: errorData.error || errorData }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (error) {
    console.error('Server error (TTS):', error);
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : '服务器错误' } }, { status: 500 });
  }
}
