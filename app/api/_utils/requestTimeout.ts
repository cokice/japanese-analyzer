export const UPSTREAM_TIMEOUT_MS = 60_000;

export function createUpstreamSignal(timeoutMs = UPSTREAM_TIMEOUT_MS): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

export function isUpstreamTimeoutError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
