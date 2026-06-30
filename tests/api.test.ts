import assert from 'assert';
import {
  DEFAULT_AI_PROVIDER,
  DEEPSEEK_MODEL_OPTIONS,
  getApiEndpoint,
  getModelName,
  getTtsModelName,
  getRequestProviderPayload,
  loadAISettingsFromStorage,
  normalizeAIModel,
  normalizeAIProvider,
  parseWordDetailResponseContent,
  readOpenAIContentStream,
  type StorageLike
} from '../app/services/api';
import {
  DEFAULT_AI_PROVIDER as SERVER_DEFAULT_AI_PROVIDER,
  GEMINI_OPENAI_API_URL,
  ProviderConfigError,
  getStructuredResponseFormat,
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
  IMAGE_RECOGNITION_USAGE_EVENT_NAME,
  TTS_USAGE_EVENT_NAME,
  WORD_DETAIL_USAGE_EVENT_NAME,
  getAnalyzeUsageEvent,
  getImageRecognitionUsage,
  getImageRecognitionUsageEvent,
  getTtsUsage,
  getTtsUsageEvent,
  getWordDetailUsageEvent
} from '../app/utils/analytics';
import {
  getPosGroup,
  POS_LEGEND_GROUPS
} from '../app/utils/helpers';
import {
  highlightMarkedTextForMarkdown,
  normalizeEscapedLineBreaks
} from '../app/utils/markdown';

assert.strictEqual(getApiEndpoint('/analyze'), '/api/analyze');
assert.strictEqual(getApiEndpoint('/tts'), '/api/tts');
assert.strictEqual(getApiEndpoint('chat'), '/api/chat');

assert.strictEqual(DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(SERVER_DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(getModelName(), 'deepseek-v4-flash');
assert.strictEqual(getTtsModelName('edge'), 'edge-tts');
assert.strictEqual(getTtsModelName('gemini'), 'gemini-3.1-flash-tts-preview');
assert.deepStrictEqual(DEEPSEEK_MODEL_OPTIONS, ['deepseek-v4-flash', 'deepseek-v4-pro']);
assert.strictEqual(normalizeAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeAIProvider('unknown'), 'deepseek');
assert.strictEqual(normalizeAIModel('deepseek', 'deepseek-v4-pro'), 'deepseek-v4-pro');
assert.strictEqual(normalizeAIModel('deepseek', 'unknown'), 'deepseek-v4-flash');
assert.strictEqual(normalizeAIModel('gemini', 'deepseek-v4-pro'), 'gemini-3.5-flash');
assert.strictEqual(normalizeServerAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeServerAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeServerAIProvider('unknown'), 'deepseek');
assert.strictEqual(getModelName('deepseek'), 'deepseek-v4-flash');
assert.strictEqual(getModelName('deepseek', 'deepseek-v4-pro'), 'deepseek-v4-pro');
assert.strictEqual(getModelName('gemini', 'deepseek-v4-pro'), 'gemini-3.5-flash');

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
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});

assert.deepStrictEqual(getAnalyzeUsageEvent('deepseek'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});
assert.deepStrictEqual(getAnalyzeUsageEvent('deepseek', {}, 'deepseek-v4-pro'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});
assert.deepStrictEqual(getAnalyzeUsageEvent('gemini', {
  imageRecognition: getImageRecognitionUsage('gemini'),
  tts: getTtsUsage('gemini'),
}), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    image_recognition: 'true',
    image_provider: 'gemini',
    image_model: 'gemini-3.5-flash',
    tts: 'true',
    tts_provider: 'gemini',
    tts_model: 'gemini-3.1-flash-tts-preview',
  },
});
assert.deepStrictEqual(getImageRecognitionUsageEvent('gemini'), {
  name: IMAGE_RECOGNITION_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
  },
});
assert.deepStrictEqual(getTtsUsageEvent('edge'), {
  name: TTS_USAGE_EVENT_NAME,
  data: {
    provider: 'edge',
    model: 'edge-tts',
  },
});
assert.deepStrictEqual(getWordDetailUsageEvent('deepseek'), {
  name: WORD_DETAIL_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
  },
});
assert.deepStrictEqual(getWordDetailUsageEvent('deepseek', 'deepseek-v4-pro'), {
  name: WORD_DETAIL_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
  },
});

