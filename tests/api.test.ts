import assert from 'assert';
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_API_URL,
  getApiEndpoint,
  getModelName,
  getRequestProviderPayload,
  loadAISettingsFromStorage,
  normalizeAIProvider,
  type StorageLike
} from '../app/services/api';
import {
  DEFAULT_AI_PROVIDER as SERVER_DEFAULT_AI_PROVIDER,
  GEMINI_OPENAI_API_URL,
  normalizeAIProvider as normalizeServerAIProvider,
  resolveProviderConfig,
  withProviderControls
} from '../app/api/_utils/providerConfig';

assert.strictEqual(getApiEndpoint('/analyze'), '/api/analyze');
assert.strictEqual(getApiEndpoint('/tts'), '/api/tts');
assert.strictEqual(getApiEndpoint('chat'), '/api/chat');

assert.strictEqual(DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(SERVER_DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(getModelName(), 'deepseek-v4-flash');
assert.strictEqual(normalizeAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeAIProvider('unknown'), 'deepseek');
assert.strictEqual(normalizeServerAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeServerAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeServerAIProvider('unknown'), 'deepseek');
assert.strictEqual(getModelName('deepseek'), 'deepseek-v4-flash');

assert.deepStrictEqual(getRequestProviderPayload('gemini'), {
  provider: 'gemini',
  model: 'gemini-3.5-flash',
  apiUrl: undefined,
});

assert.deepStrictEqual(getRequestProviderPayload('deepseek', 'https://api.deepseek.com/chat/completions'), {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  apiUrl: 'https://api.deepseek.com/chat/completions',
});

assert.deepStrictEqual(getRequestProviderPayload(), {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  apiUrl: undefined,
});

assert.deepStrictEqual(withProviderControls('gemini', { model: 'gemini-3.5-flash' }), {
  model: 'gemini-3.5-flash',
  reasoning_effort: 'minimal',
});

assert.deepStrictEqual(withProviderControls('deepseek', { model: 'deepseek-v4-flash' }), {
  model: 'deepseek-v4-flash',
  thinking: { type: 'disabled' },
});

const oldGeminiApiKey = process.env.GEMINI_API_KEY;
const oldGeminiApiUrl = process.env.GEMINI_API_URL;
const oldLegacyApiKey = process.env.API_KEY;
const oldLegacyApiUrl = process.env.API_URL;

try {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_URL;
  process.env.API_KEY = 'legacy-key';
  process.env.API_URL = 'https://legacy.example/chat/completions';

  const defaultGeminiConfig = resolveProviderConfig(
    { headers: new Headers() } as any,
    { provider: 'gemini' }
  );
  assert.strictEqual(defaultGeminiConfig.apiKey, '');
  assert.strictEqual(defaultGeminiConfig.apiUrl, GEMINI_OPENAI_API_URL);

  process.env.GEMINI_API_KEY = 'gemini-key';
  process.env.GEMINI_API_URL = 'https://gemini.example/chat/completions';

  const envGeminiConfig = resolveProviderConfig(
    { headers: new Headers() } as any,
    { provider: 'gemini' }
  );
  assert.strictEqual(envGeminiConfig.apiKey, 'gemini-key');
  assert.strictEqual(envGeminiConfig.apiUrl, 'https://gemini.example/chat/completions');
} finally {
  if (oldGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = oldGeminiApiKey;

  if (oldGeminiApiUrl === undefined) delete process.env.GEMINI_API_URL;
  else process.env.GEMINI_API_URL = oldGeminiApiUrl;

  if (oldLegacyApiKey === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = oldLegacyApiKey;

  if (oldLegacyApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = oldLegacyApiUrl;
}

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  constructor(initialValues: Record<string, string>) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const migratedStorage = new MemoryStorage({
  userApiKey: 'legacy-gemini-key',
  userApiUrl: 'https://legacy.example/v1/chat/completions',
  aiProvider: 'deepseek',
  deepseekApiKey: 'deepseek-key',
});
const migratedSettings = loadAISettingsFromStorage(migratedStorage);
assert.deepStrictEqual(migratedSettings, {
  aiProvider: 'deepseek',
  geminiApiKey: 'legacy-gemini-key',
  geminiApiUrl: 'https://legacy.example/v1/chat/completions',
  deepseekApiKey: 'deepseek-key',
  deepseekApiUrl: DEFAULT_API_URL,
});
assert.strictEqual(migratedStorage.getItem('geminiApiKey'), 'legacy-gemini-key');
assert.strictEqual(migratedStorage.getItem('geminiApiUrl'), 'https://legacy.example/v1/chat/completions');

const defaultStorage = new MemoryStorage({
  aiProvider: 'unknown',
});
const defaultSettings = loadAISettingsFromStorage(defaultStorage);
assert.strictEqual(defaultSettings.aiProvider, 'deepseek');
assert.strictEqual(defaultSettings.geminiApiUrl, DEFAULT_API_URL);
assert.strictEqual(defaultSettings.deepseekApiUrl, DEFAULT_API_URL);

console.log('All tests passed');
