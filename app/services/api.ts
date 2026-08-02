// API与分析相关的服务函数
import {
  DEFAULT_AI_PROVIDER,
  getModelName,
  normalizeAIModel,
  normalizeAIProvider,
  type AIModelName,
  type AIProvider,
} from '../lib/aiModels';
import { splitJapaneseText, type JapaneseTextChunk } from '../utils/japaneseChunking';
import { normalizeEscapedLineBreaks } from '../utils/markdown';
import {
  parseProofreadCorrections,
  PROOFREAD_OVERALL_MIN_TIMEOUT_MS,
  PROOFREAD_OVERALL_PER_SENTENCE_MS,
  PROOFREAD_SENTENCE_CONCURRENCY,
  PROOFREAD_SENTENCE_TIMEOUT_MS,
  splitProofreadSentenceJobs,
  type ProofreadCorrection,
  type ProofreadField,
  type ProofreadSentenceJob,
} from '../utils/proofreading';

export {
  DEFAULT_AI_PROVIDER,
  DEEPSEEK_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  getModelName,
  normalizeAIModel,
  normalizeAIProvider,
} from '../lib/aiModels';
export type {
  AIModelName,
  AIProvider,
  DeepSeekModelName,
  GeminiModelName,
} from '../lib/aiModels';

export interface TokenData {
  word: string;
  pos: string;
  furigana?: string;
  romaji?: string;
  proofreadSourceIndexes?: number[];
  proofreadReview?: {
    fields: ProofreadField[];
    why: string;
    revision: number;
  };
}

export interface WordDetail {
  originalWord: string;
  chineseTranslation: string;
  pos: string;
  furigana?: string;
  romaji?: string;
  dictionaryForm?: string;
  explanation: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type TTSProvider = 'edge' | 'gemini';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface StoredAISettings {
  aiProvider: AIProvider;
  aiModel: AIModelName;
  geminiApiKey: string;
  deepseekApiKey: string;
  deepseekThinkingEnabled: boolean;
}

export interface AnalyzeRequestOptions {
  deepseekThinkingEnabled?: boolean;
  onReasoning?: (text: string, done: boolean) => void;
  onContentStart?: () => void;
  signal?: AbortSignal;
}

export interface ReasoningSummaryRequestOptions {
  reasoningSnippet: string;
  userApiKey?: string;
  signal?: AbortSignal;
}

export interface ProofreadRequestOptions {
  signal?: AbortSignal;
  onReasoning?: (text: string, done: boolean) => void;
  onUsage?: (usage: StreamTokenUsage, sentenceIndex: number) => void;
  onStart?: (totalSentences: number) => void;
  onProgress?: (
    completedSentences: number,
    totalSentences: number,
    result: ProofreadSentenceResult
  ) => void;
  onSentenceComplete?: (result: ProofreadSentenceResult) => void;
}

export interface StreamTokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ProofreadResult {
  corrections: ProofreadCorrection[];
  rawContent: string;
  recoveredFromTruncation: boolean;
  usage: StreamTokenUsage | null;
  sentenceResults: ProofreadSentenceResult[];
  totalSentences: number;
  completedSentences: number;
  failedSentences: number;
}

export interface ProofreadSentenceResult {
  sentenceIndex: number;
  source: string;
  status: 'completed' | 'failed';
  corrections: ProofreadCorrection[];
  rawContent: string;
  usage: StreamTokenUsage | null;
  error?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const ANALYSIS_CHUNK_CONCURRENCY = 3;
const ANALYSIS_CHUNK_MAX_ATTEMPTS = 3;
const ANALYSIS_TRUNCATION_SPLIT_MAX_DEPTH = 3;
const NON_LEXICAL_CHARACTER_PATTERN = /[\s\p{P}\p{S}]/u;

// 默认API地址 - 使用本地API路由
export const DEFAULT_API_URL = "/api";
const GEMINI_TTS_MODEL_NAME = 'gemini-3.1-flash-tts-preview';
const EDGE_TTS_MODEL_NAME = 'edge-tts';
const EDGE_TTS_URL = 'https://api.howen.ink/api/tts';
const EDGE_TTS_VOICES = {
  male: 'ja-JP-KeitaNeural',
  female: 'ja-JP-NanamiNeural',
};

export function getTtsModelName(provider: TTSProvider = 'edge'): string {
  return provider === 'gemini' ? GEMINI_TTS_MODEL_NAME : EDGE_TTS_MODEL_NAME;
}

export function getRequestProviderPayload(
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
) {
  return {
    provider,
    model: getModelName(provider, model),
  };
}

export function loadAISettingsFromStorage(storage: StorageLike): StoredAISettings {
  const legacyApiKey = storage.getItem('userApiKey') || '';

  let geminiApiKey = storage.getItem('geminiApiKey');
  if (geminiApiKey === null && legacyApiKey) {
    geminiApiKey = legacyApiKey;
    storage.setItem('geminiApiKey', legacyApiKey);
  }

  const aiProvider = normalizeAIProvider(storage.getItem('aiProvider'));

  return {
    aiProvider,
    aiModel: normalizeAIModel(aiProvider, storage.getItem('aiModel')),
    geminiApiKey: geminiApiKey || '',
    deepseekApiKey: storage.getItem('deepseekApiKey') || '',
    deepseekThinkingEnabled: storage.getItem('deepseekThinkingEnabled') === 'true',
  };
}

// 获取API请求URL
export function getApiEndpoint(endpoint: string): string {
  return `${DEFAULT_API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
}

// 构建请求头
function getHeaders(userApiKey?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  
  // 如果用户提供了自定义API密钥，则添加到请求头
  if (userApiKey) {
    headers['Authorization'] = `Bearer ${userApiKey}`;
  }
  
  return headers;
}

function buildAnalyzePrompt(sentence: string): string {
  return `请对以下日语句子进行词法分析，采用【日本学校文法（学校文法／教育文法）】体系，只返回严格有效的 JSON 对象，不要包含任何 markdown 或其他非 JSON 字符。

JSON 对象必须包含 "tokens" 数组；数组里每个对象必须包含字符串字段："word", "pos", "furigana", "romaji"。

【最重要——原文完整性】
0. 按顺序拼接所有 tokens[].word 后，必须与待解析原文逐字符完全一致。不得省略任何助词、标点、数字、空格或换行，不得改写、纠错、增补或规范化原文。特别注意「には」「とは」「でも」等连续助词必须逐个保留并按学校文法切分。

【切分原则——按学校文法切分到単語级别】
1. 助動詞与动词分开。如「食べた」拆为「食べ」(動詞)＋「た」(助動詞)；「笑えない」拆为「笑え」(動詞)＋「ない」(助動詞)。
2. 「て形＋补助动词」必须拆开，标注为：动词＋助詞「て／で」＋补助动词。补助动词为封闭集合，包括：いる・ある・いく・ゆく・くる・しまう・おく・みる・もらう・くれる・あげる・いただく 等。例如「並んでいる」拆为「並ん」(動詞)＋「で」(助詞)＋「いる」(動詞)。
3. 形容動詞作为一个单词处理，不拆分。如「苦手だ」「静かだ」「綺麗だ」整体标为「形容動詞」，不要拆成名詞＋助動詞。
4. 助詞与前后词汇分离。
5. 区分两种「ない」：接在动词后表否定的标为「助動詞」；表示"不存在／没有"的标为「形容詞」。

【读音（furigana）——结合语境判断】
6. 对同形異音語（同一汉字写法存在多个读音且意义不同的词），必须结合整句语境与该词的实际语义选择正确读音，不可一律采用最高频读音。furigana 一律使用平假名。

【词性标签——学校文法十大品詞】
7. "pos" 必须使用日文标签，从以下封闭集合中选择：名詞、代名詞、動詞、形容詞、形容動詞、副詞、連体詞、接続詞、感動詞、助詞、助動詞、記号、改行。（补助动词归入「動詞」）

【标点与换行】
8. 标点符号只能输出为 {"word": "标点原文", "pos": "記号", "furigana": "", "romaji": ""}，不分配其他词性。包括但不限于：。 、 ， . , ？ ? ！ ! ： : ； ; 「 」 『 』 （ ） ( ) 等。
9. 若句中包含换行符，在对应位置输出 {"word": "\\n", "pos": "改行", "furigana": "", "romaji": ""}。

返回格式示例：
{
  "tokens": [
    { "word": "落ち", "pos": "動詞", "furigana": "おち", "romaji": "ochi" },
    { "word": "て", "pos": "助詞", "furigana": "", "romaji": "te" },
    { "word": "ゆく", "pos": "動詞", "furigana": "", "romaji": "yuku" },
    { "word": "。", "pos": "記号", "furigana": "", "romaji": "" }
  ]
}

待解析句子： "${sentence}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractJsonText(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }

  return content.trim();
}

function normalizeTokenDataArray(parsed: unknown): TokenData[] {
  const rawTokens = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.tokens)
      ? parsed.tokens
      : null;

