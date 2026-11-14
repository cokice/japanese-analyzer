import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { serverKeyRateLimitResponse } from '../_utils/serverKeyRateLimit';
import { validateCompletion } from '../../lib/apiResponse';
import { InvalidResponseError } from '../../utils/requestErrors';
import { readJsonBody, requestBodyErrorResponse, IMAGE_BODY_LIMIT } from '../_utils/requestBody';
import { getImageExtractionPrompt } from '../../lib/languagePrompts';
import { normalizeLocale } from '../../i18n';
import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { isUpstreamTimeoutError } from '../_utils/requestTimeout';
import { requireApiSession } from '../_utils/sessionAuth';
import { getImageRecognitionModelName } from '../../lib/aiModels';

const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i;

export async function POST(req: NextRequest) {
  try {
    const locale = normalizeLocale(req.headers.get('X-App-Locale'));
    const authError = requireApiSession(req);
    if (authError) return authError;

    const parsedBody = await readJsonBody(req, IMAGE_BODY_LIMIT);

    const { imageData, prompt, model, apiUrl, stream = false, provider } = parsedBody;
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });

    // 验证imageData大小
    if (typeof imageData === 'string' && imageData.length > 1024 * 1024 * 8) { // 8MB限制
      return apiErrorResponse('PAYLOAD_TOO_LARGE', 413);
    }

    // 只接受 base64 图片 data URL，不能让上游替客户端抓取任意远程 URL
    if (typeof imageData !== 'string' || !IMAGE_DATA_URL_PATTERN.test(imageData)) {
      return apiErrorResponse('INVALID_REQUEST', 400);
    }

    if (!providerConfig.apiKey) {
      return apiErrorResponse('MISSING_API_KEY', 500);
    }

    // 优化提示词，避免换行符
    const defaultPrompt = getImageExtractionPrompt(locale);
    const imageModel = getImageRecognitionModelName(providerConfig.provider, providerConfig.model);

    // 构建发送到AI服务的请求
    const payload = withProviderControls(providerConfig.provider, {
      model: imageModel,
      stream: stream,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || defaultPrompt },
            {
              type: "image_url",
              image_url: {
                url: imageData
              }
            }
          ]
        }
      ]
    }, { enableThinking: false });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      console.error('AI API error (Image):', proxied.error.raw ?? proxied.error.message);
      return upstreamErrorResponse(proxied.status);
    }

    const response = proxied.response;

    // 处理流式响应
    if (stream) {
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
      // 获取AI API的响应
      let data;
      try {
        const responseText = await response.text();
        try {
          data = JSON.parse(responseText);
        } catch {
          console.error('Failed to parse API response:', responseText.substring(0, 200) + '...');
          return apiErrorResponse('INVALID_RESPONSE', 500);
        }
      } catch (readError) {
        if (req.signal.aborted || isUpstreamTimeoutError(readError)) throw readError;
        console.error('Failed to read API response:', readError);
        return apiErrorResponse('INVALID_RESPONSE', 500);
      }

      // 将AI API的响应传回给客户端
      validateCompletion(data, '图片文字提取');
      return NextResponse.json(data);
    }
  } catch (error) {
    const quotaError = serverKeyRateLimitResponse(error);
    if (quotaError) return quotaError;
    const bodyError = requestBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof InvalidResponseError) return apiErrorResponse('INVALID_RESPONSE', 502);
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof ProviderConfigError) {
      return apiErrorResponse('INVALID_REQUEST', error.status);
    }

    // 非流式请求在读取上游响应时整体超时，避免把英文 TimeoutError 原文透传给界面。
    if (isUpstreamTimeoutError(error)) {
      return apiErrorResponse('UPSTREAM_TIMEOUT', 504);
    }

    console.error('Server error (Image):', error);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
} 
