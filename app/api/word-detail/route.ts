import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const { word, pos, sentence, furigana, romaji, model, apiUrl, useStream = false, provider } = await req.json();
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });
    
    if (!providerConfig.apiKey) {
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
    const detailPrompt = `在日语句子 "${sentence}" 的上下文中，${contextWordInfo} 的具体含义是什么？请只返回严格有效的 JSON/json 对象，不要包含 markdown 或其他非 JSON 字符。

JSON 对象必须包含这些字符串字段：
- "originalWord"
- "chineseTranslation"
- "pos"
- "furigana"
- "romaji"
- "dictionaryForm"
- "explanation"

请特别注意：
1. 在 "explanation" 字段中，对所有重要的语法术语、动词原形、词形变化等使用【】符号进行高亮标记。
2. "explanation" 是 JSON 字符串；需要换行时请使用 JSON 标准换行转义，让解析后的字符串包含真实换行。不要双重转义，不要输出会被用户看到的字面量“反斜杠+n”文本。
3. 所有字符串字段的内容中不要使用 ASCII 双引号 U+0022；需要引用英语原词、日语词形或中文释义时，请使用中文引号、单引号或【】。
4. 在 "explanation" 字段中，提供详尽的语法解释，包括：
   a. 如果是助词，解释其在本句中的【具体功能和用法】。
   b. 如果有词形变化，详细说明其【变化规则】（例如：五段动词的て形变化）。
   c. 解释该词汇在句子结构中扮演的【角色】。
   d. 提供1-2个简单的【例句】来展示该词形或语法的典型用法。
5. 如果是动词，准确识别其时态、语态和礼貌程度。
6. 对于助动词与动词组合，明确说明原形及活用过程。
7. 对于形容词，注意区分い形容词和な形容词，并识别其活用形式。
8. 准确提供辞书形；如果某字段不适用，请返回空字符串。

JSON 示例：
{
  "originalWord": "${word}",
  "chineseTranslation": "中文翻译",
  "pos": "${pos}",
  "furigana": "${furigana || ''}",
  "romaji": "${romaji || ''}",
  "dictionaryForm": "辞书形（如果适用）",
  "explanation": "中文解释（请包含详细语法、词形变化规则、助词用法及例句，并使用【】高亮关键术语；需要换行时使用 JSON 标准换行转义）"
}`;

    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [{ role: "user", content: detailPrompt }],
      stream: useStream,
    }, { structuredOutput: 'wordDetail' });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
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

    console.error('Server error (Word Detail):', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '服务器错误' } },
      { status: 500 }
    );
  }
}
