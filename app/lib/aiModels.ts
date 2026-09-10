export type AIProvider = 'gemini' | 'deepseek';
export type GeminiModelName = 'gemini-3.7-flash' | 'gemini-3.5-flash-lite';
export type DeepSeekModelName = 'deepseek-flash';
export type AIModelName = GeminiModelName | DeepSeekModelName;
export type ImageRecognitionModelName = GeminiModelName | typeof DEEPSEEK_VISION_MODEL_NAME;

export const DEFAULT_AI_PROVIDER: AIProvider = 'deepseek';
export const GEMINI_MODEL_NAME: GeminiModelName = 'gemini-3.7-flash';
export const DEEPSEEK_MODEL_NAME: DeepSeekModelName = 'deepseek-flash';
export const DEEPSEEK_VISION_MODEL_NAME = DEEPSEEK_MODEL_NAME;
export const GEMINI_MODEL_OPTIONS: GeminiModelName[] = ['gemini-3.7-flash', 'gemini-3.5-flash-lite'];
export const DEEPSEEK_MODEL_OPTIONS: DeepSeekModelName[] = ['deepseek-flash'];

export function normalizeAIProvider(value?: unknown): AIProvider {
  return value === 'gemini' || value === 'deepseek' ? value : DEFAULT_AI_PROVIDER;
}

export function normalizeAIModel(
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  value?: unknown
): AIModelName {
  const model = typeof value === 'string' ? value.trim() : '';

  if (provider === 'deepseek') {
    return DEEPSEEK_MODEL_OPTIONS.includes(model as DeepSeekModelName)
      ? model as DeepSeekModelName
      : DEEPSEEK_MODEL_NAME;
  }

  return GEMINI_MODEL_OPTIONS.includes(model as GeminiModelName)
    ? model as GeminiModelName
    : GEMINI_MODEL_NAME;
}

export function getModelName(
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: unknown
): AIModelName {
  return normalizeAIModel(provider, model);
}

export function getImageRecognitionModelName(
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: unknown
): ImageRecognitionModelName {
  return provider === 'deepseek'
    ? DEEPSEEK_VISION_MODEL_NAME
    : normalizeAIModel(provider, model) as GeminiModelName;
}
