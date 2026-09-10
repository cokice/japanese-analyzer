import {
  AIModelName,
  AIProvider,
  TTSProvider,
  getImageRecognitionModelName,
  getModelName,
  getTtsModelName,
} from '../services/api';
import { ApiRequestError, InvalidResponseError } from './requestErrors';

type EventData = Record<string, string | number>;
type UmamiTrack = (eventName: string, eventData?: EventData) => void;

declare global {
  interface Window {
    umami?: {
      track?: UmamiTrack;
    };
  }
}

export const ANALYZE_USAGE_EVENT_NAME = 'analyze_sentence';
export const IMAGE_RECOGNITION_USAGE_EVENT_NAME = 'image_text_extract';
export const TTS_USAGE_EVENT_NAME = 'tts_speech';
export const WORD_DETAIL_USAGE_EVENT_NAME = 'word_detail_click';

export interface ImageRecognitionUsage {
  provider: AIProvider;
  model: string;
}

export interface TtsUsage {
  provider: TTSProvider;
  model: string;
}

export interface AnalyzeUsageMetadata {
  imageRecognition?: ImageRecognitionUsage;
  tts?: TtsUsage;
}

interface AnalyticsEvent {
  name: string;
  data: EventData;
}

export function getImageRecognitionUsage(provider: AIProvider, model?: AIModelName): ImageRecognitionUsage {
  return {
    provider,
    model: getImageRecognitionModelName(provider, model),
  };
}

export function getTtsUsage(provider: TTSProvider): TtsUsage {
  return {
    provider,
    model: getTtsModelName(provider),
  };
}

export function getAnalyzeUsageEvent(
  provider: AIProvider,
  usage: AnalyzeUsageMetadata = {},
  model?: AIModelName
): AnalyticsEvent {
  return {
    name: ANALYZE_USAGE_EVENT_NAME,
    data: {
      provider,
      model: getModelName(provider, model),
      image_recognition: usage.imageRecognition ? 'true' : 'false',
      image_provider: usage.imageRecognition?.provider || 'none',
      image_model: usage.imageRecognition?.model || 'none',
      tts: usage.tts ? 'true' : 'false',
      tts_provider: usage.tts?.provider || 'none',
      tts_model: usage.tts?.model || 'none',
    },
  };
}

export function getImageRecognitionUsageEvent(provider: AIProvider, model?: AIModelName): AnalyticsEvent {
  const usage = getImageRecognitionUsage(provider, model);

  return {
    name: IMAGE_RECOGNITION_USAGE_EVENT_NAME,
    data: {
      provider: usage.provider,
      model: usage.model,
    },
  };
}

export function getTtsUsageEvent(provider: TTSProvider): AnalyticsEvent {
  const usage = getTtsUsage(provider);

  return {
    name: TTS_USAGE_EVENT_NAME,
    data: {
      provider: usage.provider,
      model: usage.model,
    },
  };
}

export function getWordDetailUsageEvent(provider: AIProvider, model?: AIModelName): AnalyticsEvent {
  return {
    name: WORD_DETAIL_USAGE_EVENT_NAME,
    data: {
      provider,
      model: getModelName(provider, model),
    },
  };
}

function trackUmamiEvent(event: AnalyticsEvent, debugLabel: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const send = () => {
    const track = window.umami?.track;
    if (typeof track !== 'function') {
      return false;
    }

    try {
      track(event.name, event.data);
      return true;
    } catch (error) {
      console.debug(`Umami ${debugLabel} tracking skipped:`, error);
      return true;
    }
  };

  if (!send()) {
    window.setTimeout(send, 500);
  }
}

export function trackAnalyzeUsage(
  provider: AIProvider,
  usage?: AnalyzeUsageMetadata,
  model?: AIModelName
): void {
  trackUmamiEvent(getAnalyzeUsageEvent(provider, usage, model), 'analyze usage');
}

export function trackImageRecognitionUsage(provider: AIProvider, model?: AIModelName): void {
  trackUmamiEvent(getImageRecognitionUsageEvent(provider, model), 'image recognition usage');
}

export function trackTtsUsage(provider: TTSProvider): void {
  trackUmamiEvent(getTtsUsageEvent(provider), 'tts usage');
}

export function trackWordDetailUsage(provider: AIProvider, model?: AIModelName): void {
  trackUmamiEvent(getWordDetailUsageEvent(provider, model), 'word detail usage');
}

export function getRequestErrorCategory(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 408 || error.status === 504) return 'timeout';
    if (error.status === 401 || error.status === 403) return 'auth';
    if (error.status === 429) return 'rate_limit';
    if (error.status >= 500) return 'server';
    return 'request';
  }
  if (error instanceof InvalidResponseError || error instanceof SyntaxError) return 'invalid_response';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}

/** 每次请求只记录一个终态。入口只接受统计元数据，不接受原文、聊天或密钥。 */
export function createRequestMetrics(
  kind: 'analyze' | 'chat',
  provider: AIProvider,
  model: AIModelName,
  streaming: boolean,
  signal?: AbortSignal,
  dependencies: { now?: () => number; emit?: (event: AnalyticsEvent) => void } = {},
) {
  const now = dependencies.now ?? (() => performance.now());
  const emit = dependencies.emit ?? ((event: AnalyticsEvent) => trackUmamiEvent(event, 'request metrics'));
  const started = now();
  const metadata = { provider, model: getModelName(provider, model), mode: streaming ? 'stream' : 'complete' };
  let firstResultMs: number | undefined;
  let ended = false;
  const elapsed = () => Math.max(0, Math.round(now() - started));
  const finish = (outcome: 'success' | 'error' | 'cancel', extra: EventData = {}) => {
    if (ended) return;
    ended = true;
    signal?.removeEventListener('abort', abort);
    emit({ name: `${kind}_${outcome}`, data: {
      ...metadata,
      duration_ms: elapsed(),
      ...(firstResultMs === undefined ? {} : { first_result_ms: firstResultMs }),
      ...extra,
    } });
  };
  const abort = () => {
    if (kind !== 'analyze') return;
    const reason: unknown = signal?.reason;
    finish('cancel', { cancel_reason: reason === 'user' || reason === 'superseded' || reason === 'unmount' ? reason : 'other' });
  };
  if (kind === 'chat') emit({ name: 'chat_send', data: { ...metadata } });
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  return {
    firstResult() {
      if (!ended && firstResultMs === undefined) firstResultMs = elapsed();
    },
    succeed() { finish('success'); },
    fail(error: unknown) { finish('error', { error_category: getRequestErrorCategory(error) }); },
  };
}
