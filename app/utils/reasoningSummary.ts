export interface ReasoningSummaryRequest {
  reasoningSnippet: string;
  signal: AbortSignal;
}

interface ReasoningSummaryControllerOptions {
  requestSummary: (request: ReasoningSummaryRequest) => Promise<string>;
  onSummary: (summary: string) => void;
  onError?: (error: unknown) => void;
  fallbackMs?: number;
  maxSnippetChars?: number;
  maxCharsBeforeSummary?: number;
}

const DEFAULT_FALLBACK_MS = 10_000;
const DEFAULT_MAX_SNIPPET_CHARS = 800;
const DEFAULT_MAX_CHARS_BEFORE_SUMMARY = 600;
const SUMMARY_TRIGGER_PATTERN = /\n|接下来|然后|现在|好[,，]|另外/u;
export const INITIAL_REASONING_SUMMARY = '深度校對中…';
const NON_STEP_SUMMARY_PATTERN = /^(?:深度校對中(?:…| · \d+\/\d+ 句)?|思考中|(?:正在)?(?:连接模型|等待模型(?:响应)?|分析)(?:…|\.{3})?)$/u;

export function formatCompletedReasoningSummaries(
  summaries: readonly string[]
): string[] {
  return summaries
    .map((summary) => summary.trim())
    .filter((summary) => summary && !NON_STEP_SUMMARY_PATTERN.test(summary))
    .map((summary) => summary.replace(/^正在/u, '').trim());
}

function takeLastCharacters(text: string, maxChars: number): string {
  const characters = Array.from(text);
  return characters.length <= maxChars
    ? text
    : characters.slice(-maxChars).join('');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeForComparison(value: string): string {
  return sanitizeReasoningSummary(value)
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLocaleLowerCase();
}

function bigrams(value: string): string[] {
  const characters = Array.from(value);
  if (characters.length < 2) return characters;
  return characters.slice(0, -1).map((character, index) => (
    `${character}${characters[index + 1]}`
  ));
}

export function areReasoningSummariesSimilar(left: string, right: string): boolean {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const shorter = normalizedLeft.length <= normalizedRight.length
    ? normalizedLeft
    : normalizedRight;
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft;
  if (longer.includes(shorter) && longer.length - shorter.length <= 4) return true;

  const leftBigrams = bigrams(normalizedLeft);
  const rightBigrams = bigrams(normalizedRight);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return false;

  const remaining = new Map<string, number>();
  rightBigrams.forEach((bigram) => {
    remaining.set(bigram, (remaining.get(bigram) ?? 0) + 1);
  });
  let overlap = 0;
  leftBigrams.forEach((bigram) => {
    const count = remaining.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      remaining.set(bigram, count - 1);
    }
  });

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length) >= 0.78;
}

