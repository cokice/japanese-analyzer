export type AIProvider = 'gemini' | 'deepseek';
export type GeminiModelName = 'gemini-3.5-flash' | 'gemini-3.1-flash-lite';
export type DeepSeekModelName = 'deepseek-v4-flash' | 'deepseek-v4-pro';
export type AIModelName = GeminiModelName | DeepSeekModelName;

export const DEFAULT_AI_PROVIDER: AIProvider = 'deepseek';
export const GEMINI_MODEL_NAME: GeminiModelName = 'gemini-3.5-flash';
export const DEEPSEEK_MODEL_NAME: DeepSeekModelName = 'deepseek-v4-flash';
export const GEMINI_MODEL_OPTIONS: GeminiModelName[] = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
export const DEEPSEEK_MODEL_OPTIONS: DeepSeekModelName[] = ['deepseek-v4-flash', 'deepseek-v4-pro'];

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
