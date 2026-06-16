import { AIProvider, getModelName } from '../services/api';

type UmamiTrack = (eventName: string, eventData?: Record<string, string>) => void;

declare global {
  interface Window {
    umami?: {
      track?: UmamiTrack;
    };
  }
}

export const ANALYZE_USAGE_EVENT_NAME = 'analyze_sentence';

export function getAnalyzeUsageEvent(provider: AIProvider) {
  return {
    name: ANALYZE_USAGE_EVENT_NAME,
    data: {
      provider,
      model: getModelName(provider),
    },
  };
}

export function trackAnalyzeUsage(provider: AIProvider): void {
  if (typeof window === 'undefined') {
    return;
  }

  const event = getAnalyzeUsageEvent(provider);

  const send = () => {
    const track = window.umami?.track;
    if (typeof track !== 'function') {
      return false;
    }

    try {
      track(event.name, event.data);
      return true;
    } catch (error) {
      console.debug('Umami analyze usage tracking skipped:', error);
      return true;
    }
  };

  if (!send()) {
    window.setTimeout(send, 500);
  }
}
