import { NextRequest, NextResponse } from 'next/server';

// API密钥从环境变量获取，不暴露给前端
const API_KEY = process.env.API_KEY || '';
const API_URL = process.env.API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL_NAME = "gemini-3-flash-preview";


export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const requestData = await req.json();
    
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

    // 从请求中提取数据
    const { prompt, model = MODEL_NAME, apiUrl, stream = false } = requestData;
    
    // 优先使用用户提供的API URL，否则使用环境变量中的URL
    const effectiveApiUrl = apiUrl || API_URL;
    
    if (!prompt) {
      return NextResponse.json(
        { error: { message: '缺少必要的prompt参数' } },
        { status: 400 }
      );
    }

    // 构建发送到AI服务的请求
    const payload = {
      model: model,
      reasoning_effort: "none", 
      messages: [{ role: "user", content: prompt }],
      stream: stream,
    };

    // 发送到实际的AI API
    const response = await fetch(effectiveApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('AI API error:', data);
      return NextResponse.json(
        { error: data.error || { message: '处理请求时出错' } },
        { status: response.status }
      );
    }

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
    console.error('Server error:', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
} 