  if (!rawTokens) {
    throw new Error('解析结果缺少 tokens 数组');
  }

  const tokens = rawTokens
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => typeof item.word === 'string' && typeof item.pos === 'string')
    .map((item) => ({
      word: item.word as string,
      pos: item.pos as string,
      furigana: typeof item.furigana === 'string' ? item.furigana : '',
      romaji: typeof item.romaji === 'string' ? item.romaji : '',
    }));

  if (tokens.length === 0) {
    throw new Error('解析结果没有有效词项');
  }

  return tokens;
}

export function parseAnalyzeResponseContent(content: string): TokenData[] {
  return normalizeTokenDataArray(JSON.parse(extractJsonText(content)));
}

export async function summarizeDeepSeekReasoningProgress(
  options: ReasoningSummaryRequestOptions
): Promise<string> {
  const response = await fetch(getApiEndpoint('/reasoning-summary'), {
    method: 'POST',
    headers: getHeaders(options.userApiKey),
    body: JSON.stringify({
      reasoningSnippet: options.reasoningSnippet,
    }),
    signal: options.signal,
  });

  const data = await response.json().catch(() => null) as {
    summary?: unknown;
    error?: { message?: unknown };
  } | null;

  if (!response.ok) {
    const message = typeof data?.error?.message === 'string'
      ? data.error.message
      : response.statusText || '思考摘要生成失败';
    throw new Error(message);
  }

  if (typeof data?.summary !== 'string' || !data.summary.trim()) {
    throw new Error('思考摘要响应格式错误');
  }

  return data.summary.trim();
}

