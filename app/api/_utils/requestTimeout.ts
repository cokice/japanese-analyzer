export const UPSTREAM_TIMEOUT_MS = 60_000;
export const UPSTREAM_STREAM_IDLE_TIMEOUT_MS = 90_000;

export function createUpstreamTimeoutController(timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('上游连接超时', 'TimeoutError'));
  }, timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeout),
  };
}

export function createUpstreamSignal(timeoutMs = UPSTREAM_TIMEOUT_MS): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

export function isUpstreamTimeoutError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