assert.deepStrictEqual([...POS_LEGEND_GROUPS], [
  'n',
  'v',
  'adj',
  'adjv',
  'adv',
  'adn',
  'conj',
  'int',
  'p',
  'aux',
]);
assert.strictEqual(getPosGroup('名詞'), 'n');
assert.strictEqual(getPosGroup('代名詞'), 'n');
assert.strictEqual(getPosGroup('動詞'), 'v');
assert.strictEqual(getPosGroup('形容詞'), 'adj');
assert.strictEqual(getPosGroup('形容動詞'), 'adjv');
assert.strictEqual(getPosGroup('形状詞'), 'adjv');
assert.strictEqual(getPosGroup('副詞'), 'adv');
assert.strictEqual(getPosGroup('連体詞'), 'adn');
assert.strictEqual(getPosGroup('接続詞'), 'conj');
assert.strictEqual(getPosGroup('感動詞'), 'int');
assert.strictEqual(getPosGroup('助詞'), 'p');
assert.strictEqual(getPosGroup('助動詞'), 'aux');

const adjacentHighlightMarkdown = highlightMarkedTextForMarkdown('【静かな】是【形容動詞】【静か】的【連体形】。');
assert.ok(!adjacentHighlightMarkdown.includes('****'));
assert.ok(adjacentHighlightMarkdown.includes('**形容動詞**\u200b**静か**'));
assert.strictEqual(
  highlightMarkedTextForMarkdown('**【形容動詞】**'),
  '**形容動詞**'
);
assert.strictEqual(normalizeEscapedLineBreaks('第一行\\n\\n第二行'), '第一行\n\n第二行');
assert.strictEqual(normalizeEscapedLineBreaks('第一行\\\\n第二行'), '第一行\n第二行');

assert.deepStrictEqual(getRequestProviderPayload('gemini'), {
  provider: 'gemini',
  model: 'gemini-3.5-flash',
});

assert.deepStrictEqual(getRequestProviderPayload('deepseek'), {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
});

assert.deepStrictEqual(getRequestProviderPayload('deepseek', 'deepseek-v4-pro'), {
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
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

assert.deepStrictEqual(withProviderControls('deepseek', { model: 'deepseek-v4-pro' }), {
  model: 'deepseek-v4-pro',
  thinking: { type: 'disabled' },
});

assert.deepStrictEqual(getStructuredResponseFormat('deepseek', 'analysisTokens'), {
  type: 'json_object',
});

const geminiAnalysisResponseFormat = getStructuredResponseFormat('gemini', 'analysisTokens');
assert.strictEqual(geminiAnalysisResponseFormat.type, 'json_schema');
assert.ok(
  JSON.stringify(geminiAnalysisResponseFormat).includes('"tokens"')
);

assert.deepStrictEqual(withProviderControls(
  'deepseek',
  { model: 'deepseek-v4-flash' },
  { structuredOutput: 'wordDetail' }
), {
  model: 'deepseek-v4-flash',
  response_format: { type: 'json_object' },
  thinking: { type: 'disabled' },
});

const geminiStructuredPayload = withProviderControls(
  'gemini',
  { model: 'gemini-3.5-flash' },
  { structuredOutput: 'analysisTokens' }
);
assert.strictEqual(geminiStructuredPayload.reasoning_effort, 'minimal');
assert.deepStrictEqual(
  (geminiStructuredPayload.response_format as Record<string, unknown>).type,
  'json_schema'
);

function streamData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function collectOpenAIContentStream(
  chunks: string[],
  options: Parameters<typeof readOpenAIContentStream>[3] = {}
) {
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }));
  const events: Array<{ chunk: string; isDone: boolean }> = [];
  let error: Error | null = null;

  await readOpenAIContentStream(
    response,
    (chunk, isDone) => events.push({ chunk, isDone }),
    (streamError) => {
      error = streamError;
    },
    { debounceMs: 0, ...options }
  );

  return { events, error };
}

