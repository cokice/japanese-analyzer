import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const { messages, useStream = true, provider, apiUrl, model } = await req.json();
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: { message: '缺少消息内容' } },
        { status: 400 }
      );
    }

    // 构建系统提示词，让AI专注于日语学习辅助
    const systemPrompt = `你是一个专业的日语学习助手。请用中文回答用户关于日语的问题，包括但不限于：

1. 日语语法解释和例句
2. 词汇含义、用法和变位
3. 日语文化和习俗
4. 学习方法和建议
5. 日语句子的翻译和解析
6. 敬语的使用方法
7. 日语考试相关问题

请确保回答：
- 准确专业
- 通俗易懂
- 提供具体例句
- 适合中文母语者学习

如果用户问的不是日语相关问题，请礼貌地引导他们询问日语学习相关的内容。`;

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
    });

    if (!proxied.ok) {
      console.error('OpenAI API error:', proxied.error.raw ?? proxied.error.message);
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
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
    if (error instanceof ProviderConfigError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    console.error('Server error (Chat):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
