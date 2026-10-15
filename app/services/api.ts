import { createTranslator, getClientLocale } from '../i18n';
// API与分析相关的服务函数
import {
  sanitizeProfiles,
  resolveModelSelection,
  createCustomModelId,
  type ModelCaps,
  type ModelEndpoint,
  type ProviderCaps,
  type ProviderProfile,
} from '../lib/aiModels';
import { splitJapaneseText, type JapaneseTextChunk } from '../utils/japaneseChunking';
import { normalizeEscapedLineBreaks } from '../utils/markdown';
import { getLocalRomaji } from '../utils/romaji';
import { ApiRequestError, InvalidResponseError } from '../utils/requestErrors';
import { protectAnalysisUrls } from '../utils/analysisUrls';
import { buildAnalyzePrompt } from '../lib/analyzePrompt';

export { PRESETS, sanitizeProfiles, normalizeEndpointUrl, createCustomProfileId, createCustomModelId, effectiveCaps } from '../lib/aiModels';
export type { ModelConfig, ModelCaps, ModelEndpoint, ProviderProfile, ProviderCaps, ProviderPreset } from '../lib/aiModels';

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
  conjugation?: string;
  example?: string;
  exampleTranslation?: string;
  /** phrase：用户圈选的多词短语 */
  kind?: WordDetailKind;
  /** 短语类别：単語（被拆开的一个词）| 文法形式 | 慣用表現 | 連語 */
  category?: string;
  /** 短语的构成拆解 */
  breakdown?: string;
  /** 短语被判断为一个词时，AI 给出的整词读音（用于合并，可处理连浊等） */
  mergeReading?: string;
}

export type WordDetailKind = 'word' | 'phrase';

/** 短语类别（与短语提示词约定的日文标签一致） */
export const PHRASE_CATEGORIES: readonly string[] = ['単語', '文法形式', '慣用表現', '連語'];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type TTSProvider = 'edge' | 'gemini';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface StoredAISettings {
  /** 服务商列表，每个服务商可挂多个模型 */
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  /** Gemini TTS 专用密钥（与主模型配置分离） */
  geminiApiKey: string;
  thinkingEnabled: boolean;
}

export interface AnalyzeRequestOptions {
  thinkingEnabled?: boolean;
  onReasoning?: (text: string, done: boolean) => void;
  onContentStart?: () => void;
  signal?: AbortSignal;
}

