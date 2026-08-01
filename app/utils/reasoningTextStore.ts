import { stripReasoningBoldMarkdown } from './markdown';

export const REASONING_TAIL_CHAR_LIMIT = 1500;
export const REASONING_VIRTUAL_LINE_CHAR_LIMIT = 220;

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

  getTextLength(): number {
    return this.fullTextRef.current.length;
  }

  private emit(): void {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }
}
