import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';

// API密钥从环境变量获取，不暴露给前端
const API_KEY = process.env.API_KEY || '';
const API_URL = process.env.API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL_NAME = "gemini-3-flash-preview";

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const { word, pos, sentence, furigana, romaji, model = MODEL_NAME, apiUrl, useStream = false } = await req.json();
    
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

    if (!word || !pos || !sentence) {
      return NextResponse.json(
        { error: { message: '缺少必要的参数' } },
        { status: 400 }
      );
    }

    // 构建上下文信息
    let contextWordInfo = `单词 "${word}" (词性: ${pos}`;
    if (furigana) contextWordInfo += `, 读音: ${furigana}`;
    if (romaji) contextWordInfo += `, 罗马音: ${romaji}`;
    contextWordInfo += `)`;

    // 构建详情查询请求
    const detailPrompt = `在日语句子 "${sentence}" 的上下文中，${contextWordInfo} 的具体含义是什么？请提供以下信息，并以严格的JSON对象格式返回，不要包含任何markdown或其他非JSON字符：\n\n请特别注意：\n1. 在 "explanation" 字段中，对所有重要的语法术语、动词原形、词形变化等使用【】符号进行高亮标记。\n2. 在 "explanation" 字段的字符串值中，必须使用 \\n (反斜杠和n) 来表示换行。\n3. 在 "explanation" 字段中，提供详尽的语法解释，包括：\n   a. 如果是助词，解释其在本句中的【具体功能和用法】。\n   b. 如果有词形变化，详细说明其【变化规则】（例如：五段动词的て形变化）。\n   c. 解释该词汇在句子结构中扮演的【角色】。\n   d. 提供1-2个简单的【例句】来展示该词形或语法的典型用法。\n4. 如果是动词，准确识别其时态、语态和礼貌程度。\n5. 对于助动词与动词组合，明确说明原形及活用过程。\n6. 对于形容词，注意区分い形容词和な形容词，并识别其活用形式。\n7. 准确提供辞书形。\n\n{\n  "originalWord": "${word}",\n  "chineseTranslation": "中文翻译",\n  "pos": "${pos}",\n  "furigana": "${furigana || ''}",\n  "romaji": "${romaji || ''}",\n  "dictionaryForm": "辞书形（如果适用）",\n  "explanation": "中文解释（请包含详细语法、词形变化规则、助词用法及例句，并使用【】高亮关键术语和 \\n 换行）"\n}`;

    const payload = {
      model: model,
      // OpenAI 兼容接口使用 reasoning_effort（会映射到 Gemini 3 thinking level）
      reasoning_effort: "none",
      messages: [{ role: "user", content: detailPrompt }],
      stream: useStream
    };

    const proxied = await proxyOpenAICompatibleRequest({
      url: effectiveApiUrl,
      apiKey: effectiveApiKey,
      payload,
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
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // 非流式请求，返回完整响应
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Server error (Word Detail):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
