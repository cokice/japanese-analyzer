import assert from 'assert';
import {
  DEFAULT_AI_PROVIDER,
  DEEPSEEK_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  getApiEndpoint,
  getModelName,
  getTtsModelName,
  getRequestProviderPayload,
  loadAISettingsFromStorage,
  normalizeAIModel,
  normalizeAIProvider,
  parseWordDetailResponseContent,
  reconcileTokenTextToSource,
  reconcileTokenWhitespaceToSource,
  readOpenAIContentStream,
  streamAnalyzeSentence,
  streamProofreadTokens,
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
import { wrapStreamingResponseWithIdleTimeout } from '../app/api/_utils/openaiProxy';
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
import {
  buildProofreadPrompt,
  parseProofreadCorrections,
  PROOFREAD_MAX_OUTPUT_TOKENS,
  PROOFREAD_SENTENCE_TIMEOUT_MS,
  recoverTruncatedProofreadCorrections,
  splitProofreadSentenceJobs
} from '../app/utils/proofreading';
import { applyProofreadCorrections } from '../app/utils/applyProofreadCorrections';

assert.strictEqual(getApiEndpoint('/analyze'), '/api/analyze');
assert.strictEqual(getApiEndpoint('/tts'), '/api/tts');
assert.strictEqual(getApiEndpoint('chat'), '/api/chat');
assert.strictEqual(getApiEndpoint('reasoning-summary'), '/api/reasoning-summary');
assert.strictEqual(getApiEndpoint('proofread'), '/api/proofread');

const proofreadDraft = [
  { word: '私', pos: '代名詞', furigana: 'わたし', romaji: 'watashi' },
  { word: 'は', pos: '助詞', furigana: '', romaji: 'wa' },
];
const proofreadPrompt = buildProofreadPrompt('私は', proofreadDraft, {
  previousSource: '前です。',
  nextSource: '後です。',
});
assert.ok(proofreadPrompt.includes('快速抽查，不是详尽校对'));
assert.ok(proofreadPrompt.includes('默认正确、无需逐词确认'));
assert.ok(proofreadPrompt.includes('複合词或专有名词的切分边界'));
assert.ok(proofreadPrompt.includes('动词与助动词活用形的归属'));
assert.ok(proofreadPrompt.includes('多音汉字的注音选择'));
assert.ok(proofreadPrompt.includes('其余类型不在检查范围'));
assert.ok(proofreadPrompt.includes('不要为了找错而找错'));
assert.ok(proofreadPrompt.includes('"index":0'));
assert.ok(proofreadPrompt.includes('"私"\t"代名詞"\t"わたし"'));
assert.ok(proofreadPrompt.includes('前です。'));
assert.ok(proofreadPrompt.includes('仅供参考，不审校'));
assert.ok(proofreadPrompt.includes('仅审校这一句'));
assert.ok(proofreadPrompt.includes('"indexes":[27,28]'));
assert.ok(proofreadPrompt.includes('没有错误时输出 []'));
assert.strictEqual(PROOFREAD_MAX_OUTPUT_TOKENS, 6_144);
assert.strictEqual(PROOFREAD_SENTENCE_TIMEOUT_MS, 60_000);
assert.deepStrictEqual(
  parseProofreadCorrections(`\`\`\`json
[
  {"index":0,"field":"pos","correct":"名詞","why":"词性判断错误超过十字符"},
  {"index":1,"field":"kana","correct":"は","why":"语境读音"},
  {"index":1,"field":"other","correct":"x","why":"非法字段"},
  {"index":9,"field":"pos","correct":"名詞","why":"越界"},
  {"index":0,"field":"pos","correct":"動詞","why":"重复"}
]
\`\`\``, 2),
  [
    { indexes: [0], field: 'pos', correct: '名詞', why: '词性判断错误超过十字' },
    { indexes: [1], field: 'kana', correct: 'は', why: '语境读音' },
  ]
);
assert.deepStrictEqual(parseProofreadCorrections('[]', 2), []);
assert.throws(() => parseProofreadCorrections('{"corrections":[]}', 2));
assert.deepStrictEqual(
  recoverTruncatedProofreadCorrections(
    '[{"index":0,"field":"pos","correct":"名詞","why":"词性错"},{"index":1,"field":"kana","correct":"',
    2
  ),
  [{ indexes: [0], field: 'pos', correct: '名詞', why: '词性错' }]
);
assert.strictEqual(recoverTruncatedProofreadCorrections('[{"index":0', 2), null);

assert.deepStrictEqual(
  parseProofreadCorrections(`[
    {"index":0,"field":"seg","correct":"東京|国際空港","why":"专名切分"},
    {"index":1,"field":"seg","correct":"東京|国際空港","why":"重复报告"}
  ]`, 2),
  [{ indexes: [0, 1], field: 'seg', correct: '東京|国際空港', why: '专名切分' }]
);

const proofreadSentenceTokens = [
  { word: '私', pos: '代名詞', furigana: 'わたし' },
  { word: 'は', pos: '助詞', furigana: '' },
  { word: '。', pos: '記号', furigana: '' },
  { word: '君', pos: '代名詞', furigana: 'きみ' },
  { word: 'も', pos: '助詞', furigana: '' },
  { word: '？', pos: '記号', furigana: '' },
  { word: '\n', pos: '改行', furigana: '' },
  { word: 'はい', pos: '感動詞', furigana: '' },
];
const proofreadSentenceJobs = splitProofreadSentenceJobs(
  '私は。君も？\nはい',
  proofreadSentenceTokens
);
assert.strictEqual(proofreadSentenceJobs.length, 3);
assert.strictEqual(proofreadSentenceJobs[0].source, '私は。');
assert.strictEqual(proofreadSentenceJobs[1].source, '君も？');
assert.strictEqual(proofreadSentenceJobs[1].previousSource, '私は。');
assert.strictEqual(proofreadSentenceJobs[1].nextSource, '\nはい');
assert.strictEqual(proofreadSentenceJobs[2].tokenStart, 6);

const patchedTokens = applyProofreadCorrections(
  [
    { word: '東京国', pos: '固有名詞', furigana: 'とうきょうこく' },
    { word: '際空港', pos: '固有名詞', furigana: 'さいくうこう' },
    { word: 'へ', pos: '助詞', furigana: '' },
  ],
  [
    { indexes: [0, 1], field: 'seg', correct: '東京国際空港', why: '专名切分' },
    { indexes: [2], field: 'kana', correct: 'え', why: '语境读音' },
  ]
);
assert.strictEqual(patchedTokens.map((token) => token.word).join(''), '東京国際空港へ');
assert.strictEqual(patchedTokens.length, 2);
assert.deepStrictEqual(patchedTokens[0].proofreadSourceIndexes, [0, 1]);
assert.strictEqual(patchedTokens[1].furigana, 'え');
assert.ok(patchedTokens.every((token) => token.proofreadReview));

const separatorReconciledTokens = reconcileTokenTextToSource(
  '「今日は、晴れ。」\n',
  [
    { word: '"今日は晴れ."', pos: '名詞', furigana: 'きょうははれ', romaji: 'kyou wa hare' },
  ]
);
assert.ok(separatorReconciledTokens);
assert.strictEqual(
  separatorReconciledTokens?.map((token) => token.word).join(''),
  '「今日は、晴れ。」\n'
);
assert.strictEqual(
  reconcileTokenTextToSource(
    '今日は晴れ。',
    [{ word: '今日は雨。', pos: '名詞', furigana: '', romaji: '' }]
  ),
  null,
  '实词被模型改写时不得静默回填'
);
assert.strictEqual(
  reconcileTokenTextToSource(
    '恰も琴の音に仰いで秣まぐさ喰はむ。',
    [
      { word: '恰も琴の音に仰いで', pos: '副詞', furigana: '', romaji: '' },
      { word: '秣', pos: '名詞', furigana: 'まぐさ', romaji: 'magusa' },
      { word: '喰はむ', pos: '動詞', furigana: 'くわむ', romaji: 'kuwamu' },
      { word: '。', pos: '記号', furigana: '', romaji: '' },
    ]
  )?.map((token) => token.word).join(''),
  '恰も琴の音に仰いで秣まぐさ喰はむ。'
);
assert.strictEqual(
  reconcileTokenTextToSource(
    '下験べをはじめて、答へる。',
    [
      { word: '下験べ', pos: '名詞', furigana: 'したしらべ', romaji: '' },
      { word: 'を', pos: '助詞', furigana: '', romaji: '' },
      { word: '始め', pos: '動詞', furigana: 'はじめ', romaji: '' },
      { word: 'て', pos: '助詞', furigana: '', romaji: '' },
      { word: '、', pos: '記号', furigana: '', romaji: '' },
      { word: '答え', pos: '動詞', furigana: 'こたえ', romaji: '' },
      { word: 'る', pos: '助動詞', furigana: '', romaji: '' },
      { word: '。', pos: '記号', furigana: '', romaji: '' },
    ]
  )?.map((token) => token.word).join(''),
  '下験べをはじめて、答へる。'
);
const kanaEditContext = '長い文章の原文を丁寧に保持する。'.repeat(8);
assert.strictEqual(
  reconcileTokenTextToSource(
    `${kanaEditContext}誰はゞかることも必要なのである。呼べば応へがある。${kanaEditContext}`,
    [
      {
        word: `${kanaEditContext}誰はゞかかることも必要であるのである。呼べば応がある。${kanaEditContext}`,
        pos: '名詞',
        furigana: '',
        romaji: '',
      },
    ]
  )?.map((token) => token.word).join(''),
  `${kanaEditContext}誰はゞかることも必要なのである。呼べば応へがある。${kanaEditContext}`
);

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
    '深度校對中…',
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

assert.strictEqual(DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(SERVER_DEFAULT_AI_PROVIDER, 'deepseek');
assert.strictEqual(getModelName(), 'deepseek-v4-flash');
assert.strictEqual(getTtsModelName('edge'), 'edge-tts');
assert.strictEqual(getTtsModelName('gemini'), 'gemini-3.1-flash-tts-preview');
assert.deepStrictEqual(GEMINI_MODEL_OPTIONS, ['gemini-3.6-flash', 'gemini-3.5-flash-lite']);
assert.deepStrictEqual(DEEPSEEK_MODEL_OPTIONS, ['deepseek-v4-flash', 'deepseek-v4-pro']);
assert.strictEqual(normalizeAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeAIProvider('unknown'), 'deepseek');
assert.strictEqual(normalizeAIModel('deepseek', 'deepseek-v4-pro'), 'deepseek-v4-pro');
assert.strictEqual(normalizeAIModel('deepseek', 'unknown'), 'deepseek-v4-flash');
assert.strictEqual(normalizeAIModel('gemini', 'gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
assert.strictEqual(normalizeAIModel('gemini', 'deepseek-v4-pro'), 'gemini-3.6-flash');
assert.strictEqual(normalizeServerAIProvider('gemini'), 'gemini');
assert.strictEqual(normalizeServerAIProvider('deepseek'), 'deepseek');
assert.strictEqual(normalizeServerAIProvider('unknown'), 'deepseek');
assert.strictEqual(getModelName('deepseek'), 'deepseek-v4-flash');
assert.strictEqual(getModelName('deepseek', 'deepseek-v4-pro'), 'deepseek-v4-pro');
assert.strictEqual(getModelName('gemini', 'gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
assert.strictEqual(getModelName('gemini', 'deepseek-v4-pro'), 'gemini-3.6-flash');

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

assert.deepStrictEqual(getAnalyzeUsageEvent('gemini'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    image_recognition: 'false',
    image_provider: 'none',
    image_model: 'none',
    tts: 'false',
    tts_provider: 'none',
    tts_model: 'none',
  },
});
assert.deepStrictEqual(getAnalyzeUsageEvent('gemini', {}, 'gemini-3.5-flash-lite'), {
  name: ANALYZE_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
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
    model: 'gemini-3.6-flash',
    image_recognition: 'true',
    image_provider: 'gemini',
    image_model: 'gemini-3.6-flash',
    tts: 'true',
    tts_provider: 'gemini',
    tts_model: 'gemini-3.1-flash-tts-preview',
  },
});
assert.deepStrictEqual(getImageRecognitionUsageEvent('gemini'), {
  name: IMAGE_RECOGNITION_USAGE_EVENT_NAME,
  data: {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
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

assert.deepStrictEqual(getRequestProviderPayload('gemini'), {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
});

assert.deepStrictEqual(getRequestProviderPayload('gemini', 'gemini-3.5-flash-lite'), {
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
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

assert.deepStrictEqual(withProviderControls('gemini', { model: 'gemini-3.6-flash' }), {
  model: 'gemini-3.6-flash',
  reasoning_effort: 'minimal',
});

assert.deepStrictEqual(withProviderControls('gemini', { model: 'gemini-3.5-flash-lite' }), {
  model: 'gemini-3.5-flash-lite',
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

assert.deepStrictEqual(withProviderControls(
  'deepseek',
  { model: 'deepseek-v4-flash' },
  { enableThinking: true }
), {
  model: 'deepseek-v4-flash',
  thinking: { type: 'enabled' },
  reasoning_effort: 'high',
});

assert.deepStrictEqual(withProviderControls(
  'deepseek',
  { model: 'deepseek-v4-flash' },
  { enableThinking: true, reasoningEffort: 'low' }
), {
  model: 'deepseek-v4-flash',
  thinking: { type: 'enabled' },
  reasoning_effort: 'low',
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
  { model: 'gemini-3.6-flash' },
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
  assert.strictEqual(defaultGeminiConfig.model, 'gemini-3.6-flash');

  const liteGeminiConfig = resolveProviderConfig(
    createProviderConfigRequest(),
    { provider: 'gemini', model: 'gemini-3.5-flash-lite' }
  );
  assert.strictEqual(liteGeminiConfig.model, 'gemini-3.5-flash-lite');

  const invalidGeminiConfig = resolveProviderConfig(
    createProviderConfigRequest(),
    { provider: 'gemini', model: 'deepseek-v4-pro' }
  );
  assert.strictEqual(invalidGeminiConfig.model, 'gemini-3.6-flash');

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
  deepseekThinkingEnabled: 'true',
});
const migratedSettings = loadAISettingsFromStorage(migratedStorage);
assert.deepStrictEqual(migratedSettings, {
  aiProvider: 'deepseek',
  aiModel: 'deepseek-v4-pro',
  geminiApiKey: 'legacy-gemini-key',
  deepseekApiKey: 'deepseek-key',
  deepseekThinkingEnabled: true,
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
assert.strictEqual(defaultSettings.deepseekThinkingEnabled, false);

const geminiLiteStorage = new MemoryStorage({
  aiProvider: 'gemini',
  aiModel: 'gemini-3.5-flash-lite',
});
assert.strictEqual(loadAISettingsFromStorage(geminiLiteStorage).aiModel, 'gemini-3.5-flash-lite');

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
    '深度校對中…',
    '正在核对句子结构',
    '正在检查长段落中的细节',
    '正在继续核对剩余细节',
  ]);
  assert.ok(areReasoningSummariesSimilar('正在核对句子结构', '正在核对句子的结构'));
  assert.ok(!areReasoningSummariesSimilar('正在核对句子结构', '正在检查假名读音'));
  controller.cancel();
}

async function runChunkedAnalysisRetryTests() {
  const article = Array.from(
    { length: 150 },
    (_, index) => `長文試験${index + 1}では解析結果を原文と照合し、語順と記号を丁寧に確認する。`
  ).join('');
  const chunks = splitJapaneseText(article);
  assert.ok(chunks.length >= 16, '压力测试文本应拆成至少十六块');
  const truncatedChunkText = chunks[1].text;
  const retryChunkText = chunks[2].text;
  const attemptsByText = new Map<string, number>();
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let finalContent = '';
  let streamError: Error | null = null;

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const requestBody = JSON.parse(String(init?.body)) as {
      prompt: string;
      thinkingEnabled?: boolean;
    };
    assert.strictEqual(requestBody.thinkingEnabled, false);
    const marker = '待解析句子： "';
    const markerIndex = requestBody.prompt.lastIndexOf(marker);
    assert.ok(markerIndex >= 0);
    const sourceText = requestBody.prompt.slice(markerIndex + marker.length, -1);
    const attempt = (attemptsByText.get(sourceText) ?? 0) + 1;
    attemptsByText.set(sourceText, attempt);

    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeRequests -= 1;

    if (sourceText === truncatedChunkText && attempt === 1) {
      const truncatedResponseBody = [
        streamData({ choices: [{ delta: { content: '{"tokens":[' }, finish_reason: null }] }),
        streamData({ choices: [{ delta: {}, finish_reason: 'length' }] }),
      ].join('');
      return new Response(truncatedResponseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    const returnedText = sourceText === retryChunkText && attempt <= 2
      ? sourceText.replace('解析結果', '解析結論')
      : sourceText;
    const content = JSON.stringify({
      tokens: [{ word: returnedText, pos: '名詞', furigana: '', romaji: '' }],
    });
    const responseBody = [
      streamData({ choices: [{ delta: { content }, finish_reason: null }] }),
      streamData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ].join('');
    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    await streamAnalyzeSentence(
      article,
      (content, done) => {
        if (done) finalContent = content;
      },
      (error) => {
        streamError = error;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.strictEqual(streamError, null);
  assert.strictEqual(attemptsByText.get(truncatedChunkText), 1);
  assert.ok(
    [...attemptsByText.keys()].filter((text) => (
      text !== truncatedChunkText && truncatedChunkText.includes(text)
    )).length >= 2,
    'length 截断后应只把失败块拆成更小子块'
  );
  assert.strictEqual(attemptsByText.get(retryChunkText), 3, '只应重试还原失败的分块');
  assert.strictEqual(maxActiveRequests, 3, '长文流式分析应维持三个并发 worker');
  const finalTokens = (JSON.parse(finalContent) as { tokens: Array<{ word: string }> }).tokens;
  assert.strictEqual(finalTokens.map((token) => token.word).join(''), article);
}

async function runSingleChunkWhitespaceReconciliationTests() {
  const source = '甲。\n\n乙。丙。\n\n丁。';
  const returnedTokens = [
    { word: '甲。', pos: '名詞', furigana: '', romaji: '' },
    { word: '\n', pos: '改行', furigana: '', romaji: '' },
    { word: '乙。', pos: '名詞', furigana: '', romaji: '' },
    { word: '\n', pos: '改行', furigana: '', romaji: '' },
    { word: '丙。', pos: '名詞', furigana: '', romaji: '' },
    { word: '\n', pos: '改行', furigana: '', romaji: '' },
    { word: '丁。', pos: '名詞', furigana: '', romaji: '' },
  ];
  const whitespaceReconciled = reconcileTokenWhitespaceToSource(source, returnedTokens);
  assert.ok(whitespaceReconciled);
  assert.strictEqual(
    whitespaceReconciled?.map((token) => token.word).join(''),
    source,
    '审校兜底应只按原文恢复段落空白'
  );
  assert.strictEqual(
    reconcileTokenWhitespaceToSource(
      source,
      [{ word: '甲。\n\n错。丙。\n\n丁。', pos: '名詞', furigana: '', romaji: '' }]
    ),
    null,
    '正文字符不一致时不得用空白校正掩盖'
  );

  const originalFetch = globalThis.fetch;
  let finalContent = '';
  let streamError: Error | null = null;
  globalThis.fetch = async () => new Response([
    streamData({
      choices: [{
        delta: { content: JSON.stringify({ tokens: returnedTokens }) },
        finish_reason: null,
      }],
    }),
    streamData({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
  ].join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

  try {
    await streamAnalyzeSentence(
      source,
      (content, done) => {
        if (done) finalContent = content;
      },
      (error) => {
        streamError = error;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.strictEqual(streamError, null);
  const finalTokens = (JSON.parse(finalContent) as { tokens: Array<{ word: string }> }).tokens;
  assert.strictEqual(finalTokens.map((token) => token.word).join(''), source);
}

async function runProofreadStreamTests() {
  const originalFetch = globalThis.fetch;
  const reasoningEvents: Array<{ text: string; done: boolean }> = [];
  const progressEvents: Array<{ completed: number; total: number; sentence: number; status: string }> = [];
  const completedSentenceIndexes: number[] = [];
  const usageSentenceIndexes: number[] = [];
  const batchTokens = [
    { word: '私', pos: '代名詞', furigana: 'わたし' },
    { word: 'は', pos: '助詞', furigana: '' },
    { word: '。', pos: '記号', furigana: '' },
    { word: '君', pos: '代名詞', furigana: 'きみ' },
    { word: 'も', pos: '助詞', furigana: '' },
    { word: '。', pos: '記号', furigana: '' },
    { word: '彼', pos: '代名詞', furigana: 'かれ' },
    { word: 'ら', pos: '接尾辞', furigana: '' },
    { word: '。', pos: '記号', furigana: '' },
  ];
  const responses: Record<string, { content: string; finishReason: string }> = {
    '私は。': {
      content: '[{"index":0,"field":"kana","correct":"わたし","why":"语境读音"}]',
      finishReason: 'stop',
    },
    '君も。': {
      content: '[{"indexes":[0,1],"field":"seg","correct":"君|も","why":"词界错误"}]',
      finishReason: 'stop',
    },
    '彼ら。': {
      content: '[{"index":0,"field":"pos","correct":"名詞"',
      finishReason: 'length',
    },
  };
  let requestCount = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestCount += 1;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    assert.strictEqual(String(input), '/api/proofread');
    const requestBody = JSON.parse(String(init?.body)) as {
      source: string;
      tokens: unknown[];
      previousSource: string;
      nextSource: string;
      provider: string;
      model: string;
    };
    assert.strictEqual(requestBody.tokens.length, 3);
    assert.strictEqual(requestBody.provider, 'deepseek');
    assert.strictEqual(requestBody.model, 'deepseek-v4-flash');
    assert.ok(init?.signal);
    if (requestBody.source === '私は。') {
      assert.strictEqual(requestBody.previousSource, '');
      assert.strictEqual(requestBody.nextSource, '君も。');
    }
    if (requestBody.source === '君も。') {
      assert.strictEqual(requestBody.previousSource, '私は。');
      assert.strictEqual(requestBody.nextSource, '彼ら。');
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeRequests -= 1;
    const responseSpec = responses[requestBody.source];
    assert.ok(responseSpec);
    const sentenceNumber = requestBody.source === '私は。'
      ? 1
      : requestBody.source === '君も。'
        ? 2
        : 3;
    const completionTokens = 99 + sentenceNumber;
    const reasoningTokens = 79 + sentenceNumber;
    return new Response([
      streamData({ choices: [{ delta: { reasoning_content: `核对第${sentenceNumber}句。` }, finish_reason: null }] }),
      streamData({ choices: [{ delta: { content: responseSpec.content }, finish_reason: null }] }),
      streamData({
        choices: [],
        usage: {
          prompt_tokens: 1_000,
          completion_tokens: completionTokens,
          total_tokens: 1_000 + completionTokens,
          completion_tokens_details: { reasoning_tokens: reasoningTokens },
        },
      }),
      streamData({ choices: [{ delta: {}, finish_reason: responseSpec.finishReason }] }),
      'data: [DONE]\n\n',
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  try {
    const result = await streamProofreadTokens(
      '私は。君も。彼ら。',
      batchTokens,
      undefined,
      'deepseek-v4-flash',
      {
        onReasoning: (text, done) => reasoningEvents.push({ text, done }),
        onUsage: (_usage, sentenceIndex) => usageSentenceIndexes.push(sentenceIndex),
        onSentenceComplete: (sentenceResult) => {
          completedSentenceIndexes.push(sentenceResult.sentenceIndex);
        },
        onProgress: (completed, total, sentenceResult) => {
          progressEvents.push({
            completed,
            total,
            sentence: sentenceResult.sentenceIndex,
            status: sentenceResult.status,
          });
        },
      }
    );
    assert.deepStrictEqual(result.corrections, [
      { indexes: [0], field: 'kana', correct: 'わたし', why: '语境读音' },
      { indexes: [3, 4], field: 'seg', correct: '君|も', why: '词界错误' },
    ]);
    assert.strictEqual(result.recoveredFromTruncation, false);
    assert.strictEqual(result.totalSentences, 3);
    assert.strictEqual(result.completedSentences, 2);
    assert.strictEqual(result.failedSentences, 1);
    assert.strictEqual(result.sentenceResults[2].status, 'failed');
    assert.match(result.sentenceResults[2].error || '', /length/u);
    assert.deepStrictEqual(result.usage, {
      promptTokens: 3_000,
      completionTokens: 303,
      reasoningTokens: 243,
      outputTokens: 60,
      totalTokens: 3_303,
    });
    assert.strictEqual(requestCount, 3);
    assert.strictEqual(maxActiveRequests, 2);
    assert.deepStrictEqual([...completedSentenceIndexes].sort(), [0, 1]);
    assert.deepStrictEqual([...usageSentenceIndexes].sort(), [0, 1, 2]);
    assert.strictEqual(progressEvents.length, 3);
    assert.strictEqual(progressEvents.at(-1)?.completed, 2);
    assert.strictEqual(reasoningEvents.at(-1)?.done, true);
    assert.match(reasoningEvents.at(-1)?.text || '', /第 1 句/u);
    assert.match(reasoningEvents.at(-1)?.text || '', /第 3 句/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Promise.all([
  runOpenAIContentStreamTests(),
  runReasoningSummaryControllerTests(),
])
  .then(() => runSingleChunkWhitespaceReconciliationTests())
  .then(() => runChunkedAnalysisRetryTests())
  .then(() => runProofreadStreamTests())
  .then(() => {
    console.log('All tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
