import { isIP } from 'node:net';
import { NextRequest } from 'next/server';
import { apiErrorResponse } from './apiErrorResponse';

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function createServerKeyRateLimiter() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (ip: string, limit: number, windowMs: number, now = Date.now()): number => {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    let bucket = buckets.get(ip);
    if (!bucket) {
      // Bound memory without evicting live quotas (which would allow bypass).
      if (buckets.size >= 10_000) return Math.max(1, Math.ceil(windowMs / 1000));
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }
    if (bucket.count >= limit) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    bucket.count++;
    return 0;
  };
}
const reserve = createServerKeyRateLimiter();
export class ServerKeyRateLimitError extends Error {
  constructor(readonly retryAfter: number) { super('Server key rate limit exceeded'); }
}

export function reserveServerKeyRequest(req: NextRequest) {
  if (/^Bearer\s+\S+/i.test(req.headers.get('Authorization') || '')) return;
  // The deployment proxy must overwrite X-Forwarded-For; see README.
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';
  const ip = isIP(forwarded) ? forwarded : 'unknown';
  const retryAfter = reserve(ip, positiveInteger(process.env.SERVER_KEY_RATE_LIMIT, 30),
    positiveInteger(process.env.SERVER_KEY_RATE_WINDOW_SECONDS, 600) * 1000);
  if (retryAfter) throw new ServerKeyRateLimitError(retryAfter);
}

export function serverKeyRateLimitResponse(error: unknown) {
  if (!(error instanceof ServerKeyRateLimitError)) return null;
  return apiErrorResponse('RATE_LIMITED', 429, [error.retryAfter], {
    'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store',
  });
}
