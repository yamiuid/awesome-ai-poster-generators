type RateLimitEntry = Readonly<{ count: number; windowStart: number }>;

export type RateLimiter = Readonly<{
  check: (key: string) => Readonly<{ ok: boolean; retryAfterMs: number }>;
}>;

export function createRateLimiter(config: {
  windowMs: number;
  max: number;
}): RateLimiter {
  const entries = new Map<string, RateLimitEntry>();
  return {
    check(key: string): Readonly<{ ok: boolean; retryAfterMs: number }> {
      const now = Date.now();
      const entry = entries.get(key);
      if (!entry || now - entry.windowStart >= config.windowMs) {
        entries.set(key, { count: 1, windowStart: now });
        return { ok: true, retryAfterMs: 0 };
      }
      if (entry.count >= config.max) {
        return {
          ok: false,
          retryAfterMs: config.windowMs - (now - entry.windowStart),
        };
      }
      entries.set(key, {
        count: entry.count + 1,
        windowStart: entry.windowStart,
      });
      return { ok: true, retryAfterMs: 0 };
    },
  };
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return "local";
}
