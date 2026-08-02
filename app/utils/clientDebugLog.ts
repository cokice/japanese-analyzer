import type { DebugLogInput } from '../types/debugLog';


function makeSerializable(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  try {
    return JSON.parse(JSON.stringify(value, (_key, nestedValue) => (
      nestedValue instanceof Error
        ? { name: nestedValue.name, message: nestedValue.message, stack: nestedValue.stack }
        : nestedValue
    ))) as unknown;
  } catch {
    return String(value);
  }
}

export function writeClientDebugLog(input: Omit<DebugLogInput, 'source'>): void {
  if (process.env.NODE_ENV === 'production') return;
  void fetch('/api/debug/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      source: 'client',
      ...(input.data === undefined ? {} : { data: makeSerializable(input.data) }),
    }),
    keepalive: true,
  }).catch(() => undefined);
}
