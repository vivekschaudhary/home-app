// Lightweight in-memory sliding-window rate limiter for the sensitive auth
// routes (Security Review MEDIUM).
//
// SCOPE LIMIT (documented, not hidden): this is PER-INSTANCE. On Vercel Fluid
// Compute it protects within a warm instance but is NOT distributed across
// instances/regions. Production should back this with Upstash Redis (architecture
// Layer 3 names Upstash for cache/rate-limit) or Vercel Firewall rate-limiting.
// Tracked as a follow-up; the call sites below are the integration points.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Standard 429 JSON response for a tripped limit. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSeconds),
    },
  });
}