async function streamProofreadSentence(
  job: ProofreadSentenceJob,
  userApiKey: string | undefined,
  model: string | null | undefined,
  signal: AbortSignal,
  onReasoning: (text: string) => void,
  onUsage: (usage: StreamTokenUsage) => void
): Promise<Omit<ProofreadSentenceResult, 'sentenceIndex' | 'source' | 'status'>> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(new DOMException('单句审校超时', 'TimeoutError'));
  }, PROOFREAD_SENTENCE_TIMEOUT_MS);
  const requestSignal = AbortSignal.any([signal, timeoutController.signal]);

  try {
    const response = await fetch(getApiEndpoint('/proofread'), {
      method: 'POST',
      headers: getHeaders(userApiKey),
      body: JSON.stringify({
        source: job.source,
        tokens: job.tokens,
        previousSource: job.previousSource,
        nextSource: job.nextSource,
        ...getRequestProviderPayload('deepseek', model),
      }),
      signal: requestSignal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null) as {
        error?: { message?: unknown };
      } | null;
      const message = typeof data?.error?.message === 'string'
        ? data.error.message
        : response.statusText || '深度审校失败';
      throw new Error(message);
    }

    let finalCorrections: ProofreadCorrection[] | null = null;
    let rawContent = '';
    let streamError: Error | null = null;
    let usage: StreamTokenUsage | null = null;
    await readOpenAIContentStream(
      response,
      (content, isDone) => {
        rawContent = content;
        if (isDone) {
          finalCorrections = parseProofreadCorrections(content, job.tokens.length);
        }
      },
      (error) => {
        streamError = error;
      },
      {
        debounceMs: 0,
        parseWarning: 'Failed to parse proofreading JSON chunk:',
        validateFinalContent: (content) => parseProofreadCorrections(content, job.tokens.length),
        invalidContentMessage: '深度审校结果没有完整生成。',
        completionLabel: '深度审校',
        onReasoning: (text) => onReasoning(text),
        onUsage: (streamUsage) => {
          usage = streamUsage;
          onUsage(streamUsage);
        },
      }
    );

    const resolvedStreamError = streamError as Error | null;
    if (resolvedStreamError) throw resolvedStreamError;
    if (!finalCorrections) throw new Error('深度审校没有返回完整结果');
    return {
      corrections: finalCorrections,
      rawContent,
      usage,
    };
  } catch (error) {
    if (timedOut) throw new Error(`第 ${job.sentenceIndex + 1} 句超过 60 秒，已跳过`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function addTokenUsage(
  total: StreamTokenUsage | null,
  usage: StreamTokenUsage | null
): StreamTokenUsage | null {
  if (!usage) return total;
  if (!total) return { ...usage };
  return {
    promptTokens: total.promptTokens + usage.promptTokens,
    completionTokens: total.completionTokens + usage.completionTokens,
    reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  };
}

export async function streamProofreadTokens(
  source: string,
  tokens: readonly TokenData[],
  userApiKey?: string,
  model?: string | null,
  options: ProofreadRequestOptions = {}
): Promise<ProofreadResult> {
  if (!source || tokens.length === 0) {
    throw new Error('缺少原文或完整分词底稿');
  }

  const jobs = splitProofreadSentenceJobs(source, tokens);
  if (jobs.length === 0) throw new Error('审校分句结果为空');
  options.onStart?.(jobs.length);

  const overallTimeoutController = new AbortController();
  const overallTimeoutMs = Math.max(
    PROOFREAD_OVERALL_MIN_TIMEOUT_MS,
    jobs.length * PROOFREAD_OVERALL_PER_SENTENCE_MS
  );
  let overallTimedOut = false;
  const overallTimeout = setTimeout(() => {
    overallTimedOut = true;
    overallTimeoutController.abort(new DOMException('整体审校超时', 'TimeoutError'));
  }, overallTimeoutMs);
  const batchSignal = options.signal
    ? AbortSignal.any([options.signal, overallTimeoutController.signal])
    : overallTimeoutController.signal;
  const results: Array<ProofreadSentenceResult | null> = Array(jobs.length).fill(null);
  const reasoningBySentence = Array(jobs.length).fill('') as string[];
  let aggregateReasoning = '';
  let nextJobIndex = 0;
  let completedSentences = 0;

  const appendReasoning = (sentenceIndex: number, fullText: string) => {
    const previousText = reasoningBySentence[sentenceIndex];
    const delta = fullText.startsWith(previousText)
      ? fullText.slice(previousText.length)
      : fullText;
    if (!delta) return;
    reasoningBySentence[sentenceIndex] = fullText;
    if (!previousText) {
      aggregateReasoning += `${aggregateReasoning ? '\n' : ''}【第 ${sentenceIndex + 1} 句】\n`;
    }
    aggregateReasoning += delta;
    options.onReasoning?.(aggregateReasoning, false);
  };

  const runJob = async (job: ProofreadSentenceJob): Promise<ProofreadSentenceResult> => {
    let sentenceUsage: StreamTokenUsage | null = null;
    try {
      const localResult = await streamProofreadSentence(
        job,
        userApiKey,
        model,
        batchSignal,
        (text) => appendReasoning(job.sentenceIndex, text),
        (usage) => {
          sentenceUsage = usage;
          options.onUsage?.(usage, job.sentenceIndex);
        }
      );
      const result: ProofreadSentenceResult = {
        sentenceIndex: job.sentenceIndex,
        source: job.source,
        status: 'completed',
        corrections: localResult.corrections.map((correction) => ({
          ...correction,
          indexes: correction.indexes.map((index) => job.tokenStart + index),
        })),
        rawContent: localResult.rawContent,
        usage: localResult.usage,
      };
      completedSentences += 1;
      options.onSentenceComplete?.(result);
      return result;
    } catch (error) {
      const message = overallTimedOut
        ? '整体审校到达时间上限，已跳过'
        : error instanceof Error
          ? error.message
          : '单句审校失败';
      return {
        sentenceIndex: job.sentenceIndex,
        source: job.source,
        status: 'failed',
        corrections: [],
        rawContent: '',
        usage: sentenceUsage,
        error: message,
      };
    }
  };

  const worker = async () => {
    while (!batchSignal.aborted) {
      const jobIndex = nextJobIndex;
      nextJobIndex += 1;
      if (jobIndex >= jobs.length) return;
      const result = await runJob(jobs[jobIndex]);
      results[jobIndex] = result;
      options.onProgress?.(completedSentences, jobs.length, result);
    }
  };

  try {
    await Promise.all(
      Array.from(
        { length: Math.min(PROOFREAD_SENTENCE_CONCURRENCY, jobs.length) },
        () => worker()
      )
    );

    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException('审校已取消', 'AbortError');
    }

    for (let index = 0; index < results.length; index += 1) {
      if (results[index]) continue;
      const skippedResult: ProofreadSentenceResult = {
        sentenceIndex: index,
        source: jobs[index].source,
        status: 'failed',
        corrections: [],
        rawContent: '',
        usage: null,
        error: overallTimedOut ? '整体审校到达时间上限，已跳过' : '单句未执行',
      };
      results[index] = skippedResult;
      options.onProgress?.(completedSentences, jobs.length, skippedResult);
    }

    const sentenceResults = results.filter(
      (result): result is ProofreadSentenceResult => result !== null
    );
    const corrections = sentenceResults
      .flatMap((result) => result.corrections)
      .sort((left, right) => left.indexes[0] - right.indexes[0]);
    const usage = sentenceResults.reduce<StreamTokenUsage | null>(
      (total, result) => addTokenUsage(total, result.usage),
      null
    );
    options.onReasoning?.(aggregateReasoning, true);

    return {
      corrections,
      rawContent: JSON.stringify(sentenceResults.map((result) => ({
        sentence: result.sentenceIndex + 1,
        status: result.status,
        content: result.rawContent,
        error: result.error,
      }))),
      recoveredFromTruncation: false,
      usage,
      sentenceResults,
      totalSentences: jobs.length,
      completedSentences,
      failedSentences: jobs.length - completedSentences,
    };
  } finally {
    clearTimeout(overallTimeout);
  }
}

function reconstructTokenText(tokens: TokenData[]): string {
  return tokens.map((token) => token.word).join('');
}

function isNonLexicalCharacter(character: string): boolean {
  return NON_LEXICAL_CHARACTER_PATTERN.test(character);
}

function createSourceSeparatorToken(character: string): TokenData {
  return {
    word: character,
    pos: character === '\n' || character === '\r' ? '改行' : '記号',
    furigana: '',
    romaji: '',
  };
}

function alignTokenWhitespaceToSource(source: string, tokens: TokenData[]): TokenData[] | null {
  const sourceWithoutWhitespace = source.replace(/\s/gu, '');
  const tokensWithoutWhitespace = tokens
    .map((token) => token.word.replace(/\s/gu, ''))
    .join('');
  if (sourceWithoutWhitespace !== tokensWithoutWhitespace) return null;

  const alignedTokens: TokenData[] = [];
  let sourceIndex = 0;

  const appendSourceWhitespace = () => {
    while (sourceIndex < source.length && /\s/u.test(source[sourceIndex])) {
      const character = source[sourceIndex];
      alignedTokens.push(createSourceSeparatorToken(character));
      sourceIndex += 1;
    }
  };

  for (const token of tokens) {
    const normalizedWord = token.word.replace(/\s/gu, '');
    if (!normalizedWord) continue;

    let segment = '';
    let emittedSegment = false;
    const flushSegment = () => {
      if (!segment) return;
      alignedTokens.push({
        ...token,
        word: segment,
        furigana: emittedSegment ? '' : token.furigana,
        romaji: emittedSegment ? '' : token.romaji,
      });
      emittedSegment = true;
      segment = '';
    };

    appendSourceWhitespace();
    for (const character of normalizedWord) {
      if (/\s/u.test(source[sourceIndex] || '')) {
        flushSegment();
        appendSourceWhitespace();
      }
      if (!source.startsWith(character, sourceIndex)) return null;
      segment += character;
      sourceIndex += character.length;
    }
    flushSegment();
  }

  appendSourceWhitespace();
  return sourceIndex === source.length ? alignedTokens : null;
}

export function reconcileTokenWhitespaceToSource(
  source: string,
  tokens: TokenData[]
): TokenData[] | null {
  if (reconstructTokenText(tokens) === source) return tokens;
  return alignTokenWhitespaceToSource(source, tokens);
}

function alignTokenSeparatorsToSource(source: string, tokens: TokenData[]): TokenData[] | null {
  const sourceCharacters = Array.from(source);
  const sourceLexicalText = sourceCharacters
    .filter((character) => !isNonLexicalCharacter(character))
    .join('');
  const tokenLexicalText = tokens
    .flatMap((token) => Array.from(token.word))
    .filter((character) => !isNonLexicalCharacter(character))
    .join('');
  if (sourceLexicalText !== tokenLexicalText) return null;

  const alignedTokens: TokenData[] = [];
  let sourceIndex = 0;

  const appendSourceSeparators = () => {
    while (
      sourceIndex < sourceCharacters.length
      && isNonLexicalCharacter(sourceCharacters[sourceIndex])
    ) {
      alignedTokens.push(createSourceSeparatorToken(sourceCharacters[sourceIndex]));
      sourceIndex += 1;
    }
  };

  for (const token of tokens) {
    const lexicalCharacters = Array.from(token.word)
      .filter((character) => !isNonLexicalCharacter(character));
    if (lexicalCharacters.length === 0) continue;

    let segment = '';
    let emittedSegment = false;
    const flushSegment = () => {
      if (!segment) return;
      alignedTokens.push({
        ...token,
        word: segment,
        furigana: emittedSegment ? '' : token.furigana,
        romaji: emittedSegment ? '' : token.romaji,
      });
      emittedSegment = true;
      segment = '';
    };

    appendSourceSeparators();
    for (const character of lexicalCharacters) {
      if (isNonLexicalCharacter(sourceCharacters[sourceIndex] || '')) {
        flushSegment();
        appendSourceSeparators();
      }
      if (sourceCharacters[sourceIndex] !== character) return null;
      segment += sourceCharacters[sourceIndex];
      sourceIndex += 1;
    }
    flushSegment();
  }

  appendSourceSeparators();
  return sourceIndex === sourceCharacters.length ? alignedTokens : null;
}

function normalizeHistoricalKana(value: string): string {
  const voicedKana: Record<string, string> = {
    か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
    さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
    た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
    は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
  };
  let expanded = '';
  for (const character of Array.from(value)) {
    if (character === 'ゝ' && expanded) {
      expanded += Array.from(expanded).at(-1) ?? '';
    } else if (character === 'ゞ' && expanded) {
      const previous = Array.from(expanded).at(-1) ?? '';
      expanded += voicedKana[previous] ?? previous;
    } else {
      expanded += character;
    }
  }

  return expanded
    .replace(/[ゐヰ]/gu, 'い')
    .replace(/[ゑヱ]/gu, 'え')
    .replace(/ぢ/gu, 'じ')
    .replace(/づ/gu, 'ず')
    .replace(/へ/gu, 'え')
    .replace(/ひ/gu, 'い')
    .replace(/ふ/gu, 'う');
}

function alignTokenOrthographyToSource(source: string, tokens: TokenData[]): TokenData[] | null {
  const sourceCharacters = Array.from(source);
  const alignedTokens: TokenData[] = [];
  let sourceIndex = 0;

  const appendSourceSeparators = () => {
    while (
      sourceIndex < sourceCharacters.length
      && isNonLexicalCharacter(sourceCharacters[sourceIndex])
    ) {
      alignedTokens.push(createSourceSeparatorToken(sourceCharacters[sourceIndex]));
      sourceIndex += 1;
    }
  };

  const sourceStartsWith = (candidate: string): string | null => {
    const candidateCharacters = Array.from(candidate);
    const sourceSlice = sourceCharacters
      .slice(sourceIndex, sourceIndex + candidateCharacters.length)
      .join('');
    return sourceSlice === candidate ? sourceSlice : null;
  };

  const sourceHistoricallyMatches = (candidate: string): string | null => {
    const candidateCharacters = Array.from(candidate);
    const sourceSlice = sourceCharacters
      .slice(sourceIndex, sourceIndex + candidateCharacters.length)
      .join('');
    return normalizeHistoricalKana(sourceSlice) === normalizeHistoricalKana(candidate)
      ? sourceSlice
      : null;
  };

  for (const token of tokens) {
    const lexicalWord = Array.from(token.word)
      .filter((character) => !isNonLexicalCharacter(character))
      .join('');
    if (!lexicalWord) continue;

    appendSourceSeparators();
    const lexicalFurigana = Array.from(token.furigana || '')
      .filter((character) => !isNonLexicalCharacter(character))
      .join('');
    const hasKanji = /[\p{Script=Han}々〆ヵヶ]/u.test(lexicalWord);
    const wordWithReading = hasKanji && lexicalFurigana && lexicalFurigana !== lexicalWord
      ? sourceStartsWith(`${lexicalWord}${lexicalFurigana}`)
      : null;
    const matchedSource = wordWithReading
      ?? sourceStartsWith(lexicalWord)
      ?? (hasKanji && lexicalFurigana ? sourceStartsWith(lexicalFurigana) : null)
      ?? sourceHistoricallyMatches(lexicalWord)
      ?? (hasKanji && lexicalFurigana ? sourceHistoricallyMatches(lexicalFurigana) : null);
    if (!matchedSource) return null;

    alignedTokens.push({ ...token, word: matchedSource });
    sourceIndex += Array.from(matchedSource).length;
  }

  appendSourceSeparators();
  return sourceIndex === sourceCharacters.length ? alignedTokens : null;
}

interface CharacterAlignmentOperation {
  sourceCharacter: string | null;
  returnedCharacter: string | null;
  returnedIndex: number | null;
  matches: boolean;
}

function alignMinorKanaEditsToSource(source: string, tokens: TokenData[]): TokenData[] | null {
  const sourceCharacters = Array.from(source);
  const returnedCharacters: string[] = [];
  const returnedTokenIndexes: number[] = [];
  tokens.forEach((token, tokenIndex) => {
    Array.from(token.word).forEach((character) => {
      returnedCharacters.push(character);
      returnedTokenIndexes.push(tokenIndex);
    });
  });

  const sourceLength = sourceCharacters.length;
  const returnedLength = returnedCharacters.length;
  const distances = Array.from(
    { length: sourceLength + 1 },
    () => new Uint16Array(returnedLength + 1)
  );
  for (let sourceIndex = 0; sourceIndex <= sourceLength; sourceIndex += 1) {
    distances[sourceIndex][0] = sourceIndex;
  }
  for (let returnedIndex = 0; returnedIndex <= returnedLength; returnedIndex += 1) {
    distances[0][returnedIndex] = returnedIndex;
  }

  for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex += 1) {
    for (let returnedIndex = 1; returnedIndex <= returnedLength; returnedIndex += 1) {
      const substitutionCost = sourceCharacters[sourceIndex - 1] === returnedCharacters[returnedIndex - 1]
        ? 0
        : 1;
      distances[sourceIndex][returnedIndex] = Math.min(
        distances[sourceIndex - 1][returnedIndex - 1] + substitutionCost,
        distances[sourceIndex - 1][returnedIndex] + 1,
        distances[sourceIndex][returnedIndex - 1] + 1
      );
    }
  }

  const editDistance = distances[sourceLength][returnedLength];
  const maximumEdits = Math.max(12, Math.ceil(Math.max(sourceLength, returnedLength) * 0.08));
  if (editDistance > maximumEdits) return null;

  const operations: CharacterAlignmentOperation[] = [];
  let sourceIndex = sourceLength;
  let returnedIndex = returnedLength;
  while (sourceIndex > 0 || returnedIndex > 0) {
    const sourceCharacter = sourceIndex > 0 ? sourceCharacters[sourceIndex - 1] : null;
    const returnedCharacter = returnedIndex > 0 ? returnedCharacters[returnedIndex - 1] : null;
    const matches = sourceCharacter !== null && sourceCharacter === returnedCharacter;
    if (
      sourceIndex > 0
      && returnedIndex > 0
      && distances[sourceIndex][returnedIndex]
        === distances[sourceIndex - 1][returnedIndex - 1] + (matches ? 0 : 1)
    ) {
      operations.push({
        sourceCharacter,
        returnedCharacter,
        returnedIndex: returnedIndex - 1,
        matches,
      });
      sourceIndex -= 1;
      returnedIndex -= 1;
    } else if (
      sourceIndex > 0
      && distances[sourceIndex][returnedIndex] === distances[sourceIndex - 1][returnedIndex] + 1
    ) {
      operations.push({
        sourceCharacter,
        returnedCharacter: null,
        returnedIndex: null,
        matches: false,
      });
      sourceIndex -= 1;
    } else {
      operations.push({
        sourceCharacter: null,
        returnedCharacter,
        returnedIndex: returnedIndex - 1,
        matches: false,
      });
      returnedIndex -= 1;
    }
  }
  operations.reverse();

  let matchingCharacters = 0;
  let currentEditRun = 0;
  let maximumEditRun = 0;
  for (const operation of operations) {
    if (operation.matches) {
      matchingCharacters += 1;
      currentEditRun = 0;
      continue;
    }
    currentEditRun += 1;
    maximumEditRun = Math.max(maximumEditRun, currentEditRun);
    if (
      (operation.sourceCharacter && /[\p{Script=Han}々〆ヵヶ]/u.test(operation.sourceCharacter))
      || (operation.returnedCharacter && /[\p{Script=Han}々〆ヵヶ]/u.test(operation.returnedCharacter))
    ) {
      return null;
    }
  }
  if (maximumEditRun > 12) return null;
  if (matchingCharacters / Math.max(1, sourceLength, returnedLength) < 0.9) return null;

  const nextTokenIndexes = Array<number | null>(operations.length).fill(null);
  let nextTokenIndex: number | null = null;
  for (let operationIndex = operations.length - 1; operationIndex >= 0; operationIndex -= 1) {
    const operation = operations[operationIndex];
    if (operation.returnedIndex !== null) {
      nextTokenIndex = returnedTokenIndexes[operation.returnedIndex] ?? nextTokenIndex;
    }
    nextTokenIndexes[operationIndex] = nextTokenIndex;
  }

  const alignedTokens: TokenData[] = [];
  const emittedTokenIndexes = new Set<number>();
  let previousTokenIndex: number | null = null;
  let activeTokenIndex: number | null = null;
  let activeSegment = '';
  const flushSegment = () => {
    if (!activeSegment || activeTokenIndex === null) return;
    const token = tokens[activeTokenIndex];
    const emitted = emittedTokenIndexes.has(activeTokenIndex);
    alignedTokens.push({
      ...token,
      word: activeSegment,
      furigana: emitted ? '' : token.furigana,
      romaji: emitted ? '' : token.romaji,
    });
    emittedTokenIndexes.add(activeTokenIndex);
    activeSegment = '';
  };

  operations.forEach((operation, operationIndex) => {
    if (!operation.sourceCharacter) return;
    if (isNonLexicalCharacter(operation.sourceCharacter)) {
      flushSegment();
      activeTokenIndex = null;
      alignedTokens.push(createSourceSeparatorToken(operation.sourceCharacter));
      return;
    }

    const mappedTokenIndex = operation.returnedIndex !== null
      ? returnedTokenIndexes[operation.returnedIndex]
      : previousTokenIndex ?? nextTokenIndexes[operationIndex];
    if (mappedTokenIndex === null || mappedTokenIndex === undefined) return;
    if (activeTokenIndex !== mappedTokenIndex) {
      flushSegment();
      activeTokenIndex = mappedTokenIndex;
    }
    activeSegment += operation.sourceCharacter;
    previousTokenIndex = mappedTokenIndex;
  });
  flushSegment();

  return reconstructTokenText(alignedTokens) === source ? alignedTokens : null;
}

