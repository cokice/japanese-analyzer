import { LOCALES, type Locale } from '../../i18n';
import { buildAnalyzePrompt } from '../../lib/analyzePrompt';
import { DEFAULT_AI_PROVIDER, type AIProvider } from '../../lib/aiModels';
import { parseAnalyzeResponseContent } from '../../services/api';
import { getDayNumber, type DailySentence } from '../../utils/dailySentences';
import { proxyOpenAICompatibleRequest } from './openaiProxy';
import { resolveServerProviderConfig, withProviderControls, type StructuredOutputKind } from './providerConfig';

// 主题和语法点按日期轮换，避免模型天天写出差不多的句子。
// 两个列表长度互质（19 × 17），组合要 323 天才会重复。
const THEMES = [
  '朝の習慣', '食べ物', '料理', '天気', '通勤・通学', '買い物', '友達', '家族', '旅行', '趣味',
  '読書', '音楽', '映画', '仕事', '勉強', '健康', '動物', '自然', '夜の過ごし方',
];
const GRAMMAR_POINTS = [
  '〜ている', '〜たい', '〜から', '〜ので', '〜そうだ（伝聞）', '〜ながら', '〜てしまう', '〜ことができる', '〜たら',
  '〜ば', '〜ようになる', '〜てみる', '〜のに', '〜ばかり', '〜つもりだ', '〜なければならない', '〜かもしれない',
];

function getSeason(dateKey: string): string {
  const month = Number(dateKey.slice(5, 7));
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

export function buildDailySentencePrompt(dateKey: string): string {
  const day = getDayNumber(dateKey);
  const theme = THEMES[day % THEMES.length];
  const grammar = GRAMMAR_POINTS[day % GRAMMAR_POINTS.length];

  return `今天是日本时间 ${dateKey}，季节是${getSeason(dateKey)}。请为日语学习者写一句「今日一句」。

要求：
1. 主题：${theme}。尽量自然地用上语法「${grammar}」，用不自然时可以换成相近的常用表达。
2. 难度 JLPT N5～N3，是日本人日常生活里真的会说的话，不要教科书腔。
3. 长度 10～28 个字符，一句话，以「。」结尾，不含换行、引号、括号、英文字母或阿拉伯数字。
4. 可以呼应季节，但不要出现人名、品牌、政治、宗教、灾难等内容。
5. 同时给出自然的译文：简体中文（zh-CN）、繁体中文（zh-TW）、英语（en）、韩语（ko）。

只返回严格有效的 JSON 对象，不要包含 markdown：
{"text": "日语原句", "translations": {"zh-CN": "…", "zh-TW": "…", "en": "…", "ko": "…"}}`;
}

// 与提示词第 3 条一致：不含阿拉伯数字、拉丁字母、引号、括号（全角半角都算）
const DISALLOWED_SENTENCE_CHARS = /[0-9０-９A-Za-zＡ-Ｚａ-ｚ「」『』（）()"'“”‘’]/;

export class DailySentenceUnavailableError extends Error {}

function pickProvider() {
  const providers: AIProvider[] = DEFAULT_AI_PROVIDER === 'deepseek' ? ['deepseek', 'gemini'] : ['gemini', 'deepseek'];
  for (const provider of providers) {
    const config = resolveServerProviderConfig(provider);
    if (config.apiKey) return config;
  }
  throw new DailySentenceUnavailableError('服务器未配置 API 密钥');
}

async function complete(
  config: ReturnType<typeof resolveServerProviderConfig>,
  prompt: string,
  structuredOutput: StructuredOutputKind,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const proxied = await proxyOpenAICompatibleRequest({
    url: config.apiUrl,
    apiKey: config.apiKey,
    payload: withProviderControls(config.provider, {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      ...extra,
    }, { structuredOutput }),
  });
  if (!proxied.ok) throw new Error(`今日一句请求失败：${proxied.error.message}`);

  const data = await proxied.response.json() as { choices?: { message?: { content?: unknown } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('今日一句返回内容为空');
  return content;
}

function parseJsonObject(content: string): Record<string, unknown> {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const parsed: unknown = JSON.parse(start >= 0 && end > start ? content.slice(start, end + 1) : content);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('今日一句不是 JSON 对象');
  return parsed as Record<string, unknown>;
}

/** 校验生成结果：原句格式、四种译文、分词拼回原句 */
export function validateDailySentence(value: DailySentence): DailySentence {
  const text = value.text.trim();
  if (text.length < 6 || text.length > 40 || /[\n\r]/.test(text)) throw new Error(`今日一句长度或格式不合适：${text}`);
  if (!text.endsWith('。')) throw new Error(`今日一句没有以「。」结尾：${text}`);
  if (DISALLOWED_SENTENCE_CHARS.test(text)) throw new Error(`今日一句含数字、字母、引号或括号：${text}`);
  for (const locale of LOCALES) {
    if (!value.translation[locale]?.trim()) throw new Error(`今日一句缺少 ${locale} 译文`);
  }
  if (value.tokens.map(token => token.word).join('') !== text) throw new Error('今日一句分词无法拼回原句');
  return { ...value, text };
}

async function generateOnce(config: ReturnType<typeof pickProvider>, dateKey: string): Promise<DailySentence> {
  const sentence = parseJsonObject(await complete(config, buildDailySentencePrompt(dateKey), 'dailySentence', { temperature: 1 }));
  const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
  const rawTranslations = (sentence.translations ?? {}) as Record<string, unknown>;
  const translation = Object.fromEntries(
    LOCALES.map(locale => [locale, typeof rawTranslations[locale] === 'string' ? (rawTranslations[locale] as string).trim() : '']),
  ) as Record<Locale, string>;
  if (!text) throw new Error('今日一句原句为空');

  // 分词沿用正式解析的提示词，今日一句的注音、词性和点进去后的解析结果口径一致；偶发拼不回原句时重试一次
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tokens = parseAnalyzeResponseContent(await complete(config, buildAnalyzePrompt(text), 'analysisTokens'));
      return validateDailySentence({ date: dateKey, text, tokens, translation });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** 生成当天的句子；整句不合格时换一句重来一次，仍失败则抛出，由前端改用备用句 */
export async function generateDailySentence(dateKey: string): Promise<DailySentence> {
  const config = pickProvider();
  try {
    return await generateOnce(config, dateKey);
  } catch (error) {
    console.warn('Daily sentence retry:', error instanceof Error ? error.message : error);
    return generateOnce(config, dateKey);
  }
}