export function sanitizeReasoningSummary(value: string, maxChars = 30): string {
  const cleaned = value
    .replace(/```(?:text|markdown|md)?/gi, ' ')
    .replace(/```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*(?:摘要|当前进度|思考进度)\s*[：:]\s*/u, '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。！？!?，,；;：:…]+$/u, '');

  return Array.from(cleaned).slice(0, maxChars).join('');
}

function containsNewTrigger(previousText: string, delta: string): boolean {
  const prefix = previousText.slice(-2);
  const probe = `${prefix}${delta}`;
  SUMMARY_TRIGGER_PATTERN.lastIndex = 0;
  const match = SUMMARY_TRIGGER_PATTERN.exec(probe);
  return Boolean(match && (match.index + match[0].length > prefix.length));
}

/**
 * 将不断增长的完整思考文本转换为事件驱动、单并发的摘要请求。
 * 控制器不依赖 React 状态；在途请求期间只记录 pending，完成后再读取最新缓冲。
 */
export class ReasoningSummaryController {
  private readonly requestSummary: ReasoningSummaryControllerOptions['requestSummary'];
  private readonly onSummary: ReasoningSummaryControllerOptions['onSummary'];
  private readonly onError?: ReasoningSummaryControllerOptions['onError'];
  private readonly fallbackMs: number;
  private readonly maxSnippetChars: number;
  private readonly maxCharsBeforeSummary: number;
  private generation = 0;
  private active = false;
  private inFlight = false;
  private hasSeenReasoning = false;
  private cumulativeText = '';
  private recentBuffer = '';
  private charsSinceLastRequest = 0;
  private pending = false;
  private visibleSummaries: string[] = [];
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(options: ReasoningSummaryControllerOptions) {
    this.requestSummary = options.requestSummary;
    this.onSummary = options.onSummary;
    this.onError = options.onError;
    this.fallbackMs = options.fallbackMs ?? DEFAULT_FALLBACK_MS;
    this.maxSnippetChars = options.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;
    this.maxCharsBeforeSummary = options.maxCharsBeforeSummary
      ?? DEFAULT_MAX_CHARS_BEFORE_SUMMARY;
  }

  start(initialSummary = INITIAL_REASONING_SUMMARY): void {
    this.cancel();
    this.active = true;
    this.visibleSummaries = initialSummary ? [initialSummary] : [];
    this.onSummary(initialSummary);
  }

  ingest(fullReasoningText: string): void {
    if (!this.active || !fullReasoningText || fullReasoningText === this.cumulativeText) return;

    const previousText = this.cumulativeText;
    const delta = fullReasoningText.startsWith(previousText)
      ? fullReasoningText.slice(previousText.length)
      : fullReasoningText;
    if (!delta) return;

    this.cumulativeText = fullReasoningText;
    this.recentBuffer = takeLastCharacters(
      `${this.recentBuffer}${delta}`,
      this.maxSnippetChars
    );
    this.charsSinceLastRequest += Array.from(delta).length;

    const isFirstDelta = !this.hasSeenReasoning;
    this.hasSeenReasoning = true;
    if (
      isFirstDelta
      || containsNewTrigger(previousText, delta)
      || this.charsSinceLastRequest >= this.maxCharsBeforeSummary
    ) {
      this.triggerSummary();
      return;
    }

    this.scheduleFallback();
  }

  finish(): void {
    this.cancel();
  }

  cancel(): void {
    this.generation += 1;
    this.active = false;
    this.inFlight = false;
    this.hasSeenReasoning = false;
    this.cumulativeText = '';
    this.recentBuffer = '';
    this.charsSinceLastRequest = 0;
    this.pending = false;
    this.visibleSummaries = [];
    this.clearFallback();
    this.abortController?.abort();
    this.abortController = null;
  }

  private triggerSummary(): void {
    if (!this.active || !this.recentBuffer.trim()) return;
    this.clearFallback();

    if (this.inFlight) {
      this.pending = true;
      return;
    }

    void this.runSummaryRequest();
  }

  private scheduleFallback(): void {
    if (!this.active || this.fallbackTimer || this.charsSinceLastRequest <= 0) return;

    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      this.triggerSummary();
    }, this.fallbackMs);
  }

  private clearFallback(): void {
    if (!this.fallbackTimer) return;
    clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private async runSummaryRequest(): Promise<void> {
    if (!this.active || this.inFlight || !this.recentBuffer.trim()) return;

    const requestGeneration = this.generation;
    const reasoningSnippet = takeLastCharacters(this.recentBuffer, this.maxSnippetChars);
    this.charsSinceLastRequest = 0;
    this.pending = false;
    this.inFlight = true;
    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      const response = await this.requestSummary({
        reasoningSnippet,
        signal: abortController.signal,
      });
      const summary = sanitizeReasoningSummary(response);

      if (
        this.active
        && requestGeneration === this.generation
        && summary
        && !this.visibleSummaries.some((visibleSummary) => (
          areReasoningSummariesSimilar(summary, visibleSummary)
        ))
      ) {
        this.visibleSummaries = [...this.visibleSummaries, summary].slice(-3);
        this.onSummary(summary);
      }
    } catch (error) {
      if (!isAbortError(error) && requestGeneration === this.generation) {
        this.onError?.(error);
      }
    } finally {
      if (requestGeneration !== this.generation) return;

      this.inFlight = false;
      if (this.abortController === abortController) {
        this.abortController = null;
      }

      if (this.pending) {
        this.triggerSummary();
      } else if (this.charsSinceLastRequest > 0) {
        this.scheduleFallback();
      }
    }
  }
}
