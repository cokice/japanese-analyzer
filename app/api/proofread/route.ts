import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import {
  ProviderConfigError,
  resolveProviderConfig,
  withProviderControls,
} from '../_utils/providerConfig';
import { requireApiSession } from '../_utils/sessionAuth';
import {
  buildProofreadPrompt,
  PROOFREAD_MAX_OUTPUT_TOKENS,
  PROOFREAD_REASONING_EFFORT,
  type ProofreadDraftToken,
} from '../../utils/proofreading';
import { writeDebugLog } from '../../utils/serverDebugLog';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function logProofreadUpstreamResponse(response: Response, requestId: string): void {
  const debugHeaders = getDebugResponseHeaders(response);
  console.info(`[深度审校调试] 上游响应状态 ${response.status} ${response.statusText}`);
  console.info(
    `[深度审校调试] 上游响应头 ${JSON.stringify(debugHeaders)}`
  );
  writeDebugLog({
    scope: 'proofread.upstream',
    event: 'response.headers',
    message: `上游已建立流式响应：${response.status} ${response.statusText}`,
    data: { requestId, status: response.status, statusText: response.statusText, headers: debugHeaders },
  });

  const debugResponse = response.clone();
  void (async () => {
    const reader = debugResponse.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = '';
    let loggedModel = '';

    const inspectLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      try {
        const event = JSON.parse(data) as unknown;
        if (!isRecord(event)) return;
        const model = typeof event.model === 'string' ? event.model : '';
        if (model && model !== loggedModel) {
          loggedModel = model;
          console.info(`[深度审校调试] 上游响应 model ${model}`);
          writeDebugLog({
            scope: 'proofread.upstream',
            event: 'response.model',
            message: `上游实际模型：${model}`,
            data: { requestId, model },
          });
        }
        if (isRecord(event.usage)) {
          console.info(`[深度审校调试] 上游响应 usage ${JSON.stringify(event.usage)}`);
          writeDebugLog({
            scope: 'proofread.upstream',
            event: 'response.usage',
            message: '上游返回 token 用量',
            data: { requestId, usage: event.usage },
          });
        }
      } catch {
        // 非 JSON SSE 行不影响业务流，仅跳过调试解析。
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/u);
        buffer = lines.pop() ?? '';
        lines.forEach(inspectLine);
      }
      buffer += decoder.decode();
      if (buffer) inspectLine(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.info(`[深度审校调试] 上游调试流结束 ${message}`);
      writeDebugLog({
        level: 'warn',
        scope: 'proofread.upstream',
        event: 'response.stream-ended',
        message: '上游调试流提前结束',
        data: { requestId, error: message },
      });
    } finally {
      reader.releaseLock();
    }
  })();
}

function normalizeDraftTokens(value: unknown): ProofreadDraftToken[] | null {
  if (!Array.isArray(value)) return null;

  const tokens: ProofreadDraftToken[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.word !== 'string' || typeof item.pos !== 'string') {
      return null;
    }
    tokens.push({
      word: item.word,
      pos: item.pos,
      furigana: typeof item.furigana === 'string' ? item.furigana : '',
    });
  }

  return tokens.length > 0 ? tokens : null;
}

export async function POST(req: NextRequest) {
  try {
    const authError = requireApiSession(req);
    if (authError) return authError;

    const requestData = await req.json();
    const source = typeof requestData.source === 'string' ? requestData.source : '';
    const previousSource = typeof requestData.previousSource === 'string'
      ? requestData.previousSource
      : '';
    const nextSource = typeof requestData.nextSource === 'string'
      ? requestData.nextSource
      : '';
    const tokens = normalizeDraftTokens(requestData.tokens);
    if (!source || !tokens) {
      return NextResponse.json(
        { error: { message: '缺少原文或完整分词底稿' } },
        { status: 400 }
      );
    }

    const providerConfig = resolveProviderConfig(req, {
      provider: requestData.provider,
      model: requestData.model,
    });
    if (providerConfig.provider !== 'deepseek') {
      return NextResponse.json(
        { error: { message: '深度审校目前仅支持 DeepSeek' } },
        { status: 400 }
      );
    }
    if (!providerConfig.apiKey) {
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [{
        role: 'user',
        content: buildProofreadPrompt(source, tokens, { previousSource, nextSource }),
      }],
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: PROOFREAD_MAX_OUTPUT_TOKENS,
    }, {
      enableThinking: true,
      reasoningEffort: PROOFREAD_REASONING_EFFORT,
    });
    const debugRequestId = randomUUID();

    console.info(`[深度审校调试] 上游 base URL ${providerConfig.apiUrl}`);
    console.info('[深度审校调试] system prompt 无（messages 中没有 system 角色）');
    console.info(`[深度审校调试] 最终请求 payload ${JSON.stringify(payload)}`);
    writeDebugLog({
      scope: 'proofread.upstream',
      event: 'request.started',
      message: `发送句级审校请求：${source.slice(0, 28)}${source.length > 28 ? '…' : ''}`,
      data: {
        requestId: debugRequestId,
        url: providerConfig.apiUrl,
        method: 'POST',
        systemPrompt: null,
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
      console.error('Proofread API error:', proxied.error.raw ?? proxied.error.message);
      writeDebugLog({
        level: 'error',
        scope: 'proofread.upstream',
        event: 'request.failed',
        message: `上游审校请求失败：${proxied.error.message}`,
        data: { requestId: debugRequestId, status: proxied.status, error: proxied.error.raw },
      });
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
    }

    if (!proxied.response.body) {
      return NextResponse.json(
        { error: { message: '深度审校流式响应创建失败' } },
        { status: 500 }
      );
    }

    logProofreadUpstreamResponse(proxied.response, debugRequestId);

    return new NextResponse(proxied.response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return new Response(null, { status: 499 });
    }

    console.error('Server error (Proofread):', error);
    writeDebugLog({
      level: 'error',
      scope: 'proofread.route',
      event: 'route.error',
      message: '审校 API 路由发生异常',
      data: error,
    });
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
