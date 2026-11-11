import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { serverKeyRateLimitResponse } from '../_utils/serverKeyRateLimit';
import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { normalizeLocale } from '../../i18n';
import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';
import { getWordDetailSystemPrompt } from '../../lib/wordDetailPrompt';
import { getPhraseDetailSystemPrompt } from '../../lib/phraseDetailPrompt';

export async function POST(req: NextRequest) {
  try {
    const locale = normalizeLocale(req.headers.get('X-App-Locale'));
    const authError = requireApiSession(req);
    if (authError) return authError;

    // 解析请求体
    const { word, pos, sentence, furigana, model, apiUrl, useStream = false, provider, kind } = await readJsonBody(req);
    // kind: 'phrase' 为用户圈选的多词短语，不需要词性
    const isPhrase = kind === 'phrase';
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
      return apiErrorResponse('MISSING_API_KEY', 500);
    }

    if (!word || (!pos && !isPhrase) || !sentence) {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }

    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [
        { role: "system", content: isPhrase ? getPhraseDetailSystemPrompt(locale) : getWordDetailSystemPrompt(locale) },
        {
          role: "user",
          content: JSON.stringify(isPhrase
            ? { selection: word, sentence, furigana: furigana || "" }
            : { word, pos, sentence, furigana: furigana || "" }),
        },
      ],
      stream: useStream,
    }, { structuredOutput: isPhrase ? 'phraseDetail' : 'wordDetail' });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      console.error('AI API error (Word Detail):', proxied.error.raw ?? proxied.error.message);
      return upstreamErrorResponse(proxied.status);
    }

    const response = proxied.response;

    // 如果是流式请求，直接返回流式响应
    if (useStream && response.body) {
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 非流式请求，返回完整响应
    const data = await response.json();
    return NextResponse.json(data);
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

    console.error('Server error (Word Detail):', error);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
}