export function reconcileTokenTextToSource(
  source: string,
  tokens: TokenData[]
): TokenData[] | null {
  return reconcileTokenWhitespaceToSource(source, tokens)
    ?? alignTokenSeparatorsToSource(source, tokens)
    ?? alignTokenOrthographyToSource(source, tokens)
    ?? alignMinorKanaEditsToSource(source, tokens);
}

class ChunkReconstructionError extends Error {
  constructor(chunkIndex: number, chunkCount: number) {
    super(`第 ${chunkIndex + 1}/${chunkCount} 段解析结果未能完整还原原文，请重试。`);
    this.name = 'ChunkReconstructionError';
  }
}

function reconcileChunkReconstruction(
  chunk: JapaneseTextChunk,
  tokens: TokenData[],
  chunkIndex: number,
  chunkCount: number
): TokenData[] {
  const reconciledTokens = reconcileTokenTextToSource(chunk.text, tokens);
  if (reconciledTokens) return reconciledTokens;

  throw new ChunkReconstructionError(chunkIndex, chunkCount);
}

function formatChunkReasoning(
  reasoningByChunk: string[],
  includeThroughIndex: number
): string {
  return reasoningByChunk
    .slice(0, includeThroughIndex + 1)
    .map((text, index) => text ? `第 ${index + 1}/${reasoningByChunk.length} 段\n${text}` : '')
    .filter(Boolean)
    .join('\n\n');
}

