import { type TTSProvider } from './apiTypes';
export const DEEPSEEK_VOICES = ['stella', 'tide'] as const;
export const GEMINI_TTS_MODEL_NAME = 'gemini-3.8-flash-lite-tts';

const EDGE_TTS_MODEL_NAME = 'edge-tts';

export function getTtsModelName(provider: TTSProvider = 'edge'): string {
  if (provider === 'deepseek') return 'deepseek-tts';
  return provider === 'gemini' ? GEMINI_TTS_MODEL_NAME : EDGE_TTS_MODEL_NAME;
}
