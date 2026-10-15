import assert from 'assert';
import './analysisHistory.test';
import './dailySentence.test';
import './phraseRange.test';
import './readingLayout.test';
import './wordDetailContext.test';
import './wordDetailDictionary.test';
import { runLocalOutputTests } from './localOutput.test';
import { runRequestMetricsTests } from './requestMetrics.test';
import {
  PRESETS,
  createCustomProfileId,
  getApiEndpoint,
  getTtsModelName,
  getRequestProviderPayload,
  loadAISettingsFromStorage,
  normalizeEndpointUrl,
  sanitizeProfiles,
  parseWordDetailResponseContent,
  readOpenAIContentStream,
  type StorageLike
} from '../app/services/api';
import {
  ProviderConfigError,
  buildCompletionPayload,
  getStructuredResponseFormat,
  resolveProviderConfig,
  resolveServerProviderConfig,
  type ProviderCaps
} from '../app/api/_utils/providerConfig';
import {
  proxyOpenAICompatibleRequest,
  wrapStreamingResponseWithIdleTimeout
} from '../app/api/_utils/openaiProxy';
import {
  buildUmamiLoaderScript,
  resolveUmamiConfig
} from '../app/api/_utils/umami';
import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  createAuthToken,
  isAuthRequired,
  isValidAuthToken
} from '../app/api/_utils/sessionAuth';
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
  normalizeEscapedLineBreaks,
  stripReasoningBoldMarkdown
} from '../app/utils/markdown';
import {
  reconstructJapaneseChunks,
  splitJapaneseText
} from '../app/utils/japaneseChunking';
import {
  areReasoningSummariesSimilar,
  formatCompletedReasoningSummaries,
  ReasoningSummaryController,
  sanitizeReasoningSummary
} from '../app/utils/reasoningSummary';
import {
  REASONING_TAIL_CHAR_LIMIT,
  REASONING_VIRTUAL_LINE_CHAR_LIMIT,
  ReasoningTextStore
} from '../app/utils/reasoningTextStore';

assert.strictEqual(getApiEndpoint('/analyze'), '/api/analyze');
assert.strictEqual(getApiEndpoint('/tts'), '/api/tts');
assert.strictEqual(getApiEndpoint('chat'), '/api/chat');
assert.strictEqual(getApiEndpoint('reasoning-summary'), '/api/reasoning-summary');

assert.strictEqual(
  sanitizeReasoningSummary('**当前进度：** “正在核对句子结构。”'),
  '正在核对句子结构'
);
assert.strictEqual(
  sanitizeReasoningSummary('123456789', 5),
  '12345'
);
assert.deepStrictEqual(
  formatCompletedReasoningSummaries([
    '正在连接模型…',
    '正在辨析复合助词的切分标准',
    '正在等待模型响应…',
    '核对最终结果',
  ]),
  ['辨析复合助词的切分标准', '核对最终结果']
);

const longReasoningStore = new ReasoningTextStore();
const fiftyThousandCharacterReasoning = '思考'.repeat(25_000);
longReasoningStore.setText(fiftyThousandCharacterReasoning);
assert.strictEqual(longReasoningStore.getTextLength(), 50_000);
assert.strictEqual(longReasoningStore.getTail().length, REASONING_TAIL_CHAR_LIMIT);
assert.strictEqual(
  longReasoningStore.getVirtualLines().join(''),
  fiftyThousandCharacterReasoning
);
assert.ok(
  longReasoningStore.getVirtualLines().every(
    (line) => line.length <= REASONING_VIRTUAL_LINE_CHAR_LIMIT
  )
);
longReasoningStore.setText(`${fiftyThousandCharacterReasoning}追加`);
assert.strictEqual(longReasoningStore.getTextLength(), 50_002);