const wordDetailFields = [
  'originalWord',
  'chineseTranslation',
  'pos',
  'furigana',
  'romaji',
  'dictionaryForm',
  'explanation',
] as const;

type WordDetailField = typeof wordDetailFields[number];

function decodeLooseJsonStringValue(value: string): string {
  let decoded = '';

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') {
      decoded += char;
      continue;
    }

    const next = value[++i];
    if (next === undefined) {
      decoded += char;
      break;
    }

    if (next === 'n') decoded += '\n';
    else if (next === 'r') decoded += '\r';
    else if (next === 't') decoded += '\t';
    else if (next === 'b') decoded += '\b';
    else if (next === 'f') decoded += '\f';
    else if (next === '"' || next === '\\' || next === '/') decoded += next;
    else if (next === 'u') {
      const hex = value.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        decoded += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        decoded += `\\${next}`;
      }
    } else {
      decoded += next;
    }
  }

  return decoded;
}

function parseLooseWordDetailObject(content: string): Record<WordDetailField, string> {
  const jsonText = extractJsonText(content);
  const objectStart = jsonText.indexOf('{');
  const objectEnd = jsonText.lastIndexOf('}');
  if (objectStart === -1 || objectEnd <= objectStart) {
    throw new Error('释义结果不是有效 JSON 对象');
  }

  const values: Partial<Record<WordDetailField, string>> = {};

  wordDetailFields.forEach((field, index) => {
    const fieldPattern = new RegExp(`"${field}"\\s*:\\s*"`, 'm');
    const searchFrom = index === 0
      ? objectStart + 1
      : Math.max(
        objectStart + 1,
        ...wordDetailFields
          .slice(0, index)
          .map((previousField) => jsonText.indexOf(`"${previousField}"`))
      );
    const fieldMatch = fieldPattern.exec(jsonText.slice(searchFrom));
    if (!fieldMatch || fieldMatch.index === undefined) {
      throw new Error(`释义结果缺少 ${field} 字段`);
    }

    const valueStart = searchFrom + fieldMatch.index + fieldMatch[0].length;
    let valueEnd = -1;

    if (index < wordDetailFields.length - 1) {
      const nextFieldPattern = new RegExp(`"\\s*,\\s*"${wordDetailFields[index + 1]}"\\s*:`, 'm');
      const nextFieldMatch = nextFieldPattern.exec(jsonText.slice(valueStart));
      if (nextFieldMatch && nextFieldMatch.index !== undefined) {
        valueEnd = valueStart + nextFieldMatch.index;
      }
    } else {
      valueEnd = jsonText.lastIndexOf('"', objectEnd);
    }

    if (valueEnd < valueStart) {
      throw new Error(`释义结果 ${field} 字段不完整`);
    }

    values[field] = decodeLooseJsonStringValue(jsonText.slice(valueStart, valueEnd));
  });

  const missingField = wordDetailFields.find((field) => typeof values[field] !== 'string');
  if (missingField) {
    throw new Error(`释义结果缺少 ${missingField} 字段`);
  }

  return values as Record<WordDetailField, string>;
}

export function parseWordDetailResponseContent(content: string): WordDetail {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonText(content));
  } catch {
    const detail = parseLooseWordDetailObject(content);
    return {
      originalWord: detail.originalWord,
      chineseTranslation: detail.chineseTranslation,
      pos: detail.pos,
      furigana: detail.furigana,
      romaji: detail.romaji,
      dictionaryForm: detail.dictionaryForm,
      explanation: normalizeEscapedLineBreaks(detail.explanation),
    };
  }

  if (!isRecord(parsed) || typeof parsed.originalWord !== 'string') {
    throw new Error('释义结果缺少 originalWord 字段');
  }

  const missingField = wordDetailFields.find((field) => typeof parsed[field] !== 'string');
  if (missingField) {
    throw new Error(`释义结果缺少 ${missingField} 字段`);
  }
  const detail = parsed as Record<WordDetailField, string>;

  return {
    originalWord: detail.originalWord,
    chineseTranslation: detail.chineseTranslation,
    pos: detail.pos,
    furigana: detail.furigana,
    romaji: detail.romaji,
    dictionaryForm: detail.dictionaryForm,
    explanation: normalizeEscapedLineBreaks(detail.explanation),
  };
}

function getMessageFromUnknownStreamError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  if ('error' in value) {
    const error = value.error;
    if (typeof error === 'string') return error;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
  }

  if (typeof value.message === 'string') return value.message;
  return undefined;
}

function getFinishReasonErrorMessage(finishReason: string, label: string): string {
  if (finishReason === 'length') {
    return `${label}被上游模型截断（finish_reason: length），请重新生成。`;
  }

  if (finishReason === 'content_filter') {
    return `${label}被上游内容安全策略中止（finish_reason: content_filter）。`;
  }

  return `${label}未正常结束（finish_reason: ${finishReason}）。`;
}

class StreamFinishReasonError extends Error {
  readonly finishReason: string;

