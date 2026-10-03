// CODE is one shared account. Do not trust client-supplied forwarding headers as
// limiter keys. Each server process permits at most ten attempts per minute.
export function createLoginRateLimiter(limit = 10, windowMs = 60_000) {
  const attempts: number[] = [];
  return (now = Date.now()): number => {
    while (attempts.length && attempts[0] <= now - windowMs) attempts.shift();
    if (attempts.length >= limit) return Math.max(1, Math.ceil((attempts[0] + windowMs - now) / 1000));
    // Reserve synchronously before reading the body so concurrent requests count.
    attempts.push(now);
    return 0;
  };
}
export const reserveLoginAttempt = createLoginRateLimiter();
