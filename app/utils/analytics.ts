import { AIProvider, TTSProvider, getModelName, getTtsModelName } from '../services/api';

type UmamiTrack = (eventName: string, eventData?: Record<string, string>) => void;

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
  data: Record<string, string>;
}

export function getImageRecognitionUsage(provider: AIProvider): ImageRecognitionUsage {
  return {
    provider,
    model: getModelName(provider),
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
  usage: AnalyzeUsageMetadata = {}
): AnalyticsEvent {
  return {
    name: ANALYZE_USAGE_EVENT_NAME,
    data: {
      provider,
      model: getModelName(provider),
      image_recognition: usage.imageRecognition ? 'true' : 'false',
      image_provider: usage.imageRecognition?.provider || 'none',
      image_model: usage.imageRecognition?.model || 'none',
      tts: usage.tts ? 'true' : 'false',
      tts_provider: usage.tts?.provider || 'none',
      tts_model: usage.tts?.model || 'none',
    },
  };
}

export function getImageRecognitionUsageEvent(provider: AIProvider): AnalyticsEvent {
  const usage = getImageRecognitionUsage(provider);

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

export function getWordDetailUsageEvent(provider: AIProvider): AnalyticsEvent {
  return {
    name: WORD_DETAIL_USAGE_EVENT_NAME,
    data: {
      provider,
      model: getModelName(provider),
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

export function trackAnalyzeUsage(provider: AIProvider, usage?: AnalyzeUsageMetadata): void {
  trackUmamiEvent(getAnalyzeUsageEvent(provider, usage), 'analyze usage');
}

export function trackImageRecognitionUsage(provider: AIProvider): void {
  trackUmamiEvent(getImageRecognitionUsageEvent(provider), 'image recognition usage');
}

export function trackTtsUsage(provider: TTSProvider): void {
  trackUmamiEvent(getTtsUsageEvent(provider), 'tts usage');
}

export function trackWordDetailUsage(provider: AIProvider): void {
  trackUmamiEvent(getWordDetailUsageEvent(provider), 'word detail usage');
}
