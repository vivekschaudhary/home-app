// Rate limiting for the sensitive auth routes.
//
// The limiter is PLUGGABLE: `createPasskeyAuthHandlers` accepts a `rateLimit`
// (RateLimiter). The default is the in-memory FIXED-WINDOW counter below — fine
// for a single instance, but note two limits: (1) PER-INSTANCE — on serverless /
// Fluid Compute it protects within a warm instance, NOT across instances/regions;
// (2) fixed-window allows up to ~2× `limit` across a window boundary (not a true
// sliding window). For production at scale, inject a distributed/sliding limiter
// (e.g. Upstash Redis) — see the README. Because RateLimiter may be async, all
// call sites await it.

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/** A rate limiter. Receives the bucket key + the per-call-site limit/window so a
 *  single implementation (memory, Redis, …) can serve every endpoint. */
export type RateLimiter = (
  key: string,
  limit: number,
  windowMs: number,
) => RateLimitResult | Promise<RateLimitResult>;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Default per-instance in-memory fixed-window limiter. */
export const inMemoryRateLimit: RateLimiter = (key, limit, windowMs) => {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
};

/** Best-effort client IP from proxy headers. SECURITY: `x-forwarded-for` is only
 *  trustworthy behind a trusted proxy (e.g. Vercel sets it) — it is client-
 *  spoofable otherwise, so don't rely on it for anything but coarse throttling. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 JSON response for a tripped limit. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
  });
}