  constructor(finishReason: string, label: string) {
    super(getFinishReasonErrorMessage(finishReason, label));
    this.name = 'StreamFinishReasonError';
    this.finishReason = finishReason;
  }
}

function getStreamTokenUsage(value: unknown): StreamTokenUsage | null {
  if (!isRecord(value) || !isRecord(value.usage)) return null;

  const usage = value.usage;
  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === 'number'
    ? usage.completion_tokens
    : 0;
  const totalTokens = typeof usage.total_tokens === 'number'
    ? usage.total_tokens
    : promptTokens + completionTokens;
  const details = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : null;
  const reasoningTokens = typeof details?.reasoning_tokens === 'number'
    ? details.reasoning_tokens
    : 0;

  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) return null;
  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    outputTokens: Math.max(0, completionTokens - reasoningTokens),
    totalTokens,
  };
}

function getStreamEventFromData(
  data: string,
  parseWarning: string
): {
  content: string;
  reasoningContent: string;
  finishReason: string | null;
  usage: StreamTokenUsage | null;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(data) as unknown;
    const usage = getStreamTokenUsage(parsed);
    const errorMessage = getMessageFromUnknownStreamError(parsed);
    if (errorMessage) {
      return { content: '', reasoningContent: '', finishReason: null, usage, errorMessage };
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return { content: '', reasoningContent: '', finishReason: null, usage };
    }

    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice)) {
      return { content: '', reasoningContent: '', finishReason: null, usage };
    }

    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
    const message = isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = typeof delta?.content === 'string'
      ? delta.content
      : typeof message?.content === 'string'
        ? message.content
        : '';
    const reasoningContent = typeof delta?.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof message?.reasoning_content === 'string'
        ? message.reasoning_content
        : '';
    const finishReason = typeof firstChoice.finish_reason === 'string'
      ? firstChoice.finish_reason
      : null;

    return { content, reasoningContent, finishReason, usage };
  } catch (error) {
    console.warn(parseWarning, error, data);
    return { content: '', reasoningContent: '', finishReason: null, usage: null };
  }
}

export async function readOpenAIContentStream(
  response: Response,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  options: {
    debounceMs?: number;
    parseWarning?: string;
    validateFinalContent?: (content: string) => unknown;
    invalidContentMessage?: string;
    completionLabel?: string;
    onReasoning?: (text: string, done: boolean) => void;
    onContentStart?: () => void;
    onUsage?: (usage: StreamTokenUsage) => void;
    reasoningDebounceMs?: number;
  } = {}
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError(new Error('无法创建流式读取器'));
    return;
  }

  const decoder = new TextDecoder();
  const debounceMs = options.debounceMs ?? 16;
  const parseWarning = options.parseWarning ?? 'Failed to parse streaming JSON chunk:';
  const completionLabel = options.completionLabel ?? '流式响应';
  const reasoningDebounceMs = options.reasoningDebounceMs ?? 32;
  let buffer = '';
  let rawContent = '';
  let rawReasoningContent = '';
  let terminalError: Error | null = null;
  let hasTerminalSignal = false;
  let hasContentStarted = false;
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;
  let reasoningUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearPendingUpdate = () => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }
  };

  const clearPendingReasoningUpdate = () => {
    if (reasoningUpdateTimeout) {
      clearTimeout(reasoningUpdateTimeout);
      reasoningUpdateTimeout = null;
    }
  };

  const emitReasoning = (isComplete: boolean) => {
    if (!rawReasoningContent || !options.onReasoning) return;

    if (isComplete) {
      clearPendingReasoningUpdate();
      options.onReasoning(rawReasoningContent, true);
      return;
    }

    if (reasoningDebounceMs <= 0) {
      options.onReasoning(rawReasoningContent, false);
      return;
    }

    if (reasoningUpdateTimeout) return;
    reasoningUpdateTimeout = setTimeout(() => {
      reasoningUpdateTimeout = null;
      options.onReasoning?.(rawReasoningContent, false);
    }, reasoningDebounceMs);
  };

  const emit = (content: string, isComplete: boolean) => {
    clearPendingUpdate();

    if (isComplete) {
      onChunk(content, true);
      return;
    }

    if (debounceMs <= 0) {
      onChunk(content, false);
      return;
    }

    updateTimeout = setTimeout(() => {
      onChunk(content, false);
    }, debounceMs);
  };

  const fail = (error: Error): boolean => {
    clearPendingUpdate();
    if (rawContent) {
      onChunk(rawContent, false);
    }
    if (rawReasoningContent) {
      emitReasoning(true);
    }
    onError(error);
    return true;
  };

  const complete = (): boolean => {
    clearPendingUpdate();

    if (terminalError) {
      return fail(terminalError);
    }

    if (options.validateFinalContent) {
      try {
        options.validateFinalContent(rawContent);
      } catch {
        return fail(new Error(
          options.invalidContentMessage || `${completionLabel}没有完整生成，请重新生成。`
        ));
      }
    }

    if (rawReasoningContent) {
      emitReasoning(true);
    }
    emit(rawContent, true);
    return true;
  };

  const handleData = (data: string): boolean => {
    if (data === '[DONE]') {
      hasTerminalSignal = true;
      return complete();
    }

    const {
      content,
      reasoningContent,
      finishReason,
      usage,
      errorMessage,
    } = getStreamEventFromData(data, parseWarning);
    if (usage) options.onUsage?.(usage);
    if (errorMessage) {
      return fail(new Error(errorMessage));
    }

    if (content) {
      if (!hasContentStarted) {
        hasContentStarted = true;
        options.onContentStart?.();
      }
      rawContent += content;
      emit(rawContent, false);
    }

    if (reasoningContent) {
      rawReasoningContent += reasoningContent;
      emitReasoning(false);
    }

    if (finishReason) {
      hasTerminalSignal = true;
      if (finishReason.toLowerCase() !== 'stop') {
        terminalError = new StreamFinishReasonError(finishReason, completionLabel);
      }
    }

    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim() === '') continue;

      const trimmedLine = line.trimEnd();
      if (!trimmedLine.startsWith('data:')) continue;

      const data = trimmedLine.substring(5).trimStart();
      if (handleData(data)) return;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() !== '') {
    const trimmedBuffer = buffer.trim();
    if (trimmedBuffer.startsWith('data:')) {
      const data = trimmedBuffer.substring(5).trimStart();
      if (handleData(data)) return;
    }
  }

  if (!hasTerminalSignal && options.validateFinalContent) {
    fail(new Error(`${completionLabel}连接已结束，但没有收到完整结束信号，请重新生成。`));
    return;
  }

  complete();
}

