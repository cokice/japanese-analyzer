import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { serverKeyRateLimitResponse } from '../_utils/serverKeyRateLimit';
import { validateCompletion } from '../../lib/apiResponse';
import { InvalidResponseError } from '../../utils/requestErrors';
import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { getTranslationSystemPrompt } from '../../lib/languagePrompts';
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
    const { text, model, apiUrl, stream = false, provider } = await readJsonBody(req);
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
      return apiErrorResponse('MISSING_API_KEY', 500);
    }

    if (!text) {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }

    // 构建翻译请求
    const translationPrompt = getTranslationSystemPrompt(locale);
    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [{ role: "system", content: translationPrompt }, { role: "user", content: text }],
      stream: stream
    });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      console.error('AI API error (Translation):', proxied.error.raw ?? proxied.error.message);
      return upstreamErrorResponse(proxied.status);
    }

    const response = proxied.response;

    // 如果是流式输出
    if (stream) {
      // 将流式响应传回客户端
      const readableStream = response.body;
      if (!readableStream) {
        return apiErrorResponse('INVALID_RESPONSE', 500);
      }

      // 创建一个新的流式响应
      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // 非流式输出，按原来方式处理
      const data = await response.json();
      validateCompletion(data, '翻译');
      return NextResponse.json(data);
    }
  } catch (error) {
    const quotaError = serverKeyRateLimitResponse(error);
    if (quotaError) return quotaError;
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof InvalidResponseError) return apiErrorResponse('INVALID_RESPONSE', 502);
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

    console.error('Server error (Translation):', error);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
} 
