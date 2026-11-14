import { isIP } from 'node:net';
import { createServerKeyRateLimiter } from './serverKeyRateLimit';

const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;
// 按 IP 限流时的进程级总上限：限制分布式爆破，同时需要多个来源才能占满。
const LOGIN_GLOBAL_RATE_LIMIT = 100;

// CODE is one shared account. Without a trusted client IP header every attempt
// shares one per-process bucket (ten per minute).
export function createLoginRateLimiter(limit = LOGIN_RATE_LIMIT, windowMs = LOGIN_RATE_WINDOW_MS) {
  const attempts: number[] = [];
  return (now = Date.now()): number => {
    while (attempts.length && attempts[0] <= now - windowMs) attempts.shift();
    if (attempts.length >= limit) return Math.max(1, Math.ceil((attempts[0] + windowMs - now) / 1000));
    // Reserve synchronously before reading the body so concurrent requests count.
    attempts.push(now);
    return 0;
  };
}

/**
 * 读取部署方声明为可信的客户端 IP 请求头（AUTH_CLIENT_IP_HEADER）。
 * 取最后一项：追加式代理（如 X-Forwarded-For）由入口写在最右侧，左侧可被客户端伪造。
 */
export function getTrustedClientIp(headers: Headers, headerName = process.env.AUTH_CLIENT_IP_HEADER): string | null {
  const name = headerName?.trim();
  if (!name) return null;
  const value = headers.get(name)?.split(',').at(-1)?.trim() || '';
  return isIP(value) ? value : 'unknown';
}

/**
 * 未配置可信 IP 头：沿用全局每分钟 10 次。
 * 配置后：每个 IP 每分钟 10 次，再叠加每分钟 100 次的总上限，单个来源无法锁死所有用户。
 * 先检查单 IP 配额，被拒绝的请求不占用总配额。
 */
export function createLoginAttemptLimiter(options: {
  limit?: number;
  globalLimit?: number;
  windowMs?: number;
} = {}) {
  const limit = options.limit ?? LOGIN_RATE_LIMIT;
  const windowMs = options.windowMs ?? LOGIN_RATE_WINDOW_MS;
  const shared = createLoginRateLimiter(limit, windowMs);
  const global = createLoginRateLimiter(options.globalLimit ?? LOGIN_GLOBAL_RATE_LIMIT, windowMs);
  const perIp = createServerKeyRateLimiter();

  return (clientIp: string | null, now = Date.now()): number => {
    if (clientIp === null) return shared(now);
    return perIp(clientIp, limit, windowMs, now) || global(now);
  };
}

const reserve = createLoginAttemptLimiter();
export function reserveLoginAttempt(headers: Headers, now = Date.now()): number {
  return reserve(getTrustedClientIp(headers), now);
}
