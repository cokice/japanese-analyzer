import { normalizeLocale } from '../../i18n';
import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { requireApiSession } from '../_utils/sessionAuth';
import { getWordDetailSystemPrompt } from '../../lib/wordDetailPrompt';
import { getPhraseDetailSystemPrompt } from '../../lib/phraseDetailPrompt';

export async function POST(req: NextRequest) {
  try {
    const locale = normalizeLocale(req.headers.get('X-App-Locale'));
    const authError = requireApiSession(req);
    if (authError) return authError;

    // 解析请求体
    const { word, pos, sentence, furigana, model, apiUrl, useStream = false, provider, kind } = await req.json();
    // kind: 'phrase' 为用户圈选的多词短语，不需要词性
    const isPhrase = kind === 'phrase';
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    if (!word || (!pos && !isPhrase) || !sentence) {
      return NextResponse.json(
        { error: { message: '缺少必要的参数' } },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
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
    if (error instanceof ProviderConfigError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    if (req.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return new Response(null, { status: 499 });
    }

    console.error('Server error (Word Detail):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