// 分析单个语义块
async function analyzeSingleSentence(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  try {
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, model),
        thinkingEnabled: provider === 'deepseek' && options.deepseekThinkingEnabled === true,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Analysis):', errorData);
      throw new Error(`解析失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }
    
    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const reasoningContent = result.choices[0].message.reasoning_content;
      if (typeof reasoningContent === 'string' && reasoningContent) {
        options.onReasoning?.(reasoningContent, true);
      }
      const responseContent = result.choices[0].message.content;
      try {
        return parseAnalyzeResponseContent(responseContent);
      } catch (e) {
        console.error("Failed to parse JSON from analysis response:", e, responseContent);
        throw new Error('解析结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Analysis):', result);
      throw new Error('解析结果格式错误，请重试');
    }
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    console.error('Error analyzing sentence:', error);
    throw error;
  }
}

// 分析日语文本；长文本按完整句子切块后顺序合并
export async function analyzeSentence(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  const chunks = splitJapaneseText(sentence);
  if (chunks.length <= 1) {
    const tokens = await analyzeSingleSentence(sentence, userApiKey, provider, model, options);
    const reconciledTokens = reconcileTokenTextToSource(sentence, tokens);
    if (!reconciledTokens) {
      throw new Error('句子解析结果未能完整还原原文，请重新解析。');
    }
    return reconciledTokens;
  }

  const mergedTokens: TokenData[] = [];
  const reasoningByChunk = Array<string>(chunks.length).fill('');

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    let reconciledTokens: TokenData[] | null = null;

    for (let attempt = 1; attempt <= ANALYSIS_CHUNK_MAX_ATTEMPTS; attempt += 1) {
      const chunkTokens = await analyzeSingleSentence(
        chunk.text,
        userApiKey,
        provider,
        model,
        {
          ...options,
          onReasoning: options.onReasoning
            ? (text) => {
                reasoningByChunk[index] = text;
                options.onReasoning?.(
                  formatChunkReasoning(reasoningByChunk, index),
                  false
                );
              }
            : undefined,
        }
      );

      try {
        reconciledTokens = reconcileChunkReconstruction(
          chunk,
          chunkTokens,
          index,
          chunks.length
        );
        break;
      } catch (error) {
        if (
          !(error instanceof ChunkReconstructionError)
          || attempt === ANALYSIS_CHUNK_MAX_ATTEMPTS
        ) {
          throw error;
        }
        console.warn(`第 ${index + 1}/${chunks.length} 段原文校验失败，正在单独重试。`);
      }
    }

    if (!reconciledTokens) {
      throw new ChunkReconstructionError(index, chunks.length);
    }
    mergedTokens.push(...reconciledTokens);
  }

  if (options.onReasoning && reasoningByChunk.some(Boolean)) {
    options.onReasoning(formatChunkReasoning(reasoningByChunk, chunks.length - 1), true);
  }

  return mergedTokens;
}

// 流式分析单个语义块
async function streamAnalyzeSingleSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  try {
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, model),
        thinkingEnabled: provider === 'deepseek' && options.deepseekThinkingEnabled === true,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Analysis):', errorData);
      onError(new Error(`流式解析失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 0,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: parseAnalyzeResponseContent,
      invalidContentMessage: '句子解析结果没有完整生成，请重新解析。',
      completionLabel: '句子解析',
      onReasoning: options.onReasoning,
      onContentStart: options.onContentStart,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) return;
    console.error('Error in stream analyzing sentence:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

function splitTruncatedAnalysisChunk(chunk: JapaneseTextChunk): JapaneseTextChunk[] {
  const textLength = chunk.text.length;
  if (textLength < 2) return [chunk];

  const targetChars = Math.max(48, Math.floor(textLength / 2));
  const maxChars = Math.max(targetChars, Math.floor(textLength * 0.62));
  const minChars = Math.max(24, Math.floor(targetChars * 0.5));
  const semanticChunks = splitJapaneseText(chunk.text, {
    targetChars,
    maxChars,
    minChars,
  });

  if (semanticChunks.length > 1) {
    return semanticChunks.map((subchunk) => ({
      ...subchunk,
      start: chunk.start + subchunk.start,
      end: chunk.start + subchunk.end,
    }));
  }

  const characters = Array.from(chunk.text);
  const midpoint = Math.floor(characters.length / 2);
  const minimumSplit = Math.max(1, Math.floor(characters.length * 0.3));
  const maximumSplit = Math.min(characters.length - 1, Math.ceil(characters.length * 0.7));
  const safeBoundaries = new Set(['、', '，', ',', '；', ';', '：', ':', '\n']);
  let splitIndex = midpoint;

  for (let distance = 0; distance <= maximumSplit - minimumSplit; distance += 1) {
    const leftCandidate = midpoint - distance;
    const rightCandidate = midpoint + distance;
    if (
      leftCandidate >= minimumSplit
      && safeBoundaries.has(characters[leftCandidate - 1])
    ) {
      splitIndex = leftCandidate;
      break;
    }
    if (
      rightCandidate <= maximumSplit
      && safeBoundaries.has(characters[rightCandidate - 1])
    ) {
      splitIndex = rightCandidate;
      break;
    }
  }

  splitIndex = Math.min(maximumSplit, Math.max(minimumSplit, splitIndex));
  const leftText = characters.slice(0, splitIndex).join('');
  const rightText = characters.slice(splitIndex).join('');
  if (!leftText || !rightText) return [chunk];

  const leftEnd = chunk.start + leftText.length;
  return [
    {
      text: leftText,
      start: chunk.start,
      end: leftEnd,
      sentenceCount: 0,
      overLimit: false,
    },
    {
      text: rightText,
      start: leftEnd,
      end: chunk.end,
      sentenceCount: 0,
      overLimit: false,
    },
  ];
}

async function streamAnalyzeChunk(
  chunk: JapaneseTextChunk,
  chunkIndex: number,
  chunkCount: number,
  onReasoning: ((text: string, done: boolean) => void) | undefined,
  userApiKey: string | undefined,
  provider: AIProvider,
  model: string | null | undefined,
  options: AnalyzeRequestOptions,
  truncationDepth = 0
): Promise<TokenData[]> {
  for (let attempt = 1; attempt <= ANALYSIS_CHUNK_MAX_ATTEMPTS; attempt += 1) {
    let finalTokens: TokenData[] | null = null;
    let streamError: Error | null = null;

    await streamAnalyzeSingleSentence(
      chunk.text,
      (content, isDone) => {
        if (isDone) finalTokens = parseAnalyzeResponseContent(content);
      },
      (error) => {
        streamError = error;
      },
      userApiKey,
      provider,
      model,
      {
        ...options,
        onReasoning,
      }
    );

    const resolvedStreamError = streamError as Error | null;
    if (resolvedStreamError) {
      if (
        resolvedStreamError instanceof StreamFinishReasonError
        && resolvedStreamError.finishReason.toLowerCase() === 'length'
        && truncationDepth < ANALYSIS_TRUNCATION_SPLIT_MAX_DEPTH
      ) {
        const subchunks = splitTruncatedAnalysisChunk(chunk);
        if (subchunks.length > 1) {
          console.warn(
            `第 ${chunkIndex + 1}/${chunkCount} 段输出被截断，已拆为 ${subchunks.length} 个更小片段重试。`
          );
          const subchunkReasoning = Array<string>(subchunks.length).fill('');
          const mergedTokens: TokenData[] = [];

          for (let subchunkIndex = 0; subchunkIndex < subchunks.length; subchunkIndex += 1) {
            const subchunkTokens = await streamAnalyzeChunk(
              subchunks[subchunkIndex],
              chunkIndex,
              chunkCount,
              onReasoning
                ? (text, done) => {
                    subchunkReasoning[subchunkIndex] = text;
                    onReasoning(
                      subchunkReasoning.filter(Boolean).join('\n\n'),
                      subchunkIndex === subchunks.length - 1 && done
                    );
                  }
                : undefined,
              userApiKey,
              provider,
              model,
              options,
              truncationDepth + 1
            );
            mergedTokens.push(...subchunkTokens);
          }

          return reconcileChunkReconstruction(
            chunk,
            mergedTokens,
            chunkIndex,
            chunkCount
          );
        }
      }
      throw resolvedStreamError;
    }
    if (!finalTokens) {
      throw new Error(`第 ${chunkIndex + 1}/${chunkCount} 段没有返回完整解析结果，请重试。`);
    }

    try {
      return reconcileChunkReconstruction(chunk, finalTokens, chunkIndex, chunkCount);
    } catch (error) {
      if (
        !(error instanceof ChunkReconstructionError)
        || attempt === ANALYSIS_CHUNK_MAX_ATTEMPTS
      ) {
        throw error;
      }
      console.warn(`第 ${chunkIndex + 1}/${chunkCount} 段原文校验失败，正在单独重试。`);
    }
  }

  throw new ChunkReconstructionError(chunkIndex, chunkCount);
}

// 流式分析日语文本；长文本保持完整句界，最多并行处理三个语义块
export async function streamAnalyzeSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  const chunks = splitJapaneseText(sentence);
  if (chunks.length <= 1) {
    await streamAnalyzeSingleSentence(
      sentence,
      (content, isDone) => {
        if (!isDone) {
          onChunk(content, false);
          return;
        }
        try {
          const tokens = parseAnalyzeResponseContent(content);
          const reconciledTokens = reconcileTokenTextToSource(sentence, tokens);
          if (!reconciledTokens) {
            throw new Error('句子解析结果未能完整还原原文，请重新解析。');
          }
          onChunk(JSON.stringify({ tokens: reconciledTokens }), true);
        } catch (error) {
          onError(error instanceof Error ? error : new Error('句子解析结果校验失败'));
        }
      },
      onError,
      userApiKey,
      provider,
      model,
      options
    );
    return;
  }

  const tokensByChunk = Array<TokenData[] | null>(chunks.length).fill(null);
  const reasoningByChunk = Array<string>(chunks.length).fill('');
  const reasoningDoneByChunk = Array<boolean>(chunks.length).fill(false);
  let nextChunkIndex = 0;
  let emittedChunkCount = 0;
  let emittedReasoningText = '';
  let emittedReasoningDone = false;
  let failed = false;

  const emitReasoning = () => {
    if (failed || !options.onReasoning) return;

    let includeThroughIndex = 0;
    while (
      includeThroughIndex < chunks.length - 1
      && reasoningDoneByChunk[includeThroughIndex]
    ) {
      includeThroughIndex += 1;
    }

    const text = formatChunkReasoning(reasoningByChunk, includeThroughIndex);
    const done = tokensByChunk.every(Boolean);
    if (!text || (text === emittedReasoningText && done === emittedReasoningDone)) return;

    emittedReasoningText = text;
    emittedReasoningDone = done;
    options.onReasoning(text, done);
  };

  const emitCompletedTokens = () => {
    if (failed) return;

    let contiguousChunkCount = 0;
    while (tokensByChunk[contiguousChunkCount]) contiguousChunkCount += 1;
    if (contiguousChunkCount === emittedChunkCount) return;

    emittedChunkCount = contiguousChunkCount;
    const mergedTokens = tokensByChunk
      .slice(0, contiguousChunkCount)
      .flatMap((tokens) => tokens ?? []);
    onChunk(
      JSON.stringify({ tokens: mergedTokens }),
      contiguousChunkCount === chunks.length
    );
  };

  const reportError = (error: unknown) => {
    if (failed) return;
    failed = true;
    onError(error instanceof Error ? error : new Error('未知错误'));
  };

  const worker = async () => {
    while (!failed) {
      const chunkIndex = nextChunkIndex;
      if (chunkIndex >= chunks.length) return;
      nextChunkIndex += 1;

      try {
        const tokens = await streamAnalyzeChunk(
          chunks[chunkIndex],
          chunkIndex,
          chunks.length,
          options.onReasoning
            ? (text, done) => {
                if (failed) return;
                reasoningByChunk[chunkIndex] = text;
                reasoningDoneByChunk[chunkIndex] = done;
                emitReasoning();
              }
            : undefined,
          userApiKey,
          provider,
          model,
          options
        );
        if (failed) return;
        tokensByChunk[chunkIndex] = tokens;
        reasoningDoneByChunk[chunkIndex] = true;
        emitCompletedTokens();
        emitReasoning();
      } catch (error) {
        reportError(error);
        return;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(ANALYSIS_CHUNK_CONCURRENCY, chunks.length) },
      () => worker()
    )
  );
}

