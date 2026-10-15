import { NextRequest } from 'next/server';
import {
  normalizeEndpointUrl,
  type ModelEndpoint,
  type ProviderCaps,
} from '../../lib/aiModels';
import { BaseUrlError, validateBaseUrl } from './validateBaseUrl';

export type { ProviderCaps, ModelEndpoint } from '../../lib/aiModels';

export type StructuredOutputKind = 'analysisTokens' | 'wordDetail' | 'phraseDetail' | 'dailySentence';

/** 解析后的上游调用配置：端点 + 密钥 + 能力位 */
export interface ResolvedProviderConfig extends ModelEndpoint {
  apiKey: string;
  caps: ProviderCaps;
}

export class ProviderConfigError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ProviderConfigError';
    this.status = status;
  }
}

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get('Authorization');
  return authHeader ? authHeader.replace('Bearer ', '').trim() : '';
}

/** 服务端自发请求（如今日一句）使用的固定端点配置 */
export interface ServerProviderConfig {
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  caps: ProviderCaps;
}

/** 仅供服务端自发的请求（无用户上下文）使用：按环境变量探测可用的模型服务 */
export function resolveServerProviderConfig(): ServerProviderConfig | null {
  const candidates: ServerProviderConfig[] = [];

  // 显式覆盖：今日一句专用端点
  const dsUrl = process.env.DAILY_SENTENCE_API_URL?.trim();
  const dsKey = process.env.DAILY_SENTENCE_API_KEY?.trim();
  const dsModel = process.env.DAILY_SENTENCE_API_MODEL?.trim();
  if (dsKey && dsModel && dsUrl) {
    candidates.push({ name: 'daily-sentence', apiUrl: normalizeEndpointUrl(dsUrl), apiKey: dsKey, model: dsModel, caps: { jsonSchema: false } });
  }

  // 复用既有 DeepSeek 端点（结构化输出用 json_object 降级，兼容性最好）
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    const deepseekUrl = process.env.DEEPSEEK_API_URL?.trim() || 'https://api.deepseek.com';
    candidates.push({ name: 'deepseek', apiUrl: normalizeEndpointUrl(deepseekUrl), apiKey: deepseekKey, model: process.env.DEEPSEEK_MODEL_NAME?.trim() || 'deepseek-chat', caps: { jsonSchema: false } });
  }

  // 复用既有 Gemini 端点
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const geminiUrl = process.env.GEMINI_API_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta/openai';
    candidates.push({ name: 'gemini', apiUrl: normalizeEndpointUrl(geminiUrl), apiKey: geminiKey, model: process.env.GEMINI_MODEL_NAME?.trim() || 'gemini-flash-latest', caps: {} });
  }

  return candidates[0] ?? null;
}

function normalizeCaps(value: unknown): ProviderCaps {
  if (!value || typeof value !== 'object') return {};
  const item = value as Record<string, unknown>;
  const caps: ProviderCaps = {};
  if (typeof item.jsonSchema === 'boolean') caps.jsonSchema = item.jsonSchema;
  if (typeof item.thinking === 'boolean') caps.thinking = item.thinking;
  return caps;
}

/**
 * 解析用户请求的模型端点。端点（baseUrl + model）与能力位由客户端提供，密钥来自 Bearer。
 * 不再支持服务端预设密钥，也不再允许服务端代客选择端点。
 */
export function resolveProviderConfig(
  req: NextRequest,
  options: {
    baseUrl?: unknown;
    model?: unknown;
    caps?: unknown;
  } = {}
): ResolvedProviderConfig {
  let baseUrl: string;
  try {
    baseUrl = validateBaseUrl(options.baseUrl);
  } catch (error) {
    if (error instanceof BaseUrlError) throw new ProviderConfigError(error.message, error.status);
    throw error;
  }

  const model = typeof options.model === 'string' ? options.model.trim() : '';
  if (!model) {
    throw new ProviderConfigError('缺少模型名称，请在设置中填写模型');
  }

  return {
    baseUrl: normalizeEndpointUrl(baseUrl),
    apiKey: getBearerToken(req),
    model,
    caps: normalizeCaps(options.caps),
  };
}

