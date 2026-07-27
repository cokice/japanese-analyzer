import { NextRequest, NextResponse } from 'next/server';
import { proxyOpenAICompatibleRequest } from '../_utils/openaiProxy';
import { ProviderConfigError, resolveProviderConfig, withProviderControls } from '../_utils/providerConfig';
import { writeRunLog } from '../_utils/runLog';
import { extractQuotes } from '@/app/utils/quoteProcessor';

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
7. 文本中的 [Q0] [Q1] 等是引用占位符，请原样保留在对应句子的 text 字段中，不要翻译或修改它们
8. 对容易出错或混淆的语法成分（如助词「は」「が」的区别、时态选择、敬语用法、自他动词等），在 words 数组中使用「⚠️易错：」前缀进行特别说明，排版格式与其他词条相同

待分解文段：
${sentence}`;
}

/**
 * 按句末标点将文本拆分为句子数组。
 */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  // 在 ！？!? 处切分，保留标点
  const parts = text.split(/(?<=[。！？!?])/g);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) sentences.push(trimmed);
  }
  return sentences;
}

/**
 * 将长文本按最大字符数切片，在句边界处切割。
 * 返回字符串数组，每片约 maxChars 字。
 */
function splitText(text: string, maxChars: number = 3000): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if (current && current.length + s.length > maxChars) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += current ? ` ${s}` : s;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/** AI 返回的 sections JSON 结构 */
interface AiSection {
  text: string;
  words: string[];
  translation: string;
}

interface AiResponse {
  sections: AiSection[];
}

/**
 * 从 AI 响应中解析 sections。
 */
function parseAiSections(data: unknown): AiSection[] | null {
  try {
    const obj = data as Record<string, unknown>;
    const choices = obj?.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content !== 'string') return null;

    const clean = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed: AiResponse = JSON.parse(clean);
    if (!Array.isArray(parsed.sections)) return null;
    return parsed.sections;
  } catch {
    return null;
  }
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

    // ---- 按文章标题分割输入 ----
    const ARTICLE_TITLE_RE = /（(\d{4}年\d{1,2}月[Nn]\d[^）]*)）/g;
    const titleMatches: Array<{ title: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = ARTICLE_TITLE_RE.exec(sentence)) !== null) {
      titleMatches.push({ title: m[0], start: m.index, end: m.index + m[0].length });
    }

    // 如果没有找到标题，整个输入视为一篇无标题文章
    if (titleMatches.length === 0) {
      titleMatches.push({ title: '', start: 0, end: 0 });
    }

    // 构建文章块：[{ title, bodyText }]
    const articleChunks: Array<{ title: string; body: string }> = [];
    for (let i = 0; i < titleMatches.length; i++) {
      const cur = titleMatches[i];
      const next = titleMatches[i + 1];
      const bodyStart = cur.title ? cur.end : 0;
      const bodyEnd = next ? next.start : sentence.length;
      const body = sentence.slice(bodyStart, bodyEnd).trim();
      if (body) {
        articleChunks.push({ title: cur.title, body });
      }
    }

    const MAX_TOKENS_DEFAULT = 16384;
    const MAX_TOKENS_MEDIUM = 32768;
    const CHUNK_MAX_CHARS = 3000;

    // ---- 逐篇文章处理 ----
    const articles: Array<{
      title: string;
      sections: Array<{
        text: string;
        words: string[];
        translation: string;
        chineseQuotes?: string[];
      }>;
    }> = [];

    for (const chunk of articleChunks) {
      // 提取 quotes
      const { cleaned: cleanText, quotes } = extractQuotes(chunk.body);

      const textLen = cleanText.length;
      const textChunks = textLen > 8000
        ? splitText(cleanText, CHUNK_MAX_CHARS)
        : [cleanText];
      const maxTokens = textLen <= 3000 ? MAX_TOKENS_DEFAULT : MAX_TOKENS_MEDIUM;

      const allSections: AiSection[] = [];

      for (let ci = 0; ci < textChunks.length; ci++) {
        const payload = withProviderControls(providerConfig.provider, {
          model: providerConfig.model,
          messages: [{ role: 'user', content: buildEpubPrompt(textChunks[ci]) }],
          stream: false,
          max_tokens: maxTokens,
        });

        const proxied = await proxyOpenAICompatibleRequest({
          url: providerConfig.apiUrl,
          apiKey: providerConfig.apiKey,
          payload,
        });

        if (!proxied.ok) {
          const errMsg = proxied.error.raw ?? proxied.error.message;
          console.error(`AI API error (Epub):`, errMsg);
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
        const sections = parseAiSections(data);

        if (!sections) {
          console.error('Failed to parse AI response');
          writeRunLog({
            endpoint: '/api/epub',
            input: inputText,
            error: 'AI response parse error',
            durationMs: Date.now() - startedAt,
          });
          return NextResponse.json(
            { error: { message: 'AI 返回格式异常，请重试' } },
            { status: 500 }
          );
        }

        allSections.push(...sections);
      }

      // ---- 后处理：提取 chineseQuotes，隐藏 [Qn] ----
      if (quotes.length > 0) {
        for (const sec of allSections) {
          const matches = sec.text.match(/\[Q(\d+)\]/g);
          if (matches) {
            const chineseQuotes: string[] = [];
            for (const qm of matches) {
              const numStr = qm.match(/\d+/)![0];
              const idx = parseInt(numStr, 10);
              if (idx >= 0 && idx < quotes.length) {
                chineseQuotes.push(quotes[idx]);
              }
            }
            if (chineseQuotes.length > 0) {
              (sec as AiSection & { chineseQuotes?: string[] }).chineseQuotes = chineseQuotes;
            }
            // 移除 [Qn] 占位符
            sec.text = sec.text.replace(/\s*\[Q\d+\]\s*/g, '');
          }
        }
      }

      articles.push({
        title: chunk.title,
        sections: allSections.map((sec) => ({
          text: sec.text,
          words: sec.words,
          translation: sec.translation,
          chineseQuotes: (sec as AiSection & { chineseQuotes?: string[] }).chineseQuotes,
        })),
      });
    }

    // ---- 日志记录 ----
    let summary: unknown = null;
    try {
      summary = {
        articleCount: articles.length,
        totalSections: articles.reduce((sum, a) => sum + a.sections.length, 0),
      };
    } catch { /* ignore */ }

    writeRunLog({
      endpoint: '/api/epub',
      input: inputText,
      output: summary,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      choices: [{
        message: {
          content: JSON.stringify({ articles }),
        },
      }],
    });
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
