import { getClientLocale, localizeError } from '../i18n';
import { isApiErrorCode, type ApiErrorCode } from '../lib/apiErrors';

// HTTP status and stable codes are safe to classify; analytics never read the body.
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: ApiErrorCode, readonly params?: (string | number)[]) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function apiErrorFromResponse(data: unknown, status: number): ApiRequestError {
  const body = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
  const error = body && typeof body === 'object' ? body as { code?: unknown; params?: unknown } : {};
  const code = isApiErrorCode(error.code) ? error.code : status === 401 ? 'INVALID_API_KEY'
    : status === 429 ? 'RATE_LIMITED' : status === 504 ? 'UPSTREAM_TIMEOUT' : 'SERVER_ERROR';
  const params = Array.isArray(error.params) && error.params.every(value => typeof value === 'string' || typeof value === 'number')
    ? error.params as (string | number)[] : undefined;
  return new ApiRequestError(localizeError({ code, params }, getClientLocale()), status, code, params);
}

export class InvalidResponseError extends Error {
  readonly code = 'INVALID_RESPONSE';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResponseError';
  }
}
