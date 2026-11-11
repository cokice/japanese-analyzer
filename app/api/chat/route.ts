import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { serverKeyRateLimitResponse } from '../_utils/serverKeyRateLimit';
import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { getChatSystemPrompt } from '../../lib/languagePrompts';
import { normalizeLocale } from '../../i18n';
import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';

export async function POST(req: NextRequest) {
  try {
    const locale = normalizeLocale(req.headers.get('X-App-Locale'));
    const authError = requireApiSession(req);
    if (authError) return authError;

    // 解析请求体
    const { messages, useStream = true, provider, apiUrl, model } = await readJsonBody(req);
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80
      || messages.some(message => !message || typeof message !== 'object'
        || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string')
      || messages.reduce((total, message) => total + message.content.length, 0) > 32_000) {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    if (!providerConfig.apiKey) {
      return apiErrorResponse('MISSING_API_KEY', 500);
    }

    // 构建系统提示词，让AI专注于日语学习辅助
    const systemPrompt = getChatSystemPrompt(locale);

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: fullMessages,
      stream: useStream,
    });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      console.error('OpenAI API error:', proxied.error.raw ?? proxied.error.message);
      return upstreamErrorResponse(proxied.status);
    }

    const response = proxied.response;

    if (useStream) {
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (error) {
    const quotaError = serverKeyRateLimitResponse(error);
    if (quotaError) return quotaError;
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof ProviderConfigError) {
      return apiErrorResponse('INVALID_REQUEST', error.status);
    }

    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return new Response(null, { status: 499 });
    }

    // 非流式请求在读取上游响应时整体超时，避免把英文 TimeoutError 原文透传给界面。
    if (isUpstreamTimeoutError(error)) {
      return apiErrorResponse('UPSTREAM_TIMEOUT', 504);
    }

    console.error('Server error (Chat):', error);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
}