export interface ReasoningSummaryRequestOptions {
  reasoningSnippet: string;
  endpoint: ModelEndpoint;
  userApiKey?: string;
  signal?: AbortSignal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const ANALYSIS_CHUNK_CONCURRENCY = 3;

// 默认API地址 - 使用本地API路由
export const DEFAULT_API_URL = "/api";
const GEMINI_TTS_MODEL_NAME = 'gemini-3.1-flash-tts-preview';
const EDGE_TTS_MODEL_NAME = 'edge-tts';

export function getTtsModelName(provider: TTSProvider = 'edge'): string {
  return provider === 'gemini' ? GEMINI_TTS_MODEL_NAME : EDGE_TTS_MODEL_NAME;
}

/** 客户端随请求发送的端点信息：baseUrl + model + 能力位 */
export interface EndpointPayload extends ModelEndpoint {
  caps?: ProviderCaps;
}

export function getRequestProviderPayload(endpoint: EndpointPayload) {
  return {
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    caps: endpoint.caps,
  };
}

/**
 * 把上一版「一个 profile = 一个模型」的平铺结构迁移成 service + models 结构。
 * 每条 profile 变成一个单模型 service：jsonSchema 上移，thinking / reasoningEffort 挂到模型上。
 */
function migrateFlatProfiles(raw: unknown): ProviderProfile[] {
  if (!Array.isArray(raw)) return [];
  const services: ProviderProfile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const baseUrl = typeof item.baseUrl === 'string' ? item.baseUrl.trim() : '';
    const model = typeof item.model === 'string' ? item.model.trim() : '';
    if (!baseUrl || !model) continue;
    const rawCaps = item.caps && typeof item.caps === 'object' ? (item.caps as Record<string, unknown>) : {};
    const caps: ModelCaps = {};
    if (typeof rawCaps.thinking === 'boolean') caps.thinking = rawCaps.thinking;
    if (typeof rawCaps.reasoningEffort === 'string' && rawCaps.reasoningEffort.trim()) {
      caps.reasoningEffort = rawCaps.reasoningEffort.trim();
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id || baseUrl;
    services.push({
      id,
      name,
      baseUrl,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
      ...(typeof rawCaps.jsonSchema === 'boolean' ? { jsonSchema: rawCaps.jsonSchema } : {}),
      models: [{ id: createCustomModelId(), name: model, model, caps }],
    });
  }
  return services;
}

/** 把旧的「aiProvider/aiModel/geminiApiKey/deepseekApiKey」迁移成 service + models 结构 */
function migrateLegacyProfile(storage: StorageLike): { services: ProviderProfile[]; activeServiceId: string; activeModelId: string; geminiApiKey: string } {
  const legacyApiKey = storage.getItem('userApiKey') || '';
  let geminiApiKey = storage.getItem('geminiApiKey');
  if (geminiApiKey === null && legacyApiKey) {
    geminiApiKey = legacyApiKey;
    storage.setItem('geminiApiKey', legacyApiKey);
  }

  const provider = storage.getItem('aiProvider');
  const model = storage.getItem('aiModel');
  const deepseekKey = storage.getItem('deepseekApiKey') || '';

  let service: ProviderProfile | null = null;
  if (provider === 'deepseek' && deepseekKey) {
    const modelName = model || 'deepseek-chat';
    service = {
      id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: deepseekKey, jsonSchema: false,
      models: [{ id: createCustomModelId(), name: modelName, model: modelName, caps: { thinking: true } }],
    };
  } else if (provider === 'gemini' && geminiApiKey) {
    const modelName = model || 'gemini-flash-latest';
    service = {
      id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: geminiApiKey,
      models: [{ id: createCustomModelId(), name: modelName, model: modelName }],
    };
  }

  const services = service ? [service] : [];
  return {
    services,
    activeServiceId: service?.id || '',
    activeModelId: service?.models[0].id || '',
    geminiApiKey: geminiApiKey || '',
  };
}

function resolveActiveIds(services: ProviderProfile[], serviceId: unknown, modelId: unknown): { activeServiceId: string; activeModelId: string } {
  const { service, model } = resolveModelSelection(services, serviceId, modelId);
  return { activeServiceId: service?.id ?? '', activeModelId: model?.id ?? '' };
}

export function loadAISettingsFromStorage(storage: StorageLike): StoredAISettings {
  const geminiApiKey = storage.getItem('geminiApiKey') || '';
  const thinkingEnabled = storage.getItem('thinkingEnabled') === 'true';

  const rawSettings = storage.getItem('providerSettings');
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings) as { services?: unknown; profiles?: unknown; activeId?: unknown; activeServiceId?: unknown; activeModelId?: unknown };
      // 新结构：services（含 models）
      if (parsed.services !== undefined) {
        const services = sanitizeProfiles(parsed.services);
        if (services.length > 0) {
          const { activeServiceId, activeModelId } = resolveActiveIds(services, parsed.activeServiceId, parsed.activeModelId);
          return { services, activeServiceId, activeModelId, geminiApiKey, thinkingEnabled };
        }
      }
      // 上一版平铺结构：profiles（一个 profile = 一个模型）
      const services = migrateFlatProfiles(parsed.profiles);
      if (services.length > 0) {
        // 旧 activeId 指向 service id
        const byId = typeof parsed.activeId === 'string' && services.find((s) => s.id === parsed.activeId);
        const target = byId || services[0];
        return {
          services,
          activeServiceId: target.id,
          activeModelId: target.models[0].id,
          geminiApiKey,
          thinkingEnabled,
        };
      }
    } catch {
      // 解析失败则回退到最旧结构迁移
    }
  }

  // 最旧结构迁移
  const legacy = migrateLegacyProfile(storage);
  if (legacy.services.length > 0) {
    return {
      ...legacy,
      thinkingEnabled: thinkingEnabled || storage.getItem('deepseekThinkingEnabled') === 'true',
    };
  }

  return {
    services: [],
    activeServiceId: '',
    activeModelId: '',
    geminiApiKey,
    thinkingEnabled,
  };
}