const paragraphReasoningStore = new ReasoningTextStore();
paragraphReasoningStore.setText('第一段\n\n\n第二段\n\n第三段');
assert.deepStrictEqual(
  paragraphReasoningStore.getReviewBlocks(),
  [
    { text: '第一段', paragraphEnd: true },
    { text: '第二段', paragraphEnd: true },
    { text: '第三段', paragraphEnd: true },
  ],
  '完成态应合并连续空行并按段落生成虚拟块'
);

assert.strictEqual(getTtsModelName('edge'), 'edge-tts');
assert.strictEqual(getTtsModelName('gemini'), 'gemini-3.1-flash-tts-preview');
assert.deepStrictEqual(
  PRESETS.map((preset) => preset.id),
  ['deepseek', 'openai', 'openrouter']
);
assert.ok(PRESETS.some((preset) => preset.id === 'deepseek' && preset.caps?.thinking === true));
assert.strictEqual(normalizeEndpointUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
assert.strictEqual(normalizeEndpointUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
assert.strictEqual(normalizeEndpointUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/chat/completions');
assert.ok(createCustomProfileId().startsWith('custom-'));
assert.deepStrictEqual(
  sanitizeProfiles([{ id: 'a', baseUrl: 'https://x.example', model: 'm' }, { id: 'skip' }]),
  [{ id: 'a', name: 'a', baseUrl: 'https://x.example', apiKey: '', model: 'm', caps: {} }]
);

const oldCode = process.env.CODE;
try {
  delete process.env.CODE;
  assert.strictEqual(isAuthRequired(), false);
  assert.strictEqual(isValidAuthToken(null), true);

  process.env.CODE = 'test-password';
  const authToken = createAuthToken(1_000);
  assert.strictEqual(isAuthRequired(), true);
  assert.ok(isValidAuthToken(authToken, 1_000));
  assert.ok(!isValidAuthToken(`${authToken}tampered`, 1_000));
  assert.ok(!isValidAuthToken(authToken, 1_000 + (AUTH_COOKIE_MAX_AGE_SECONDS + 1) * 1000));
} finally {
  if (oldCode === undefined) delete process.env.CODE;
  else process.env.CODE = oldCode;
}

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

assert.deepStrictEqual(getAnalyzeUsageEvent('gemini', {}, 'gemini-flash-latest'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-flash-latest',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});
assert.deepStrictEqual(getAnalyzeUsageEvent('gemini', {}, 'gemini-flash-lite-latest'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});

assert.deepStrictEqual(getAnalyzeUsageEvent('deepseek', {}, 'deepseek-chat'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});
assert.deepStrictEqual(getAnalyzeUsageEvent('gemini', {
  imageRecognition: getImageRecognitionUsage('gemini', 'gemini-flash-latest'),
  tts: getTtsUsage('gemini'),
}, 'gemini-flash-latest'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-flash-latest',
    image_recognition: 'true',
    image_provider: 'gemini',
    image_model: 'gemini-flash-latest',
    tts: 'true',
    tts_provider: 'gemini',
    tts_model: 'gemini-3.1-flash-tts-preview',
  },
});
assert.deepStrictEqual(getImageRecognitionUsageEvent('gemini', 'gemini-flash-latest'), {
  name: IMAGE_RECOGNITION_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-flash-latest',
  },
});
assert.deepStrictEqual(getImageRecognitionUsageEvent('deepseek', 'deepseek-chat'), {
  name: IMAGE_RECOGNITION_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-chat',
  },
});
assert.deepStrictEqual(getTtsUsageEvent('edge'), {
  name: TTS_USAGE_EVENT_NAME,
  data: {
    provider: 'edge',
    model: 'edge-tts',
  },
});
assert.deepStrictEqual(getWordDetailUsageEvent('deepseek', 'deepseek-chat'), {
  name: WORD_DETAIL_USAGE_EVENT_NAME,
  data: {
    provider: 'deepseek',
    model: 'deepseek-chat',
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
assert.strictEqual(
  stripReasoningBoldMarkdown('先判断**学校文法**，再确认__词性__。'),
  '先判断学校文法，再确认词性。'
);

const chunkingArticle = '政府は「年内に実施する。問題はない」と説明した。\n\n'
  + '一方、自治体からは慎重な対応を求める声も上がっている。'
  + '政府は専門家会議の結論を踏まえ、最終的な方針を決める。';
const semanticChunks = splitJapaneseText(chunkingArticle, {
  targetChars: 36,
  maxChars: 52,
  minChars: 12,
});
assert.strictEqual(reconstructJapaneseChunks(semanticChunks), chunkingArticle);
assert.ok(semanticChunks.length >= 2);
assert.ok(semanticChunks[0].text.includes('「年内に実施する。問題はない」と説明した。'));
assert.ok(semanticChunks.every((chunk, index) => (
  index === semanticChunks.length - 1
  || /[。！？!?\n]\s*$/u.test(chunk.text)
)));

const oneLongSentence = 'これは、'.repeat(80) + '文の意味を保つために途中で切断しない非常に長い一文です。';
const longSentenceChunks = splitJapaneseText(oneLongSentence, {
  targetChars: 80,
  maxChars: 120,
  minChars: 40,
});
assert.strictEqual(longSentenceChunks.length, 1);
assert.strictEqual(longSentenceChunks[0].text, oneLongSentence);
assert.strictEqual(longSentenceChunks[0].overLimit, true);

const smallTailArticle = `${'长'.repeat(26)}。\n\n${'尾'.repeat(8)}。`;
const smallTailChunks = splitJapaneseText(smallTailArticle, {
  targetChars: 32,
  maxChars: 48,
  minChars: 16,
});
assert.strictEqual(smallTailChunks.length, 1);
assert.strictEqual(reconstructJapaneseChunks(smallTailChunks), smallTailArticle);

assert.deepStrictEqual(getRequestProviderPayload({ baseUrl: 'https://a.example', model: 'm-1' }), {
  baseUrl: 'https://a.example',
  model: 'm-1',
  caps: undefined,
});

assert.deepStrictEqual(
  getRequestProviderPayload({ baseUrl: 'https://b.example', model: 'm-2', caps: { thinking: true } }),
  {
    baseUrl: 'https://b.example',
    model: 'm-2',
    caps: { thinking: true },
  }
);

const deepseekCaps: ProviderCaps = { jsonSchema: false, thinking: true };
assert.deepStrictEqual(buildCompletionPayload(deepseekCaps, { model: 'deepseek-chat' }), {
  model: 'deepseek-chat',
  thinking: { type: 'disabled' },
});

assert.deepStrictEqual(buildCompletionPayload(
  deepseekCaps,
  { model: 'deepseek-chat' },
  { enableThinking: true }
), {
  model: 'deepseek-chat',
  thinking: { type: 'enabled' },
  reasoning_effort: 'high',
});

assert.deepStrictEqual(buildCompletionPayload(
  deepseekCaps,
  { model: 'deepseek-chat' },
  { structuredOutput: 'wordDetail' }
), {
  model: 'deepseek-chat',
  response_format: { type: 'json_object' },
  thinking: { type: 'disabled' },
});

const openaiCaps: ProviderCaps = {};
assert.deepStrictEqual(buildCompletionPayload(openaiCaps, { model: 'gpt-4o-mini' }), {
  model: 'gpt-4o-mini',
});

assert.deepStrictEqual(getStructuredResponseFormat(deepseekCaps, 'analysisTokens'), {
  type: 'json_object',
});

const openaiAnalysisResponseFormat = getStructuredResponseFormat(openaiCaps, 'analysisTokens');
assert.strictEqual(openaiAnalysisResponseFormat.type, 'json_schema');
assert.ok(
  JSON.stringify(openaiAnalysisResponseFormat).includes('"tokens"')
);

const openaiStructuredPayload = buildCompletionPayload(
  openaiCaps,
  { model: 'gpt-4o-mini' },
  { structuredOutput: 'analysisTokens' }
);
assert.deepStrictEqual(
  (openaiStructuredPayload.response_format as Record<string, unknown>).type,
  'json_schema'
);

function streamData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function collectOpenAIContentStream(
  chunks: string[],
  options: Parameters<typeof readOpenAIContentStream>[3] = {}
): Promise<{
  events: Array<{ chunk: string; isDone: boolean }>;
  reasoningEvents: Array<{ text: string; done: boolean }>;
  contentStartCount: number;
  error: Error | null;
}> {
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }));
  const events: Array<{ chunk: string; isDone: boolean }> = [];
  const reasoningEvents: Array<{ text: string; done: boolean }> = [];
  let error: Error | null = null;
  let contentStartCount = 0;
  const suppliedReasoningHandler = options.onReasoning;
  const suppliedContentStartHandler = options.onContentStart;

  await readOpenAIContentStream(
    response,
    (chunk, isDone) => events.push({ chunk, isDone }),
    (streamError) => {
      error = streamError;
    },
    {
      debounceMs: 0,
      reasoningDebounceMs: 0,
      ...options,
      onReasoning: (text, done) => {
        reasoningEvents.push({ text, done });
        suppliedReasoningHandler?.(text, done);
      },
      onContentStart: () => {
        contentStartCount += 1;
        suppliedContentStartHandler?.();
      },
    }
  );

  return { events, reasoningEvents, contentStartCount, error };
}

const completeWordDetailJson = JSON.stringify({
  originalWord: 'エンターテインメント',
  chineseTranslation: '娱乐作品',
  pos: '名詞',
  furigana: 'えんたーていんめんと',
  romaji: 'enta-teinmento',
  dictionaryForm: 'エンターテインメント',
  explanation: '例句：この映画は純粋なエンターテインメントとして楽しめる。（这部电影可以纯粹作为娱乐来享受。）',
  conjugation: '',
  example: '映画を楽しむ。',
  exampleTranslation: '欣赏电影。',
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
      streamData({ choices: [{ delta: { reasoning_content: '先确认' }, finish_reason: null }] }),
      streamData({ choices: [{ delta: { reasoning_content: '句子结构。' }, finish_reason: null }] }),
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
  assert.deepStrictEqual(completeStream.reasoningEvents, [
    { text: '先确认', done: false },
    { text: '先确认句子结构。', done: false },
    { text: '先确认句子结构。', done: true },
  ]);
  assert.strictEqual(completeStream.contentStartCount, 1);

  const throttledReasoningStream = await collectOpenAIContentStream(
    [
      streamData({ choices: [{ delta: { reasoning_content: '第一段' }, finish_reason: null }] }),
      streamData({ choices: [{ delta: { reasoning_content: '第二段' }, finish_reason: null }] }),
      streamData({ choices: [{ delta: { content: '{}' }, finish_reason: null }] }),
      streamData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ],
    { reasoningDebounceMs: 100 }
  );
  assert.deepStrictEqual(throttledReasoningStream.reasoningEvents, [
    { text: '第一段第二段', done: true },
  ]);
  assert.strictEqual(throttledReasoningStream.contentStartCount, 1);

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

  const keepAliveEncoder = new TextEncoder();
  const keepAliveResponse = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(keepAliveEncoder.encode('第一段'));
      setTimeout(() => {
        controller.enqueue(keepAliveEncoder.encode('第二段'));
        controller.close();
      }, 15);
    },
  }));
  const keepAliveController = new AbortController();
  const keptAliveText = await wrapStreamingResponseWithIdleTimeout(
    keepAliveResponse,
    keepAliveController,
    30
  ).text();
  assert.strictEqual(keptAliveText, '第一段第二段');
  assert.strictEqual(keepAliveController.signal.aborted, false);

  const stalledResponse = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(keepAliveEncoder.encode('data: first\n\n'));
    },
  }));
  const stalledController = new AbortController();
  const stalledText = await wrapStreamingResponseWithIdleTimeout(
    stalledResponse,
    stalledController,
    10
  ).text();
  assert.ok(stalledText.includes('上游流式响应空闲超时'));
  assert.strictEqual(stalledController.signal.aborted, true);
}

