// API与分析相关的服务函数
import {
  DEFAULT_AI_PROVIDER,
  getModelName,
  normalizeAIModel,
  normalizeAIProvider,
  type AIModelName,
  type AIProvider,
} from '../lib/aiModels';
import { normalizeEscapedLineBreaks } from '../utils/markdown';

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

export interface EpubSection {
  text: string;
  words: string[];
  translation: string;
  /** 该段中的中文引用（<quote> 标签内容），可选 */
  chineseQuotes?: string[];
}

export interface EpubMeta {
  generatedAt: string;
  sectionCount: number;
  totalChars: number;
}

/** 一篇文章的完整数据 */
export interface ArticleGroup {
  title: string;
  sections: EpubSection[];
  meta: EpubMeta;
}

export interface EpubGenerateResult {
  articles: ArticleGroup[];
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface StoredAISettings {
  aiProvider: AIProvider;
  aiModel: AIModelName;
  geminiApiKey: string;
  deepseekApiKey: string;
}

// 默认API地址 - 使用本地API路由
export const DEFAULT_API_URL = "/api";
const GEMINI_TTS_MODEL_NAME = 'gemini-3.1-flash-tts-preview';
const EDGE_TTS_MODEL_NAME = 'edge-tts';

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

function getStreamEventFromData(
  data: string,
  parseWarning: string
): { content: string; finishReason: string | null; errorMessage?: string } {
  try {
    const parsed = JSON.parse(data) as unknown;
    const errorMessage = getMessageFromUnknownStreamError(parsed);
    if (errorMessage) {
      return { content: '', finishReason: null, errorMessage };
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return { content: '', finishReason: null };
    }

    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice)) {
      return { content: '', finishReason: null };
    }

    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
    const message = isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = typeof delta?.content === 'string'
      ? delta.content
      : typeof message?.content === 'string'
        ? message.content
        : '';
    const finishReason = typeof firstChoice.finish_reason === 'string'
      ? firstChoice.finish_reason
      : null;

    return { content, finishReason };
  } catch (error) {
    console.warn(parseWarning, error, data);
    return { content: '', finishReason: null };
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
  let buffer = '';
  let rawContent = '';
  let terminalError: Error | null = null;
  let hasTerminalSignal = false;
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;

  const clearPendingUpdate = () => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }
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

    emit(rawContent, true);
    return true;
  };

  const handleData = (data: string): boolean => {
    if (data === '[DONE]') {
      hasTerminalSignal = true;
      return complete();
    }

    const { content, finishReason, errorMessage } = getStreamEventFromData(data, parseWarning);
    if (errorMessage) {
      return fail(new Error(errorMessage));
    }

    if (content) {
      rawContent += content;
      emit(rawContent, false);
    }

    if (finishReason) {
      hasTerminalSignal = true;
      if (finishReason.toLowerCase() !== 'stop') {
        terminalError = new Error(getFinishReasonErrorMessage(finishReason, completionLabel));
        return fail(terminalError);
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

// 分析日语句子
export async function analyzeSentence(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
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
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Analysis):', errorData);
      throw new Error(`解析失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }
    
    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
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
    console.error('Error analyzing sentence:', error);
    throw error;
  }
}

// 流式分析日语句子
export async function streamAnalyzeSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
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
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, model),
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
    });
  } catch (error) {
    console.error('Error in stream analyzing sentence:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
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


// 合成语音
export async function synthesizeSpeech(
  text: string,
  provider: TTSProvider = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number } = {},
  userApiKey?: string
): Promise<{ audio: string; mimeType: string }> {
  const { gender = 'female', voice = 'Kore', rate = 0, pitch = 0 } = options;

  // 统一走本地 /api/tts 代理，避免客户端直接调用外部服务
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
// Epub 内容生成
export async function generateEpubContent(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<EpubGenerateResult> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  try {
    const apiUrl = getApiEndpoint('/epub');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sentence,
        ...getRequestProviderPayload(provider),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Epub):', errorData);
      throw new Error(`Epub 生成失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      let responseContent = result.choices[0].message.content;
      try {
        const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          responseContent = jsonMatch[1];
        }
        let parsed: { articles?: Array<{ title: string; sections: EpubSection[] }> } | null = null;
        try {
          parsed = JSON.parse(responseContent);
        } catch {
          // JSON 截断修复...
          let repaired = responseContent.trimEnd();
          const lastComplete = repaired.lastIndexOf('"}');
          if (lastComplete > 0) {
            repaired = repaired.slice(0, lastComplete + 2) + '\n]';
            if (!repaired.trimEnd().endsWith(']}')) {
              repaired = repaired.trimEnd();
              if (!repaired.endsWith(']')) repaired += '\n]';
              if (!repaired.endsWith('}')) repaired += '\n}';
            }
          }
          try { parsed = JSON.parse(repaired); } catch {
            const lastObj = repaired.lastIndexOf('},');
            if (lastObj > 0) {
              parsed = JSON.parse(repaired.slice(0, lastObj + 1) + '\n]\n}');
            }
          }
        }
        if (parsed?.articles && Array.isArray(parsed.articles) && parsed.articles.length > 0) {
          return {
            articles: parsed.articles.map((a) => ({
              title: a.title || '',
              sections: a.sections || [],
              meta: {
                generatedAt: new Date().toISOString().slice(0, 10),
                sectionCount: a.sections?.length || 0,
                totalChars: (a.sections || []).reduce((sum, s) => sum + s.text.length, 0),
              },
            })),
          };
        }
        throw new Error('返回数据缺少 articles 字段或 JSON 无法修复');
      } catch (e) {
        console.error('Failed to parse JSON from epub response:', e, responseContent);
        throw new Error('Epub 生成结果 JSON 格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Epub):', result);
      throw new Error('Epub 生成结果格式错误');
    }
  } catch (error) {
    console.error('Error generating epub content:', error);
    throw error;
  }
}

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