const analysisTokensSchema = {
  type: 'object',
  properties: {
    tokens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          pos: { type: 'string' },
          furigana: { type: 'string' },
        },
        required: ['word', 'pos', 'furigana'],
        additionalProperties: false,
      },
    },
  },
  required: ['tokens'],
  additionalProperties: false,
} as const;

const wordDetailSchema = {
  type: 'object',
  properties: {
    chineseTranslation: { type: 'string' },
    pos: { type: 'string' },
    furigana: { type: 'string' },
    dictionaryForm: { type: 'string' },
    explanation: { type: 'string' },
    conjugation: { type: 'string' },
    example: { type: 'string' },
    exampleTranslation: { type: 'string' },
  },
  required: [
    'chineseTranslation',
    'pos',
    'furigana',
    'dictionaryForm',
    'explanation',
    'conjugation',
    'example',
    'exampleTranslation',
  ],
  additionalProperties: false,
} as const;

const phraseDetailFields = [
  'chineseTranslation',
  'category',
  'dictionaryForm',
  'explanation',
  'breakdown',
  'example',
  'exampleTranslation',
  'pos',
  'furigana',
] as const;

const phraseDetailSchema = {
  type: 'object',
  properties: Object.fromEntries(phraseDetailFields.map((field) => [field, { type: 'string' }])),
  required: [...phraseDetailFields],
  additionalProperties: false,
} as const;

const dailySentenceSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    translations: {
      type: 'object',
      properties: {
        'zh-CN': { type: 'string' },
        'zh-TW': { type: 'string' },
        en: { type: 'string' },
        ko: { type: 'string' },
      },
      required: ['zh-CN', 'zh-TW', 'en', 'ko'],
      additionalProperties: false,
    },
  },
  required: ['text', 'translations'],
  additionalProperties: false,
} as const;

const structuredOutputSchemas = {
  analysisTokens: {
    name: 'japanese_sentence_analysis',
    schema: analysisTokensSchema,
  },
  wordDetail: {
    name: 'japanese_word_detail',
    schema: wordDetailSchema,
  },
  phraseDetail: {
    name: 'japanese_phrase_detail',
    schema: phraseDetailSchema,
  },
  dailySentence: {
    name: 'japanese_daily_sentence',
    schema: dailySentenceSchema,
  },
} as const;

/** 按能力位选择结构化输出方式：默认 json_schema strict，降级时只用 json_object */
export function getStructuredResponseFormat(
  caps: ProviderCaps,
  kind: StructuredOutputKind
): Record<string, unknown> {
  if (caps.jsonSchema === false) {
    return { type: 'json_object' };
  }

  const structuredOutput = structuredOutputSchemas[kind];
  return {
    type: 'json_schema',
    json_schema: {
      name: structuredOutput.name,
      strict: true,
      schema: structuredOutput.schema,
    },
  };
}

/**
 * 在上游请求体上追加结构化输出 / 思考参数。
 * 仅在能力位声明支持时才附加，保证对任意 OpenAI 兼容厂商安全。
 */
export function buildCompletionPayload(
  caps: ProviderCaps,
  payload: Record<string, unknown>,
  options: {
    structuredOutput?: StructuredOutputKind;
    enableThinking?: boolean;
  } = {}
): Record<string, unknown> {
  const responseFormat = options.structuredOutput
    ? { response_format: getStructuredResponseFormat(caps, options.structuredOutput) }
    : {};

  if (caps.thinking === true) {
    const thinkingEnabled = options.enableThinking === true;
    return {
      ...payload,
      ...responseFormat,
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
      ...(thinkingEnabled ? { reasoning_effort: 'high' } : {}),
    };
  }

  return {
    ...payload,
    ...responseFormat,
  };
}