/** 把 service + models 结构写回存储，并清理旧键 */
export function saveAISettingsToStorage(storage: StorageLike, settings: StoredAISettings): void {
  // 先写新键，再清理旧键（geminiApiKey 既作新键也作旧键，最后统一写回）
  storage.setItem('providerSettings', JSON.stringify({
    services: settings.services,
    activeServiceId: settings.activeServiceId,
    activeModelId: settings.activeModelId,
  }));
  storage.setItem('thinkingEnabled', settings.thinkingEnabled ? 'true' : 'false');
  for (const key of ['aiProvider', 'aiModel', 'deepseekApiKey', 'deepseekThinkingEnabled', 'geminiApiUrl', 'deepseekApiUrl', 'userApiUrl', 'userApiKey']) {
    try { storage.removeItem(key); } catch { /* 可选清理 */ }
  }
  storage.setItem('geminiApiKey', settings.geminiApiKey);
}

// 获取API请求URL
export function getApiEndpoint(endpoint: string): string {
  return `${DEFAULT_API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
}

// 构建请求头
function getHeaders(userApiKey?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json', 'X-App-Locale': getClientLocale() };
  
  // 如果用户提供了自定义API密钥，则添加到请求头
  if (userApiKey) {
    headers['Authorization'] = `Bearer ${userApiKey}`;
  }
  
  return headers;
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
      romaji: getLocalRomaji(item.word as string, typeof item.furigana === 'string' ? item.furigana : '', item.pos as string),
    }));

  if (tokens.length === 0) {
    throw new Error('解析结果没有有效词项');
  }

  return tokens;
}

export function parseAnalyzeResponseContent(content: string): TokenData[] {
  return normalizeTokenDataArray(JSON.parse(extractJsonText(content)));
}

export async function summarizeReasoningProgress(
  options: ReasoningSummaryRequestOptions
): Promise<string> {
  const response = await fetch(getApiEndpoint('/reasoning-summary'), {
    method: 'POST',
    headers: getHeaders(options.userApiKey),
    body: JSON.stringify({
      reasoningSnippet: options.reasoningSnippet,
      ...getRequestProviderPayload(options.endpoint),
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

function reconstructTokenText(tokens: TokenData[]): string {
  return tokens.map((token) => token.word).join('');
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
      alignedTokens.push({
        word: character,
        pos: character === '\n' || character === '\r' ? '改行' : '記号',
        furigana: '',
        romaji: '',
      });
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

function reconcileChunkReconstruction(
  chunk: JapaneseTextChunk,
  tokens: TokenData[],
  chunkIndex: number,
  chunkCount: number
): TokenData[] {
  if (reconstructTokenText(tokens) === chunk.text) return tokens;

  const whitespaceAlignedTokens = alignTokenWhitespaceToSource(chunk.text, tokens);
  if (whitespaceAlignedTokens) return whitespaceAlignedTokens;

  throw new Error(
    `第 ${chunkIndex + 1}/${chunkCount} 段解析结果未能完整还原原文，请重试。`
  );
}

function formatChunkReasoning(
  reasoningByChunk: string[],
  includeThroughIndex: number
): string {
  return reasoningByChunk
    .slice(0, includeThroughIndex + 1)
    .map((text, index) => text ? `${createTranslator(getClientLocale())("第 {0}/{1} 段", index + 1, reasoningByChunk.length)}\n${text}` : '')
    .filter(Boolean)
    .join('\n\n');
}

const requiredWordDetailFields = ['chineseTranslation', 'dictionaryForm', 'explanation'] as const;
const optionalWordDetailFields = ['originalWord', 'pos', 'furigana', 'romaji', 'conjugation', 'example', 'exampleTranslation', 'category', 'breakdown'] as const;
const wordDetailFields = [...requiredWordDetailFields, ...optionalWordDetailFields] as const;

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
  // 按实际字段顺序恢复，兼容精简响应和旧版词条。
  const fields = wordDetailFields.filter((field) =>
    (requiredWordDetailFields as readonly string[]).includes(field)
    || new RegExp(`"${field}"\\s*:`).test(jsonText))
    .sort((a, b) => jsonText.indexOf(`"${a}"`) - jsonText.indexOf(`"${b}"`));

  fields.forEach((field, index) => {
    const fieldPattern = new RegExp(`"${field}"\\s*:\\s*"`, 'm');
    const searchFrom = index === 0
      ? objectStart + 1
      : Math.max(
        objectStart + 1,
        ...fields
          .slice(0, index)
          .map((previousField) => jsonText.indexOf(`"${previousField}"`))
      );
    const fieldMatch = fieldPattern.exec(jsonText.slice(searchFrom));
    if (!fieldMatch || fieldMatch.index === undefined) {
      throw new Error(`释义结果缺少 ${field} 字段`);
    }

    const valueStart = searchFrom + fieldMatch.index + fieldMatch[0].length;
    let valueEnd = -1;

    if (index < fields.length - 1) {
      const nextFieldPattern = new RegExp(`"\\s*,\\s*"${fields[index + 1]}"\\s*:`, 'm');
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

  const missingField = requiredWordDetailFields.find((field) => typeof values[field] !== 'string');
  if (missingField) {
    throw new Error(`释义结果缺少 ${missingField} 字段`);
  }

  return values as Record<WordDetailField, string>;
}

export interface WordDetailContext { word: string; pos: string; furigana?: string; kind?: WordDetailKind; }

export function parseWordDetailResponseContent(content: string, context?: WordDetailContext): WordDetail {
  let parsed: unknown;
  try { parsed = JSON.parse(extractJsonText(content)); }
  catch { parsed = parseLooseWordDetailObject(content); }
  if (!isRecord(parsed)) throw new Error('释义结果不是有效 JSON 对象');
  for (const field of requiredWordDetailFields) {
    if (typeof parsed[field] !== 'string') throw new Error(`释义结果缺少 ${field} 字段`);
  }
  for (const field of optionalWordDetailFields) {
    if (parsed[field] !== undefined && typeof parsed[field] !== 'string') throw new Error(`释义结果 ${field} 必须是字符串`);
  }
  // DeepSeek 只保证返回 JSON 对象，不保证短语字段齐全；缺类别会让「合并为一个词」悄悄消失，按未完整生成处理
  if (context?.kind === 'phrase') {
    if (typeof parsed.category !== 'string' || !PHRASE_CATEGORIES.includes(parsed.category.trim())) {
      throw new Error('短语释义缺少有效的 category 字段');
    }
    if (typeof parsed.breakdown !== 'string') throw new Error('短语释义缺少 breakdown 字段');
  }
  const detail = parsed as Record<WordDetailField, string>;
  const originalWord = context?.word || detail.originalWord;
  if (!originalWord) throw new Error('释义结果缺少 originalWord 字段');
  const pos = detail.pos?.trim() || context?.pos || '';
  // 短语的读音用前端按词拼出的结果，比 AI 返回的更完整可靠
  const isPhrase = context?.kind === 'phrase';
  const furigana = isPhrase
    ? context?.furigana || detail.furigana?.trim() || ''
    : detail.furigana?.trim() || context?.furigana || '';
  return {
    originalWord, chineseTranslation: detail.chineseTranslation, pos, furigana,
    romaji: getLocalRomaji(originalWord, furigana, pos),
    dictionaryForm: detail.dictionaryForm,
    explanation: normalizeEscapedLineBreaks(detail.explanation),
    conjugation: normalizeEscapedLineBreaks(detail.conjugation || ''),
    example: normalizeEscapedLineBreaks(detail.example || ''),
    exampleTranslation: normalizeEscapedLineBreaks(detail.exampleTranslation || ''),
    ...(isPhrase ? {
      kind: 'phrase' as const,
      category: detail.category?.trim() || '',
      breakdown: normalizeEscapedLineBreaks(detail.breakdown || ''),
      mergeReading: detail.furigana?.trim() || '',
    } : {}),
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

export function validateCompletion(result: unknown, label: string): void {
  if (!isRecord(result) || !Array.isArray(result.choices)) throw new InvalidResponseError(`${label}结果格式错误`);
  const choice = result.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string' || !choice.message.content.trim()) {
    throw new InvalidResponseError(`${label}结果格式错误`);
  }
  // Some compatible gateways omit the reason; explicit abnormal termination is never success.
  if (choice.finish_reason != null && choice.finish_reason !== 'stop') {
    throw new InvalidResponseError(getFinishReasonErrorMessage(String(choice.finish_reason), label));
  }
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
): {
  content: string;
  reasoningContent: string;
  finishReason: string | null;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(data) as unknown;
    const errorMessage = getMessageFromUnknownStreamError(parsed);
    if (errorMessage) {
      return { content: '', reasoningContent: '', finishReason: null, errorMessage };
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return { content: '', reasoningContent: '', finishReason: null };
    }

    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice)) {
      return { content: '', reasoningContent: '', finishReason: null };
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

    return { content, reasoningContent, finishReason };
  } catch (error) {
    console.warn(parseWarning, error, data);
    return { content: '', reasoningContent: '', finishReason: null };
  }
}

