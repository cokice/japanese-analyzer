import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { writeRunLog } from '../_utils/runLog';

function buildEpubPrompt(sentence: string): string {
  return `你是一位专业的日语教师。请对以下日语文段进行逐句分解，用于制作日语学习 Epub。

严格按以下 JSON 格式返回，不要包含任何额外文字或 markdown 标记：

{
  "sections": [
    {
      "text": "一句完整的原文",
      "words": [
        "重点词汇（读音）：【词性标签】释义。",
        "重点短语（读音）：【词性标签】释义。"
      ],
      "translation": "这一句的中文翻译"
    }
  ]
}

分解规则：
1. 【以句子为最小单位】使用「。」「！」「？」等句末标点将原文拆分为独立的句子，每句话对应一个 section，按顺序编号
2. 每句话选取 3-6 个重点词汇、短语或语法点进行解释，优先选择 N2/N1 难度的表达
3. 词条格式：日语（假名读音）：【词性标签】释义——释义需简洁准确，用中文说明用法或含义
4. 词性标签使用中文：名词、动词、形容词、副词、助词、助动词、惯用语、接续词、连体词、接尾辞等
5. 翻译要求通顺自然的中文，保留原文语气，该句的关键语法结构应在译文中有所体现
6. 如遇换行符 \\n 分割的段落，视为句子边界处理，但不要在输出 text 中包含 \\n

待分解文段：
${sentence}`;
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let inputText = '';

  try {
    const { sentence, provider, apiUrl, model } = await req.json();
    inputText = sentence || '';
    const providerConfig = resolveProviderConfig(req, { provider, apiUrl, model });

    if (!providerConfig.apiKey) {
      writeRunLog({
        endpoint: '/api/epub',
        input: inputText,
        error: 'missing API key',
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: { message: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥' } },
        { status: 500 }
      );
    }

    if (!sentence) {
      return NextResponse.json(
        { error: { message: '缺少必要的句子内容' } },
        { status: 400 }
      );
    }

    const payload = withProviderControls(providerConfig.provider, {
      model: providerConfig.model,
      messages: [{ role: 'user', content: buildEpubPrompt(sentence) }],
      stream: false,
      max_tokens: 16384,
    });

    const proxied = await proxyOpenAICompatibleRequest({
      url: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
      payload,
    });

    if (!proxied.ok) {
      const errMsg = proxied.error.raw ?? proxied.error.message;
      console.error('AI API error (Epub):', errMsg);
      writeRunLog({
        endpoint: '/api/epub',
        input: inputText,
        error: String(errMsg),
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: { message: proxied.error.message } },
        { status: proxied.status }
      );
    }

    const data = await proxied.response.json();

    // 提取 AI 返回的 sections 做摘要记录
    let summary: unknown = null;
    try {
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        const clean = content.replace(/```json\n?|\n?```/g, '').trim();
        try {
          const parsed = JSON.parse(clean);
          summary = {
            sectionCount: parsed.sections?.length ?? 0,
            sections: parsed.sections?.map((s: { text: string }) => s.text) ?? [],
          };
        } catch {
          // JSON 可能被截断，记录原始长度
          summary = { rawLength: clean.length, note: 'JSON truncated, could not parse sections' };
        }
      }
    } catch { /* ignore parse errors in logging */ }

    writeRunLog({
      endpoint: '/api/epub',
      input: inputText,
      output: summary,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      writeRunLog({
        endpoint: '/api/epub',
        input: inputText,
        error: error.message,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status }
      );
    }

    const errMsg = error instanceof Error ? error.message : '服务器错误';
    console.error('Server error (Epub):', error);
    writeRunLog({
      endpoint: '/api/epub',
      input: inputText,
      error: errMsg,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: { message: errMsg } },
      { status: 500 }
    );
  }
}