// 流式翻译文本
export async function streamTranslateText(
  japaneseText: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, model),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Translation):', errorData);
      onError(new Error(`流式翻译失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 60,
      parseWarning: 'Failed to parse streaming JSON chunk:',
    });
  } catch (error) {
    console.error('Error in stream translating text:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

// 获取词汇详情
export async function getWordDetails(
  word: string, 
  pos: string, 
  sentence: string, 
  furigana?: string, 
  romaji?: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<WordDetail> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        romaji,
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Word Detail):', errorData);
      throw new Error(`查询释义失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const responseContent = result.choices[0].message.content;
      try {
        return parseWordDetailResponseContent(responseContent);
      } catch (e) {
        console.error("Failed to parse JSON from word detail response:", e, responseContent);
        throw new Error('释义结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Word Detail):', result);
      throw new Error('释义结果格式错误');
    }
  }
  catch (error) {
    console.error('Error fetching word details:', error);
    throw error;
  }
}

// 流式词汇详情查询函数
export async function streamWordDetails(
  word: string,
  pos: string,
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  furigana?: string,
  romaji?: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        romaji,
        ...getRequestProviderPayload(provider, model),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Word Detail):', errorData);
      onError(new Error(`流式查询释义失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 30,
      parseWarning: '解析流式数据时出错:',
      validateFinalContent: parseWordDetailResponseContent,
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    });
    
  } catch (error) {
    console.error('Stream Word Detail error:', error);
    onError(error instanceof Error ? error : new Error('流式查询词汇详情时出错'));
  }
}

// 翻译文本
export async function translateText(
  japaneseText: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Translation):', errorData);
      throw new Error(`翻译失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Translation):', result);
      throw new Error('翻译结果格式错误');
    }
  } catch (error) {
    console.error('Error translating text:', error);
    throw error;
  }
}

// 从图片提取文本
export async function extractTextFromImage(
  imageData: string, 
  prompt?: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<string> {
  if (provider === 'deepseek') {
    throw new Error('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。');
  }

  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Image to Text):', errorData);
      throw new Error(`图片文字提取失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Image to Text):', result);
      throw new Error('图片文字提取结果格式错误');
    }
  } catch (error) {
    console.error('Error extracting text from image:', error);
    throw error;
  }
}

// 从图片提取文本 - 流式版本
export async function streamExtractTextFromImage(
  imageData: string, 
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  prompt?: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  if (provider === 'deepseek') {
    onError(new Error('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。'));
    return;
  }

  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Image to Text):', errorData);
      onError(new Error(`流式图片文字提取失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
    });
  } catch (error) {
    console.error('Error in stream extracting text from image:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

// 合成语音
export async function synthesizeSpeech(
  text: string,
  provider: TTSProvider = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number } = {},
  userApiKey?: string
): Promise<{ audio: string; mimeType: string }> {
  const { gender = 'female', voice = 'Kore', rate = 0, pitch = 0 } = options;

  if (provider === 'edge') {
    const response = await fetch(EDGE_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: EDGE_TTS_VOICES[gender],
        rate,
        pitch,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = typeof errorData.error === 'string'
        ? errorData.error
        : errorData.error?.message || `Edge TTS 请求失败（HTTP ${response.status}）`;
      throw new Error(message);
    }

    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer.byteLength) {
      throw new Error('Edge TTS 返回空音频');
    }

    return {
      audio: arrayBufferToBase64(audioBuffer),
      mimeType: response.headers.get('content-type') || 'audio/mpeg',
    };
  }

  const apiUrl = getApiEndpoint('/tts');
  const headers = getHeaders(userApiKey);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      text, 
      provider,
      gender,
      voice,
      rate,
      pitch
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'TTS 请求失败');
  }

  return response.json();
}

// 聊天API - 流式版本
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, model),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Chat):', errorData);
      onError(new Error(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 30,
      parseWarning: '解析聊天流式数据时出错:',
    });
    
  } catch (error) {
    console.error('Stream Chat error:', error);
    onError(error instanceof Error ? error : new Error('聊天时出错'));
  }
}

/**
 * @public Retained for non-streaming chat callers.
 */
export async function sendChat(
  messages: ChatMessage[],
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, model),
        useStream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Chat):', errorData);
      throw new Error(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Chat):', result);
      throw new Error('聊天结果格式错误');
    }
  } catch (error) {
    console.error('Error sending chat:', error);
    throw error;
  }
}