export async function readOpenAIContentStream(
  response: Response,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  options: {
    signal?: AbortSignal;
    debounceMs?: number;
    parseWarning?: string;
    validateFinalContent?: (content: string) => unknown;
    invalidContentMessage?: string;
    completionLabel?: string;
    onReasoning?: (text: string, done: boolean) => void;
    onContentStart?: () => void;
    reasoningDebounceMs?: number;
  } = {}
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError(new InvalidResponseError('无法创建流式读取器'));
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
  let hasEmitted = false;

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
    if (options.signal?.aborted) return;
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
    if (options.signal?.aborted) return;

    if (isComplete) {
      clearPendingUpdate();
      onChunk(content, true);
      return;
    }

    if (debounceMs <= 0 || !hasEmitted) {
      hasEmitted = true;
      onChunk(content, false);
      return;
    }

    if (updateTimeout) return;
    updateTimeout = setTimeout(() => {
      updateTimeout = null;
      if (!options.signal?.aborted) onChunk(rawContent, false);
    }, debounceMs);
  };

  const fail = (error: Error): boolean => {
    if (options.signal?.aborted) return true;
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
    if (options.signal?.aborted) return true;
    clearPendingUpdate();

    if (terminalError) {
      return fail(terminalError);
    }

    if (options.validateFinalContent) {
      try {
        options.validateFinalContent(rawContent);
      } catch {
        return fail(new InvalidResponseError(
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
    if (options.signal?.aborted) return true;
    if (data === '[DONE]') {
      hasTerminalSignal = true;
      return complete();
    }

    const {
      content,
      reasoningContent,
      finishReason,
      errorMessage,
    } = getStreamEventFromData(data, parseWarning);
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
        terminalError = new InvalidResponseError(getFinishReasonErrorMessage(finishReason, completionLabel));
        return fail(terminalError);
      }
    }

    return false;
  };

  const abort = () => {
    clearPendingUpdate();
    clearPendingReasoningUpdate();
    void reader.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (options.signal?.aborted) { abort(); return; }
    while (true) {
      const { value, done } = await reader.read();
      if (options.signal?.aborted) return;
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
      fail(new InvalidResponseError(`${completionLabel}连接已结束，但没有收到完整结束信号，请重新生成。`));
      return;
    }

    complete();
  } catch (error) {
    if (!options.signal?.aborted) throw error;
  } finally {
    clearPendingUpdate();
    clearPendingReasoningUpdate();
    options.signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// 分析单个语义块
async function analyzeSingleSentence(
  sentence: string,
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  try {
    const protectedInput = protectAnalysisUrls(sentence);
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({
        prompt: buildAnalyzePrompt(protectedInput.text, protectedInput.instruction),
        ...getRequestProviderPayload(endpoint),
        thinkingEnabled: options.thinkingEnabled === true,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Analysis):', errorData);
      throw new ApiRequestError(`解析失败：${errorData.error?.message || response.statusText || '未知错误'}`, response.status);
    }
    
    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const reasoningContent = result.choices[0].message.reasoning_content;
      if (typeof reasoningContent === 'string' && reasoningContent) {
        options.onReasoning?.(reasoningContent, true);
      }
      const responseContent = result.choices[0].message.content;
      try {
        const tokens = parseAnalyzeResponseContent(protectedInput.restoreContent(responseContent));
        return reconcileChunkReconstruction({ text: sentence, start: 0, end: sentence.length, sentenceCount: 0, overLimit: false }, tokens, 0, 1);
      } catch (e) {
        console.error("Failed to parse JSON from analysis response:", e, responseContent);
        throw new InvalidResponseError('解析结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Analysis):', result);
      throw new InvalidResponseError('解析结果格式错误，请重试');
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  const chunks = splitJapaneseText(sentence);
  if (chunks.length <= 1) {
    return analyzeSingleSentence(sentence, userApiKey, endpoint, options);
  }

  const mergedTokens: TokenData[] = [];
  const reasoningByChunk = Array<string>(chunks.length).fill('');

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkTokens = await analyzeSingleSentence(
      chunk.text,
      userApiKey,
      endpoint,
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
    const reconciledTokens = reconcileChunkReconstruction(
      chunk,
      chunkTokens,
      index,
      chunks.length
    );
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  options: AnalyzeRequestOptions = {}
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  try {
    const protectedInput = protectAnalysisUrls(sentence);
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({
        prompt: buildAnalyzePrompt(protectedInput.text, protectedInput.instruction),
        ...getRequestProviderPayload(endpoint),
        thinkingEnabled: options.thinkingEnabled === true,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Stream Analysis):', errorData);
      onError(new ApiRequestError(`流式解析失败：${errorData.error?.message || response.statusText || '未知错误'}`, response.status));
      return;
    }
    
    const parseContent = (content: string) => {
      const tokens = parseAnalyzeResponseContent(protectedInput.restoreContent(content));
      return reconcileChunkReconstruction({ text: sentence, start: 0, end: sentence.length, sentenceCount: 0, overLimit: false }, tokens, 0, 1);
    };
    await readOpenAIContentStream(response, (content, done) => {
      onChunk(done
        ? JSON.stringify({ tokens: parseContent(content) })
        : protectedInput.restoreContent(content), done);
    }, onError, {
      debounceMs: 40,
      signal: options.signal,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: parseContent,
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

async function streamAnalyzeChunk(
  chunk: JapaneseTextChunk,
  chunkIndex: number,
  chunkCount: number,
  onReasoning: ((text: string, done: boolean) => void) | undefined,
  userApiKey: string | undefined,
  endpoint: EndpointPayload,
  options: AnalyzeRequestOptions
): Promise<TokenData[]> {
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
    endpoint,
    {
      ...options,
      onReasoning,
    }
  );

  if (streamError) throw streamError;
  if (!finalTokens) {
    throw new InvalidResponseError(`第 ${chunkIndex + 1}/${chunkCount} 段没有返回完整解析结果，请重试。`);
  }

  return reconcileChunkReconstruction(chunk, finalTokens, chunkIndex, chunkCount);
}

// 流式分析日语文本；长文本保持完整句界，最多并行处理三个语义块
export async function streamAnalyzeSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
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
      onChunk,
      onError,
      userApiKey,
      endpoint,
      options
    );
    return;
  }

  const groupController = new AbortController();
  const requestOptions = { ...options, signal: options.signal
    ? AbortSignal.any([options.signal, groupController.signal]) : groupController.signal };
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
    if (failed || options.signal?.aborted) return;
    failed = true;
    groupController.abort();
    onError(error instanceof Error ? error : new Error('未知错误'));
  };

  const worker = async () => {
    while (!failed && !requestOptions.signal.aborted) {
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
                if (failed || requestOptions.signal.aborted) return;
                reasoningByChunk[chunkIndex] = text;
                reasoningDoneByChunk[chunkIndex] = done;
                emitReasoning();
              }
             : undefined,
          userApiKey,
          endpoint,
          requestOptions
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        text: japaneseText,
        ...getRequestProviderPayload(endpoint),
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
      signal,
      debounceMs: 60,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('译文为空');
      },
      invalidContentMessage: '译文为空，请重试。',
      completionLabel: '翻译结果',
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
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
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal,
  kind: WordDetailKind = 'word'
): Promise<WordDetail> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        word,
        pos,
        sentence,
        furigana,
        kind,
        ...getRequestProviderPayload(endpoint)
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Word Detail):', errorData);
      throw new ApiRequestError(`查询释义失败：${errorData?.error?.message || `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`}`, response.status);
    }

    const result = await response.json();
    validateCompletion(result, '词语详解');
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const responseContent = result.choices[0].message.content;
      try {
        return parseWordDetailResponseContent(responseContent, { word, pos, furigana, kind });
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
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal,
  kind: WordDetailKind = 'word'
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        word,
        pos,
        sentence,
        furigana,
        kind,
        ...getRequestProviderPayload(endpoint),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Stream Word Detail):', errorData);
      onError(new ApiRequestError(`流式查询释义失败：${errorData?.error?.message || `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`}`, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 50,
      parseWarning: '解析流式数据时出错:',
      validateFinalContent: content => parseWordDetailResponseContent(content, { word, pos, furigana, kind }),
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    });
    
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    console.error('Stream Word Detail error:', error);
    onError(error instanceof Error ? error : new Error('流式查询词汇详情时出错'));
  }
}

// 翻译文本
export async function translateText(
  japaneseText: string,
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        text: japaneseText,
        ...getRequestProviderPayload(endpoint)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Translation):', errorData);
      throw new Error(`翻译失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    validateCompletion(result, '翻译');
    
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        imageData,
        prompt,
        ...getRequestProviderPayload(endpoint)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Image to Text):', errorData);
      throw new Error(`图片文字提取失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    validateCompletion(result, '图片文字提取');
    
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        imageData,
        prompt,
        ...getRequestProviderPayload(endpoint),
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
      signal,
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('没有识别到图片中的文字');
      },
      invalidContentMessage: '没有识别到图片中的文字，请换一张图片重试。',
      completionLabel: '图片文字提取',
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    console.error('Error in stream extracting text from image:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

// 合成语音
export async function synthesizeSpeech(
  text: string,
  provider: TTSProvider = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number; signal?: AbortSignal } = {},
  userApiKey?: string
): Promise<{ audio: string; mimeType: string }> {
  const { gender = 'female', voice = 'Kore', rate = 0, pitch = 0 } = options;

  const apiUrl = getApiEndpoint('/tts');
  const headers = getHeaders(userApiKey);

  const response = await fetch(apiUrl, {
    method: 'POST',
    signal: options.signal,
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
    const errorData = await response.json().catch(() => ({}));
    const message = typeof errorData.error === 'string'
      ? errorData.error
      : errorData.error?.message || `TTS 请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }

  return response.json();
}

// 聊天API - 流式版本
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  endpoint: EndpointPayload = { baseUrl: '', model: '' },
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        messages,
        ...getRequestProviderPayload(endpoint),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Stream Chat):', errorData);
      onError(new ApiRequestError(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 30,
      parseWarning: '解析聊天流式数据时出错:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('聊天回复为空');
      },
      invalidContentMessage: '聊天回复为空，请重试。',
    });
    
  } catch (error) {
    if (signal?.aborted) return;
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
  endpoint: EndpointPayload = { baseUrl: '', model: '' }
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        ...getRequestProviderPayload(endpoint),
        useStream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Chat):', errorData);
      throw new Error(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    validateCompletion(result, '聊天');
    
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
