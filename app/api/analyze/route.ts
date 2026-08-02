import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { requireApiSession } from '../_utils/sessionAuth';
import { writeDebugLog } from '../../utils/serverDebugLog';

const ANALYSIS_MAX_OUTPUT_TOKENS = 16_384;

function getDebugResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'content-type'
      || normalizedKey === 'date'
      || normalizedKey === 'server'
      || normalizedKey === 'via'
      || normalizedKey.startsWith('x-')
      || normalizedKey.startsWith('cf-')
    ) {
      headers[key] = value;
    }
  });
  return headers;
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const authError = requireApiSession(req);
    if (authError) return authError;

    // 解析请求体
    const requestData = await req.json();

    const {
      prompt,
      model,
      apiUrl,
      stream = false,
      provider,
      thinkingEnabled = false,
    } = requestData;
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: { message: '缺少必要的prompt参数' } },
        { status: 400 }
      );
    }

    // 构建发送到AI服务的请求
    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [{ role: "user", content: prompt }],
      stream: stream,
      max_tokens: ANALYSIS_MAX_OUTPUT_TOKENS,
    }, {
      structuredOutput: 'analysisTokens',
      enableThinking: thinkingEnabled === true,
    });

    writeDebugLog({
      scope: 'analysis.upstream',
      event: 'request.started',
      message: `发送解析请求：${providerConfig.provider} / ${providerConfig.model}`,
      data: {
        requestId,
        url: providerConfig.apiUrl,
        method: 'POST',
        provider: providerConfig.provider,
        model: providerConfig.model,
        stream,
        payload,
      },
    });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
      signal: req.signal,
    });

    if (!proxied.ok) {
      console.error('AI API error:', proxied.error.raw ?? proxied.error.message);
      writeDebugLog({
        level: 'error',
        scope: 'analysis.upstream',
        event: 'request.failed',
        message: `解析上游请求失败：${proxied.error.message}`,
        data: {
          requestId,
          status: proxied.status,
          error: proxied.error.raw ?? proxied.error.message,
        },
      });
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
    }

    const response = proxied.response;
    writeDebugLog({
      scope: 'analysis.upstream',
      event: 'response.headers',
      message: `解析上游已响应：${response.status} ${response.statusText}`,
      data: {
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: getDebugResponseHeaders(response),
      },
    });

    // 如果是流式输出
    if (stream) {
      // 将流式响应传回客户端
      const readableStream = response.body;
      if (!readableStream) {
        return NextResponse.json(
          { error: { message: '流式响应创建失败' } },
          { status: 500 }
        );
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
      writeDebugLog({
        scope: 'analysis.upstream',
        event: 'response.completed',
        message: '解析上游返回完整响应',
        data: { requestId, response: data },
      });
      return NextResponse.json(data);
    }
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      writeDebugLog({
        level: 'error',
        scope: 'analysis.route',
        event: 'provider.invalid',
        message: error.message,
        data: { requestId, status: error.status },
      });
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      writeDebugLog({
        level: 'warn',
        scope: 'analysis.route',
        event: 'request.aborted',
        message: '解析请求已由客户端中止',
        data: { requestId },
      });
      return new Response(null, { status: 499 });
    }

    console.error('Server error:', error);
    writeDebugLog({
      level: 'error',
      scope: 'analysis.route',
      event: 'route.error',
      message: '解析 API 路由发生异常',
      data: { requestId, error },
    });
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
} 
