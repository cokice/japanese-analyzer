import assert from 'assert';
import {
  DEFAULT_AI_PROVIDER,
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
  ProviderConfigError,
  normalizeAIProvider as normalizeServerAIProvider,
  resolveProviderConfig,
  withProviderControls
} from '../app/api/_utils/providerConfig';
import {
  buildUmamiLoaderScript,
  resolveUmamiConfig
} from '../app/api/_utils/umami';
import {
  ANALYZE_USAGE_EVENT_NAME,
  getAnalyzeUsageEvent
} from '../app/utils/analytics';

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

assert.strictEqual(resolveUmamiConfig({}), null);
assert.strictEqual(resolveUmamiConfig({
  NEXT_PUBLIC_UMAMI_SRC: 'https://cloud.umami.is/script.js',
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: '',
}), null);
assert.deepStrictEqual(resolveUmamiConfig({
  NEXT_PUBLIC_UMAMI_SRC: ' https://cloud.umami.is/script.js ',
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: ' site-id ',
}), {
  src: 'https://cloud.umami.is/script.js',
  websiteId: 'site-id',
});

const umamiLoaderScript = buildUmamiLoaderScript({
  src: 'https://umami.example/script.js',
  websiteId: 'site"id',
});
assert.strictEqual(buildUmamiLoaderScript(null), 'void 0;');
assert.ok(umamiLoaderScript.includes('document.createElement'));
assert.ok(umamiLoaderScript.includes(JSON.stringify('https://umami.example/script.js')));
assert.ok(umamiLoaderScript.includes(JSON.stringify('site"id')));

assert.deepStrictEqual(getAnalyzeUsageEvent('gemini'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
  },
});

assert.deepStrictEqual(getAnalyzeUsageEvent('deepseek'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  },
});

assert.deepStrictEqual(getRequestProviderPayload('gemini'), {
  provider: 'gemini',
  model: 'gemini-3.5-flash',
});

assert.deepStrictEqual(getRequestProviderPayload('deepseek'), {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
});

assert.deepStrictEqual(getRequestProviderPayload(), {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
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
const createProviderConfigRequest = () => (
  { headers: new Headers() } as Parameters<typeof resolveProviderConfig>[0]
);

assert.throws(
  () => resolveProviderConfig(
    createProviderConfigRequest(),
    { provider: 'gemini', apiUrl: 'https://attacker.example/chat/completions' }
  ),
  (error) => (
    error instanceof ProviderConfigError &&
    error.status === 400 &&
    error.message.includes('客户端不再支持自定义 API URL')
  )
);

try {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_URL;
  process.env.API_KEY = 'legacy-key';
  process.env.API_URL = 'https://legacy.example/chat/completions';

  const defaultGeminiConfig = resolveProviderConfig(
    createProviderConfigRequest(),
    { provider: 'gemini' }
  );
  assert.strictEqual(defaultGeminiConfig.apiKey, '');
  assert.strictEqual(defaultGeminiConfig.apiUrl, GEMINI_OPENAI_API_URL);

  process.env.GEMINI_API_KEY = 'gemini-key';
  process.env.GEMINI_API_URL = 'https://gemini.example/chat/completions';

  const envGeminiConfig = resolveProviderConfig(
    createProviderConfigRequest(),
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
  deepseekApiKey: 'deepseek-key',
});
assert.strictEqual(migratedStorage.getItem('geminiApiKey'), 'legacy-gemini-key');
assert.strictEqual(migratedStorage.getItem('geminiApiUrl'), null);

const defaultStorage = new MemoryStorage({
  aiProvider: 'unknown',
});
const defaultSettings = loadAISettingsFromStorage(defaultStorage);
assert.strictEqual(defaultSettings.aiProvider, 'deepseek');
assert.strictEqual(defaultSettings.geminiApiKey, '');
assert.strictEqual(defaultSettings.deepseekApiKey, '');

console.log('All tests passed');