const completeWordDetailJson = JSON.stringify({
  originalWord: 'エンターテインメント',
  chineseTranslation: '娱乐作品',
  pos: '名詞',
  furigana: 'えんたーていんめんと',
  romaji: 'enta-teinmento',
  dictionaryForm: 'エンターテインメント',
  explanation: '例句：この映画は純粋なエンターテインメントとして楽しめる。（这部电影可以纯粹作为娱乐来享受。）',
});

const looseWordDetailJson = `{
  "originalWord": "エンターテインメント",
  "chineseTranslation": "娱乐",
  "pos": "名詞",
  "furigana": "えんたーていんめんと",
  "romaji": "entaateinmento",
  "dictionaryForm": "エンターテインメント",
  "explanation": "这个词来源于英语"entertainment"，意为“娱乐”。\\n例句：この映画は楽しめる。"
}`;
const looseWordDetail = parseWordDetailResponseContent(looseWordDetailJson);
assert.strictEqual(looseWordDetail.originalWord, 'エンターテインメント');
assert.ok(looseWordDetail.explanation.includes('英语"entertainment"'));
assert.ok(looseWordDetail.explanation.includes('\n例句'));

async function runOpenAIContentStreamTests() {
  const completeStream = await collectOpenAIContentStream(
    [
      streamData({ choices: [{ delta: { content: completeWordDetailJson.slice(0, 40) }, finish_reason: null }] }),
      streamData({ choices: [{ delta: { content: completeWordDetailJson.slice(40) }, finish_reason: null }] }),
      streamData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ],
    {
      validateFinalContent: JSON.parse,
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    }
  );
  assert.strictEqual(completeStream.error, null);
  assert.deepStrictEqual(completeStream.events.at(-1), {
    chunk: completeWordDetailJson,
    isDone: true,
  });

  const lengthStream = await collectOpenAIContentStream(
    [
      streamData({ choices: [{ delta: { content: '{"explanation":"半句' }, finish_reason: null }] }),
      streamData({ choices: [{ delta: {}, finish_reason: 'length' }] }),
    ],
    { completionLabel: '词语详解' }
  );
  assert.ok(lengthStream.error);
  assert.ok(lengthStream.error.message.includes('被上游模型截断'));
  assert.ok(!lengthStream.events.some((event) => event.isDone));

  const invalidJsonStream = await collectOpenAIContentStream(
    [
      streamData({ choices: [{ delta: { content: '{"explanation":"半句' }, finish_reason: null }] }),
      'data: [DONE]\n\n',
    ],
    {
      validateFinalContent: JSON.parse,
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    }
  );
  assert.ok(invalidJsonStream.error);
  assert.strictEqual(invalidJsonStream.error.message, '词语详解没有完整生成，请重新生成。');
  assert.ok(!invalidJsonStream.events.some((event) => event.isDone));

  const looseJsonStream = await collectOpenAIContentStream(
    [
      streamData({ choices: [{ delta: { content: looseWordDetailJson }, finish_reason: null }] }),
      'data: [DONE]\n\n',
    ],
    {
      validateFinalContent: parseWordDetailResponseContent,
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    }
  );
  assert.strictEqual(looseJsonStream.error, null);
  assert.deepStrictEqual(looseJsonStream.events.at(-1), {
    chunk: looseWordDetailJson,
    isDone: true,
  });
}

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
  aiModel: 'deepseek-v4-pro',
  deepseekApiKey: 'deepseek-key',
});
const migratedSettings = loadAISettingsFromStorage(migratedStorage);
assert.deepStrictEqual(migratedSettings, {
  aiProvider: 'deepseek',
  aiModel: 'deepseek-v4-pro',
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
assert.strictEqual(defaultSettings.aiModel, 'deepseek-v4-flash');
assert.strictEqual(defaultSettings.geminiApiKey, '');
assert.strictEqual(defaultSettings.deepseekApiKey, '');

runOpenAIContentStreamTests()
  .then(() => {
    console.log('All tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
