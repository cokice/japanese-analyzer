import { stripReasoningBoldMarkdown } from './markdown';

export const REASONING_TAIL_CHAR_LIMIT = 1500;
export const REASONING_VIRTUAL_LINE_CHAR_LIMIT = 220;

export interface ReasoningReviewBlock {
  text: string;
  paragraphEnd: boolean;
}

type StoreListener = () => void;

function cleanReasoningText(text: string): string {
  return stripReasoningBoldMarkdown(text).replace(/\r\n?/g, '\n');
}

function appendVirtualLines(lines: string[], text: string): void {
  if (!text) return;

  let buffer = '';
  const lastLine = lines.at(-1);
  if (
    lastLine
    && !lastLine.endsWith('\n')
    && lastLine.length < REASONING_VIRTUAL_LINE_CHAR_LIMIT
  ) {
    buffer = lines.pop() ?? '';
  }

  for (const character of text) {
    buffer += character;
    if (
      character === '\n'
      || buffer.length >= REASONING_VIRTUAL_LINE_CHAR_LIMIT
    ) {
      lines.push(buffer);
      buffer = '';
    }
  }

  if (buffer) lines.push(buffer);
}

function buildReviewBlocks(text: string): ReasoningReviewBlock[] {
  const blocks: ReasoningReviewBlock[] = [];
  const paragraphs = text
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  paragraphs.forEach((paragraph) => {
    let blockText = '';
    let characterCount = 0;

    for (const character of paragraph) {
      blockText += character;
      characterCount += 1;
      if (characterCount >= REASONING_VIRTUAL_LINE_CHAR_LIMIT) {
        blocks.push({ text: blockText, paragraphEnd: false });
        blockText = '';
        characterCount = 0;
      }
    }

    if (blockText) {
      blocks.push({ text: blockText, paragraphEnd: true });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].paragraphEnd = true;
    }
  });

  return blocks;
}

/**
 * 思维链全文保存在 React state 外，组件只通过递增版本号订阅更新。
 * 虚拟行按增量维护，避免每次流事件重新扫描全部历史文本。
 */
export class ReasoningTextStore {
  private readonly rawTextRef = { current: '' };
  private readonly fullTextRef = { current: '' };
  private readonly virtualLinesRef = { current: [] as string[] };
  private readonly listeners = new Set<StoreListener>();
  private version = 0;
  private reviewBlocksCacheVersion = -1;
  private reviewBlocksCache: ReasoningReviewBlock[] = [];

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): number => this.version;

  readonly getServerSnapshot = (): number => 0;

  setText(rawText: string): void {
    if (rawText === this.rawTextRef.current) return;

    if (rawText.startsWith(this.rawTextRef.current)) {
      const rawDelta = rawText.slice(this.rawTextRef.current.length);
      const cleanDelta = cleanReasoningText(rawDelta);
      this.rawTextRef.current = rawText;
      this.fullTextRef.current += cleanDelta;
      appendVirtualLines(this.virtualLinesRef.current, cleanDelta);
    } else {
      const cleanText = cleanReasoningText(rawText);
      const virtualLines: string[] = [];
      appendVirtualLines(virtualLines, cleanText);
      this.rawTextRef.current = rawText;
      this.fullTextRef.current = cleanText;
      this.virtualLinesRef.current = virtualLines;
    }

    this.emit();
  }

  reset(): void {
    this.rawTextRef.current = '';
    this.fullTextRef.current = '';
    this.virtualLinesRef.current = [];
    this.emit();
  }

  getTail(maxChars = REASONING_TAIL_CHAR_LIMIT): string {
    return this.fullTextRef.current.slice(-maxChars);
  }

  getVirtualLines(): readonly string[] {
    return this.virtualLinesRef.current;
  }

  getReviewBlocks(): readonly ReasoningReviewBlock[] {
    if (this.reviewBlocksCacheVersion !== this.version) {
      this.reviewBlocksCache = buildReviewBlocks(this.fullTextRef.current);
      this.reviewBlocksCacheVersion = this.version;
    }
    return this.reviewBlocksCache;
  }

  getTextLength(): number {
    return this.fullTextRef.current.length;
  }

  private emit(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}
