/**
 * <quote> 标签预处理 / 还原工具。
 *
 * 流程：
 *   发 AI 前 → extractQuotes(text)：提取中文引用，替换为 [Q0] [Q1] ... 占位符
 *   AI 返回后 → restoreQuotes(text, quotes)：占位符还原为原始中文
 */

export interface QuoteExtraction {
  /** 所有中文引用替换为占位符后的清洗文本 */
  cleaned: string;
  /** 提取到的原始中文内容数组，按出现顺序 */
  quotes: string[];
}

const QUOTE_TAG_RE = /<quote>([\s\S]*?)<\/quote>/g;

/**
 * 从文本中提取所有 <quote>...</quote> 块，替换为 [Qn] 占位符。
 * 返回清洗后文本和引用数组。
 */
export function extractQuotes(text: string): QuoteExtraction {
  const quotes: string[] = [];
  let idx = 0;

  const cleaned = text.replace(QUOTE_TAG_RE, (_match, content) => {
    // 保留内部换行，仅去除首尾纯空白行
    quotes.push(content.replace(/^\n+|\n+$/g, ''));
    return `[Q${idx++}]`;
  });

  return { cleaned, quotes };
}

/**
 * 将占位符 [Q0] [Q1] ... 还原为原始中文内容。
 * 还原后的文本用 blockquote 标签包裹，class 为 chinese-quote。
 *
 * @param text 包含占位符的文本
 * @param quotes 原始中文引用数组（由 extractQuotes 返回）
 * @returns 还原后的文本，占位符被替换为 <blockquote class="chinese-quote">原始中文</blockquote>
 */
export function restoreQuotes(text: string, quotes: string[]): string {
  return text.replace(/\[Q(\d+)]/g, (_match, numStr) => {
    const idx = parseInt(numStr, 10);
    if (idx >= 0 && idx < quotes.length) {
      return `<blockquote class="chinese-quote">${quotes[idx]}</blockquote>`;
    }
    return _match; // 找不到对应引用，保留原样
  });
}
