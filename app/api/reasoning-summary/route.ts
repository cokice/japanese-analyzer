import { getReasoningSummaryPrompt } from '../../lib/languagePrompts';
import { normalizeLocale } from '../../i18n';
import { DEEPSEEK_MODEL_NAME } from '../../lib/aiModels';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeReasoningSummary } from '../../utils/reasoningSummary';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { requireApiSession } from '../_utils/sessionAuth';

const SUMMARY_MODEL = DEEPSEEK_MODEL_NAME;
const SUMMARY_SNIPPET_CHARS = 800;

function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : '';
}

export async function POST(req: NextRequest) {
  try {
    const locale = normalizeLocale(req.headers.get('X-App-Locale'));
    const authError = requireApiSession(req);
    if (authError) return authError;

    const body = await req.json();
    const reasoningSnippet = typeof body.reasoningSnippet === 'string'
      ? Array.from(body.reasoningSnippet).slice(-SUMMARY_SNIPPET_CHARS).join('')
      : '';

    if (!reasoningSnippet.trim()) {
      return NextResponse.json(
        { error: { message: '缺少待总结的思考片段' } },
        { status: 400 }
      );
    }

    const providerConfig = resolveProviderConfig(req, {
      provider: 'deepseek',
      model: SUMMARY_MODEL,
    });

    if (!providerConfig.apiKey) {
      return NextResponse.json(
        { error: { message: '未提供 DeepSeek API 密钥' } },
        { status: 500 }
      );
    }

    const payload = withProviderControls('deepseek', {
      model: providerConfig.model,
      messages: [
        { role: 'system', content: getReasoningSummaryPrompt(locale) },
        { role: 'user', content: reasoningSnippet },
      ],
      stream: false,
      max_tokens: 60,
    }, { enableThinking: false });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
    }

    const data = await proxied.response.json();
    const summary = sanitizeReasoningSummary(extractAssistantText(data), locale === 'en' || locale === 'ko' ? 100 : 30);
    if (!summary) {
      return NextResponse.json(
        { error: { message: 'DeepSeek 没有返回有效的思考摘要' } },
        { status: 502 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    console.error('Server error (Reasoning summary):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '思考摘要生成失败' } },
      { status: 500 }
    );
  }
}
