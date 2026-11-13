import { type TTSProvider } from '../lib/apiTypes';
import { getApiEndpoint, getHeaders } from './request';
import { apiErrorFromResponse } from '../utils/requestErrors';

// 合成语音
export async function synthesizeSpeech(
  text: string,
  provider: TTSProvider = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number; style?: string; signal?: AbortSignal } = {},
  userApiKey?: string
): Promise<{ audio: string; mimeType: string }> {
  const { gender = 'female', voice = provider === 'deepseek' ? 'stella' : 'Kore', rate = 0, pitch = 0, style = '' } = options;

  const apiUrl = getApiEndpoint('/tts');
  const headers = getHeaders(userApiKey);

  const response = await fetch(apiUrl, {
    method: 'POST',
    signal: options.signal,
    headers,
    body: JSON.stringify({ 
      text, 
      provider,
      gender,
      voice,
      rate,
      pitch,
      style
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw apiErrorFromResponse(errorData, response.status);
  }

  return response.json();
}
