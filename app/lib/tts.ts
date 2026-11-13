import { type TTSProvider } from './apiTypes';
export const GEMINI_TTS_MODEL_NAME = 'gemini-3.8-flash-lite-tts';

const EDGE_TTS_MODEL_NAME = 'edge-tts';

export function getTtsModelName(provider: TTSProvider = 'edge'): string {
  return provider === 'gemini' ? GEMINI_TTS_MODEL_NAME : EDGE_TTS_MODEL_NAME;
}
