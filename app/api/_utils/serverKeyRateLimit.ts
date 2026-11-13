import { isIP } from 'node:net';
import { NextRequest } from 'next/server';
import { apiErrorResponse } from './apiErrorResponse';

// 服务器 Key 限流已停用：产品决定不对共享服务器 Key 限流，也不提供环境变量或设置项。
// 实现和测试保留。要恢复时把下面的开关改为 true，每个 IP 在窗口内最多 SERVER_KEY_RATE_LIMIT 次。
const SERVER_KEY_RATE_LIMIT_ENABLED: boolean = false;
const SERVER_KEY_RATE_LIMIT = 30;
const SERVER_KEY_RATE_WINDOW_MS = 600_000;

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
  if (!SERVER_KEY_RATE_LIMIT_ENABLED) return;
  // 启用时反向代理必须覆盖 X-Forwarded-For，否则客户端可以伪造 IP 绕过配额。
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '';
  const ip = isIP(forwarded) ? forwarded : 'unknown';
  const retryAfter = reserve(ip, SERVER_KEY_RATE_LIMIT, SERVER_KEY_RATE_WINDOW_MS);
  if (retryAfter) throw new ServerKeyRateLimitError(retryAfter);
}

export function serverKeyRateLimitResponse(error: unknown) {
  if (!(error instanceof ServerKeyRateLimitError)) return null;
  return apiErrorResponse('RATE_LIMITED', 429, [error.retryAfter], {
    'Retry-After': String(error.retryAfter), 'Cache-Control': 'no-store',
  });
}
