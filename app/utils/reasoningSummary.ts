export interface ReasoningSummaryRequest {
  previousSummary: string;
  reasoningDelta: string;
  signal: AbortSignal;
}

interface ReasoningSummaryControllerOptions {
  requestSummary: (request: ReasoningSummaryRequest) => Promise<string>;
  onSummary: (summary: string) => void;
  onError?: (error: unknown) => void;
  intervalMs?: number;
  maxDeltaChars?: number;
}

const DEFAULT_INTERVAL_MS = 8000;
const DEFAULT_MAX_DELTA_CHARS = 3600;
export const INITIAL_REASONING_SUMMARY = '正在理解原文并规划分析步骤';

function clipReasoningDelta(text: string, maxChars: number): string {
  const characters = Array.from(text);
  if (characters.length <= maxChars) return text;

  const headLength = Math.min(700, Math.floor(maxChars * 0.25));
  const tailLength = maxChars - headLength;
  return `${characters.slice(0, headLength).join('')}\n……\n${characters.slice(-tailLength).join('')}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function sanitizeReasoningSummary(value: string, maxChars = 72): string {
  const cleaned = value
    .replace(/```(?:text|markdown|md)?/gi, ' ')
    .replace(/```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*(?:摘要|当前进度|思考进度)\s*[：:]\s*/u, '')
    .replace(/[“”"'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return Array.from(cleaned).slice(0, maxChars).join('');
}

/**
 * 将不断增长的完整思考文本转换为单并发、增量式的摘要请求。
 * 控制器不依赖 React 状态，避免高频流事件触发额外渲染循环。
 */
export class ReasoningSummaryController {
  private readonly requestSummary: ReasoningSummaryControllerOptions['requestSummary'];
  private readonly onSummary: ReasoningSummaryControllerOptions['onSummary'];
  private readonly onError?: ReasoningSummaryControllerOptions['onError'];
  private readonly intervalMs: number;
  private readonly maxDeltaChars: number;
  private generation = 0;
  private active = false;
  private done = false;
  private inFlight = false;
  private cumulativeText = '';
  private pendingDelta = '';
  private currentSummary = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(options: ReasoningSummaryControllerOptions) {
    this.requestSummary = options.requestSummary;
    this.onSummary = options.onSummary;
    this.onError = options.onError;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxDeltaChars = options.maxDeltaChars ?? DEFAULT_MAX_DELTA_CHARS;
  }

  start(initialSummary = INITIAL_REASONING_SUMMARY): void {
    this.cancel();
    this.active = true;
    this.done = false;
    this.currentSummary = initialSummary;
    this.onSummary(initialSummary);
  }

  ingest(fullReasoningText: string): void {
    if (!this.active || !fullReasoningText || fullReasoningText === this.cumulativeText) return;

    const delta = fullReasoningText.startsWith(this.cumulativeText)
      ? fullReasoningText.slice(this.cumulativeText.length)
      : fullReasoningText;

    this.cumulativeText = fullReasoningText;
    this.pendingDelta += delta;
    this.schedule();
  }

  finish(): void {
    if (!this.active) return;
    this.done = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.inFlight && this.pendingDelta.trim()) {
      void this.runSummaryRequest();
    }
  }

  cancel(): void {
    this.generation += 1;
    this.active = false;
    this.done = false;
    this.inFlight = false;
    this.cumulativeText = '';
    this.pendingDelta = '';
    this.currentSummary = '';

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.abortController?.abort();
    this.abortController = null;
  }

  private schedule(): void {
    if (!this.active || this.inFlight || this.timer || !this.pendingDelta.trim()) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runSummaryRequest();
    }, this.intervalMs);
  }

  private async runSummaryRequest(): Promise<void> {
    if (!this.active || this.inFlight || !this.pendingDelta.trim()) return;

    const requestGeneration = this.generation;
    const rawDelta = this.pendingDelta;
    this.pendingDelta = '';
    this.inFlight = true;
    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      const response = await this.requestSummary({
        previousSummary: this.currentSummary,
        reasoningDelta: clipReasoningDelta(rawDelta, this.maxDeltaChars),
        signal: abortController.signal,
      });
      const summary = sanitizeReasoningSummary(response);

      if (
        this.active
        && requestGeneration === this.generation
        && summary
        && summary !== this.currentSummary
      ) {
        this.currentSummary = summary;
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

      if (this.pendingDelta.trim()) {
        if (this.done) {
          void this.runSummaryRequest();
        } else {
          this.schedule();
        }
      }
    }
  }
}
