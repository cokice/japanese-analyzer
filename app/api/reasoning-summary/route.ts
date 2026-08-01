import { NextRequest, NextResponse } from 'next/server';
import { sanitizeReasoningSummary } from '../../utils/reasoningSummary';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { requireApiSession } from '../_utils/sessionAuth';

const SUMMARY_PROMPT = '以下是一个 AI 模型思考过程的最新片段。用一句 8-15 字的中文现在进行时短语,描述它此刻正在做的事。只输出这个短语,不要标点结尾,不要概括全文。例:正在辨析谓语的使役被动形态';
const SUMMARY_MODEL = 'deepseek-v4-flash';
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
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: reasoningSnippet },
      ],
      stream: false,
      max_tokens: 30,
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
    const summary = sanitizeReasoningSummary(extractAssistantText(data));
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
