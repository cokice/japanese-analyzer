import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';

// API密钥从环境变量获取，不暴露给前端
const API_KEY = process.env.API_KEY || '';
const OPENAI_API_URL = process.env.API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL_NAME = "gemini-3-flash-preview";

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const { messages, useStream = true } = await req.json();
    
    // 从请求头中获取用户提供的API密钥（如果有）
    const authHeader = req.headers.get('Authorization');
    const userApiKey = authHeader ? authHeader.replace('Bearer ', '') : '';
    
    // 优先使用用户API密钥，如果没有则使用环境变量中的密钥
    const effectiveApiKey = userApiKey || API_KEY;
    
    if (!effectiveApiKey) {
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

    const payload = {
      model: MODEL_NAME,
      // OpenAI 兼容接口使用 reasoning_effort（会映射到 Gemini 3 thinking level）
      reasoning_effort: "none",
      messages: fullMessages,
      stream: useStream,
      max_tokens: 2000,
      temperature: 0.7
    };

    const proxied = await proxyOpenAICompatibleRequest({
      url: OPENAI_API_URL,
      apiKey: effectiveApiKey,
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
    console.error('Server error (Chat):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