const createProviderConfigRequest = (auth?: string) => (
  { headers: new Headers(auth ? { Authorization: auth } : {}) } as Parameters<typeof resolveProviderConfig>[0]
);

const resolved = resolveProviderConfig(
  createProviderConfigRequest('Bearer test-key'),
  { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', caps: { jsonSchema: false, thinking: true } }
);
assert.strictEqual(resolved.apiKey, 'test-key');
assert.strictEqual(resolved.baseUrl, 'https://api.deepseek.com/chat/completions');
assert.strictEqual(resolved.model, 'deepseek-chat');
assert.deepStrictEqual(resolved.caps, { jsonSchema: false, thinking: true });

assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { baseUrl: 'http://127.0.0.1', model: 'm' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);
assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { baseUrl: 'http://169.254.169.254', model: 'm' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);
assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { baseUrl: 'http://foo.local', model: 'm' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);
assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { baseUrl: 'ftp://x.example', model: 'm' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);
assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { baseUrl: 'https://ok.example', model: '' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);
assert.throws(
  () => resolveProviderConfig(createProviderConfigRequest('Bearer k'), { model: 'm' }),
  (error) => error instanceof ProviderConfigError && error.status === 400
);

const oldDailyUrl = process.env.DAILY_SENTENCE_API_URL;
const oldDailyKey = process.env.DAILY_SENTENCE_API_KEY;
const oldDailyModel = process.env.DAILY_SENTENCE_API_MODEL;
const oldDeepseekKey = process.env.DEEPSEEK_API_KEY;
const oldGeminiKey = process.env.GEMINI_API_KEY;
try {
  delete process.env.DAILY_SENTENCE_API_URL;
  delete process.env.DAILY_SENTENCE_API_KEY;
  delete process.env.DAILY_SENTENCE_API_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.strictEqual(resolveServerProviderConfig(), null);

  process.env.DEEPSEEK_API_KEY = 'deepseek-key';
  const serverConfig = resolveServerProviderConfig();
  assert.strictEqual(serverConfig?.name, 'deepseek');
  assert.strictEqual(serverConfig?.apiKey, 'deepseek-key');
  assert.strictEqual(serverConfig?.model, 'deepseek-chat');
  assert.strictEqual(serverConfig?.caps.jsonSchema, false);

  process.env.DAILY_SENTENCE_API_URL = 'https://daily.example/v1';
  process.env.DAILY_SENTENCE_API_KEY = 'daily-key';
  process.env.DAILY_SENTENCE_API_MODEL = 'daily-model';
  const dailyConfig = resolveServerProviderConfig();
  assert.strictEqual(dailyConfig?.name, 'daily-sentence');
  assert.strictEqual(dailyConfig?.apiUrl, 'https://daily.example/v1/chat/completions');
  assert.strictEqual(dailyConfig?.apiKey, 'daily-key');
} finally {
  if (oldDailyUrl === undefined) delete process.env.DAILY_SENTENCE_API_URL;
  else process.env.DAILY_SENTENCE_API_URL = oldDailyUrl;
  if (oldDailyKey === undefined) delete process.env.DAILY_SENTENCE_API_KEY;
  else process.env.DAILY_SENTENCE_API_KEY = oldDailyKey;
  if (oldDailyModel === undefined) delete process.env.DAILY_SENTENCE_API_MODEL;
  else process.env.DAILY_SENTENCE_API_MODEL = oldDailyModel;
  if (oldDeepseekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = oldDeepseekKey;
  if (oldGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = oldGeminiKey;
}

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  constructor(initialValues: Record<string, string> = {}) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const migratedStorage = new MemoryStorage({
  aiProvider: 'deepseek',
  aiModel: 'deepseek-chat',
  deepseekApiKey: 'deepseek-key',
  deepseekThinkingEnabled: 'true',
  geminiApiKey: 'gemini-key',
});
const migratedSettings = loadAISettingsFromStorage(migratedStorage);
assert.deepStrictEqual(migratedSettings.profiles, [{
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'deepseek-key',
  model: 'deepseek-chat',
  caps: { jsonSchema: false, thinking: true },
}]);
assert.strictEqual(migratedSettings.activeId, 'deepseek');
assert.strictEqual(migratedSettings.geminiApiKey, 'gemini-key');
assert.strictEqual(migratedSettings.thinkingEnabled, true);

const emptyStorage = new MemoryStorage({ aiProvider: 'unknown' });
const emptySettings = loadAISettingsFromStorage(emptyStorage);
assert.deepStrictEqual(emptySettings.profiles, []);
assert.strictEqual(emptySettings.activeId, '');
assert.strictEqual(emptySettings.geminiApiKey, '');
assert.strictEqual(emptySettings.thinkingEnabled, false);

const legacyGeminiStorage = new MemoryStorage({
  aiProvider: 'gemini',
  aiModel: 'gemini-flash-latest',
  geminiApiKey: 'gemini-key',
});
const legacyGeminiSettings = loadAISettingsFromStorage(legacyGeminiStorage);
assert.strictEqual(legacyGeminiSettings.profiles.length, 1);
assert.strictEqual(legacyGeminiSettings.profiles[0].id, 'gemini');
assert.strictEqual(legacyGeminiSettings.profiles[0].baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');

const newFormatStorage = new MemoryStorage({
  providerSettings: JSON.stringify({
    profiles: [{ id: 'my', name: 'My', baseUrl: 'https://my.example', apiKey: 'k', model: 'm', caps: { thinking: true } }],
    activeId: 'my',
  }),
  thinkingEnabled: 'true',
});
const newFormatSettings = loadAISettingsFromStorage(newFormatStorage);
assert.strictEqual(newFormatSettings.profiles.length, 1);
assert.strictEqual(newFormatSettings.activeId, 'my');
assert.strictEqual(newFormatSettings.thinkingEnabled, true);

async function runOpenAIProxyErrorBodyTests() {
  const originalFetch = globalThis.fetch;
  try {
    // 上游返回错误状态码、但错误正文迟迟不来时，应在超时后返回 504 并中止上游连接。
    for (const stream of [true, false]) {
      let upstreamSignal: AbortSignal | undefined;
      globalThis.fetch = async (_url, init) => {
        upstreamSignal = init?.signal ?? undefined;
        return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 502 });
      };
      // 挂起的 Promise 不会让 Node 保持运行，必须用定时器兜底，否则测试会静默退出。
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const stalled = await Promise.race([
        proxyOpenAICompatibleRequest({
          url: 'https://upstream.example/chat/completions',
          apiKey: 'test-key',
          payload: { model: 'test', stream },
          errorBodyTimeoutMs: 20,
        }),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error(`stream=${stream} 读错误正文不应一直挂起`)),
            1_000
          );
        }),
      ]).finally(() => clearTimeout(deadline));
      assert.strictEqual(stalled.ok, false);
      if (!stalled.ok) {
        assert.strictEqual(stalled.status, 504);
        assert.ok(stalled.error.message.includes('长时间没有返回错误详情'));
      }
      assert.strictEqual(upstreamSignal?.aborted, true, `stream=${stream} 超时后应中止上游连接`);
    }

    // 错误正文正常返回时仍按原样透传状态码和错误信息。
    for (const stream of [true, false]) {
      globalThis.fetch = async () => Response.json(
        { error: { message: 'quota exceeded' } },
        { status: 429 }
      );
      const failed = await proxyOpenAICompatibleRequest({
        url: 'https://upstream.example/chat/completions',
        apiKey: 'test-key',
        payload: { model: 'test', stream },
        errorBodyTimeoutMs: 1_000,
      });
      assert.strictEqual(failed.ok, false);
      if (!failed.ok) {
        assert.strictEqual(failed.status, 429);
        assert.strictEqual(failed.error.message, 'quota exceeded');
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runReasoningSummaryControllerTests() {
  const requestSnippets: string[] = [];
  const summaries: string[] = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const pendingRequests: Array<{
    signal: AbortSignal;
    resolve: (summary: string) => void;
  }> = [];

  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.ok(predicate(), '等待摘要控制器状态超时');
  };

  const controller = new ReasoningSummaryController({
    fallbackMs: 15,
    requestSummary: ({ reasoningSnippet, signal }) => new Promise((resolve, reject) => {
      requestSnippets.push(reasoningSnippet);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        activeRequests -= 1;
        callback();
      };
      signal.addEventListener('abort', () => {
        settle(() => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }, { once: true });
      pendingRequests.push({
        signal,
        resolve: (summary) => settle(() => resolve(summary)),
      });
    }),
    onSummary: (summary) => summaries.push(summary),
  });

  controller.start();
  controller.ingest('第一段思考');
  assert.strictEqual(requestSnippets.length, 1, '首个 reasoning delta 应立即触发');

  controller.ingest('第一段思考\n接下来检查句子结构');
  assert.strictEqual(requestSnippets.length, 1, '在途请求期间只能标记 pending');
  pendingRequests[0].resolve('正在核对句子结构');
  await waitFor(() => requestSnippets.length === 2);
  assert.ok(requestSnippets[1].endsWith('接下来检查句子结构'));
  pendingRequests[1].resolve('正在核对句子结构');
  await waitFor(() => activeRequests === 0);

  const sixHundredCharacters = '甲'.repeat(600);
  controller.ingest(`第一段思考\n接下来检查句子结构${sixHundredCharacters}`);
  assert.strictEqual(requestSnippets.length, 3, '新增 600 字应立即触发');
  assert.ok(Array.from(requestSnippets[2]).length <= 800);
  assert.ok(requestSnippets[2].endsWith(sixHundredCharacters));
  pendingRequests[2].resolve('正在检查长段落中的细节');
  await waitFor(() => activeRequests === 0);

  controller.ingest(`第一段思考\n接下来检查句子结构${sixHundredCharacters}继续核对`);
  await waitFor(() => requestSnippets.length === 4);
  pendingRequests[3].resolve('正在继续核对剩余细节');
  await waitFor(() => activeRequests === 0);

  controller.ingest(`第一段思考\n接下来检查句子结构${sixHundredCharacters}继续核对\n另外校验读音`);
  assert.strictEqual(requestSnippets.length, 5);
  pendingRequests[4].resolve('正在核对句子结构');
  await waitFor(() => activeRequests === 0);
  assert.strictEqual(summaries.length, 4, '与屏幕内较早摘要相似时不应入列');

  controller.ingest(`第一段思考\n接下来检查句子结构${sixHundredCharacters}继续核对\n另外校验读音\n然后确认最终输出`);
  assert.strictEqual(requestSnippets.length, 6);
  controller.finish();

  assert.strictEqual(maxActiveRequests, 1);
  assert.strictEqual(pendingRequests[5].signal.aborted, true, '结束时应中止在途摘要请求');
  assert.deepStrictEqual(summaries, [
    '正在连接模型…',
    '正在核对句子结构',
    '正在检查长段落中的细节',
    '正在继续核对剩余细节',
  ]);
  assert.ok(areReasoningSummariesSimilar('正在核对句子结构', '正在核对句子的结构'));
  assert.ok(!areReasoningSummariesSimilar('正在核对句子结构', '正在检查假名读音'));
  controller.cancel();
}

Promise.all([
  runOpenAIContentStreamTests(),
  runReasoningSummaryControllerTests(),
])
  .then(runLocalOutputTests)
  .then(runRequestMetricsTests)
  .then(runOpenAIProxyErrorBodyTests)
  .then(() => {
    console.log('All tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
