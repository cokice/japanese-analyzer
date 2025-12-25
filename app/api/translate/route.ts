import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';

// API密钥从环境变量获取，不暴露给前端
const API_KEY = process.env.API_KEY || '';
const API_URL = process.env.API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL_NAME = "gemini-3-flash-preview";

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const { text, model = MODEL_NAME, apiUrl, stream = false } = await req.json();
    
    // 从请求头中获取用户提供的API密钥（如果有）
    const authHeader = req.headers.get('Authorization');
    const userApiKey = authHeader ? authHeader.replace('Bearer ', '') : '';
    
    // 优先使用用户API密钥，如果没有则使用环境变量中的密钥
    const effectiveApiKey = userApiKey || API_KEY;
    
    // 优先使用用户提供的API URL，否则使用环境变量中的URL
    const effectiveApiUrl = apiUrl || API_URL;
    
    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { error: { message: '缺少必要的文本内容' } },
        { status: 400 }
      );
    }

    // 构建翻译请求
    const translationPrompt = `请将以下日文文本翻译成简体中文。重要：请务必保持与原文完全相同的段落和换行结构。

原文：
${text}

    请仅返回翻译后的中文文本。`;
    const payload = {
      model: model,
      // OpenAI 兼容接口使用 reasoning_effort（会映射到 Gemini 3 thinking level）
      reasoning_effort: "none",
      messages: [{ role: "user", content: translationPrompt }],
      stream: stream
    };

    const proxied = await proxyOpenAICompatibleRequest({
      url: effectiveApiUrl,
      apiKey: effectiveApiKey,
      payload,
    });

    if (!proxied.ok) {
      console.error('AI API error (Translation):', proxied.error.raw ?? proxied.error.message);
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
    }

    const response = proxied.response;

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
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error('Server error (Translation):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
} 
