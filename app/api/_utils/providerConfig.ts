import { NextRequest } from 'next/server';

export type AIProvider = 'gemini' | 'deepseek';

export const DEFAULT_AI_PROVIDER: AIProvider = 'deepseek';
const GEMINI_MODEL_NAME = 'gemini-3.5-flash';
const DEEPSEEK_MODEL_NAME = 'deepseek-v4-flash';
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

export function normalizeAIProvider(value: unknown): AIProvider {
  return value === 'gemini' || value === 'deepseek' ? value : DEFAULT_AI_PROVIDER;
}

function getDefaultModelName(provider: AIProvider): string {
  return provider === 'deepseek' ? DEEPSEEK_MODEL_NAME : GEMINI_MODEL_NAME;
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
    model: customModel || getDefaultModelName(provider),
  };
}

export function withProviderControls(
  provider: AIProvider,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (provider === 'deepseek') {
    return {
      ...payload,
      thinking: { type: 'disabled' },
    };
  }

  return {
    ...payload,
    reasoning_effort: 'minimal',
  };
}
