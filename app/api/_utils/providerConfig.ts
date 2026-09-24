import { NextRequest } from 'next/server';
import {
  DEFAULT_AI_PROVIDER,
  getModelName,
  normalizeAIModel,
  normalizeAIProvider,
  type AIProvider,
} from '../../lib/aiModels';

export type StructuredOutputKind = 'analysisTokens' | 'wordDetail' | 'phraseDetail' | 'dailySentence';
export { DEFAULT_AI_PROVIDER, normalizeAIProvider };
export type { AIProvider };

export const GEMINI_OPENAI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const DEEPSEEK_OPENAI_API_URL = 'https://api.deepseek.com/chat/completions';

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

function getDefaultApiUrl(provider: AIProvider): string {
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_API_URL || DEEPSEEK_OPENAI_API_URL;
  }

  return process.env.GEMINI_API_URL || GEMINI_OPENAI_API_URL;
}

function getDefaultApiKey(provider: AIProvider): string {
  if (provider === 'deepseek') {
    return process.env.DEEPSEEK_API_KEY || '';
  }

  return process.env.GEMINI_API_KEY || '';
}

/** 只用服务器环境变量里的密钥（不带用户密钥），供服务端自发的请求使用 */
export function resolveServerProviderConfig(provider: AIProvider) {
  return {
    provider,
    apiKey: getDefaultApiKey(provider),
    apiUrl: getDefaultApiUrl(provider),
    model: getModelName(provider),
  };
}

export function resolveProviderConfig(
  req: NextRequest,
  options: {
    provider?: unknown;
    apiUrl?: unknown;
    model?: unknown;
  } = {}
) {
  const provider = normalizeAIProvider(options.provider);
  const customModel = typeof options.model === 'string' ? options.model.trim() : '';
  const hasClientApiUrl = typeof options.apiUrl === 'string'
    ? options.apiUrl.trim().length > 0
    : options.apiUrl !== undefined && options.apiUrl !== null;

  if (hasClientApiUrl) {
    throw new ProviderConfigError('客户端不再支持自定义 API URL，请在服务器环境变量中配置上游端点。');
  }

  return {
    provider,
    apiKey: getBearerToken(req) || getDefaultApiKey(provider),
    apiUrl: getDefaultApiUrl(provider),
    model: customModel ? normalizeAIModel(provider, customModel) : getModelName(provider),
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

export function getStructuredResponseFormat(
  provider: AIProvider,
  kind: StructuredOutputKind
): Record<string, unknown> {
  if (provider === 'deepseek') {
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

export function withProviderControls(
  provider: AIProvider,
  payload: Record<string, unknown>,
  options: {
    structuredOutput?: StructuredOutputKind;
    enableThinking?: boolean;
  } = {}
): Record<string, unknown> {
  const responseFormat = options.structuredOutput
    ? { response_format: getStructuredResponseFormat(provider, options.structuredOutput) }
    : {};

  if (provider === 'deepseek') {
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
    reasoning_effort: payload.model === 'gemini-flash-latest' ? 'low' : 'minimal',
  };
}
