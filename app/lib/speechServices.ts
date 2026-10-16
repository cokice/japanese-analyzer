import { createCustomProfileId } from './aiModels';

export type SpeechProtocol = 'edge' | 'gemini' | 'openai' | 'minimax' | 'volcengine';
export interface SpeechService {
  id: string;
  name: string;
  provider: SpeechProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  speed: number;
}
export interface SpeechSettings { services: SpeechService[]; activeId: string }
export const SPEECH_SETTINGS_KEY = 'speechSettings';
export const SPEECH_PRESETS: readonly SpeechService[] = [
  { id: 'edge', name: 'Edge TTS', provider: 'edge', baseUrl: '', apiKey: '', model: 'edge-tts', voice: 'ja-JP-NanamiNeural', speed: 1 },
  { id: 'gemini', name: 'Gemini TTS', provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: '', model: 'gemini-3.1-flash-tts-preview', voice: 'Kore', speed: 1 },
  { id: 'openai', name: 'OpenAI TTS', provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini-tts', voice: 'alloy', speed: 1 },
  { id: 'minimax', name: 'MiniMax TTS', provider: 'minimax', baseUrl: 'https://api.minimax.cn/v1', apiKey: '', model: 'speech-2.8-hd', voice: 'Japanese_KindLady', speed: 1 },
  { id: 'volcengine', name: '火山引擎 Agent Plan', provider: 'volcengine', baseUrl: 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional', apiKey: '', model: 'doubao-seed-tts-2.0', voice: 'zh_female_vv_uranus_bigtts', speed: 1 },
];
export const SPEECH_VOICES: Record<SpeechProtocol, readonly string[]> = {
  edge: ['ja-JP-NanamiNeural', 'ja-JP-KeitaNeural'],
  gemini: ['Kore', 'Puck', 'Zephyr', 'Aoede', 'Leda', 'Charon'],
  openai: ['alloy', 'coral', 'nova', 'shimmer', 'marin', 'cedar'],
  minimax: ['Japanese_KindLady', 'Japanese_CalmLady', 'Japanese_GentleButler', 'Japanese_OptimisticYouth'],
  volcengine: ['zh_female_vv_uranus_bigtts', 'zh_female_gaolengyujie_uranus_bigtts'],
};
export function createSpeechService(provider: SpeechProtocol = 'openai'): SpeechService {
  return { ...SPEECH_PRESETS.find((preset) => preset.provider === provider)!, id: createCustomProfileId('speech') };
}
export function sanitizeSpeechSettings(raw: unknown): SpeechSettings | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as SpeechSettings).services)) return null;
  const settings = raw as SpeechSettings;
  const services: SpeechService[] = [{ ...SPEECH_PRESETS[0] }];
  const ids = new Set(['edge']);
  for (const item of settings.services) {
    if (!item || typeof item !== 'object' || !['gemini', 'openai', 'minimax', 'volcengine'].includes(item.provider)) continue;
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) continue;
    if (![item.baseUrl, item.model, item.voice].every((value) => typeof value === 'string' && value.trim())) continue;
    ids.add(item.id);
    services.push({ id: item.id, name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.model.trim(), provider: item.provider,
      baseUrl: item.baseUrl.trim(), apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : '', model: item.model.trim(), voice: item.voice.trim(),
      speed: typeof item.speed === 'number' && Number.isFinite(item.speed) ? Math.min(2, Math.max(0.5, item.speed)) : 1 });
  }
  return { services, activeId: services.some((item) => item.id === settings.activeId) ? settings.activeId : 'edge' };
}
export function loadSpeechSettings(storage: { getItem: (key: string) => string | null }): SpeechSettings {
  try {
    const raw = storage.getItem(SPEECH_SETTINGS_KEY);
    if (raw) {
      const sanitized = sanitizeSpeechSettings(JSON.parse(raw));
      if (sanitized) return sanitized;
    }
  } catch { /* Migrate the existing Edge/Gemini preferences. */ }
  return { services: [{ ...SPEECH_PRESETS[0] }, { ...SPEECH_PRESETS[1], apiKey: storage.getItem('geminiApiKey') || '', voice: storage.getItem('ttsVoice') || 'Kore' }],
    activeId: storage.getItem('ttsProvider') === 'gemini' ? 'gemini' : 'edge' };
}
export function normalizeSpeechEndpoint(provider: SpeechProtocol, baseUrl: string, model: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (provider === 'volcengine') return base.endsWith('/tts/unidirectional') ? base : `${base}/tts/unidirectional`;
  if (provider === 'gemini') return /\/models\/[^/]+:generateContent$/.test(base) ? base : `${base}/models/${encodeURIComponent(model)}:generateContent`;
  const suffix = provider === 'minimax' ? '/t2a_v2' : '/audio/speech';
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}
