import { createHmac, timingSafeEqual } from "node:crypto";

// AAL2 session marker. After a passkey ceremony verifies server-side, the app
// issues a short-lived HMAC-signed token in an httpOnly cookie. The guard
// requires BOTH a valid Supabase (AAL1) session AND a valid AAL2 token whose
// `sub` matches the user (and, when present, whose `sid` matches the live
// Supabase session) before granting app access. This is NOT an API bearer
// credential — it only attests "this session completed the second factor".

export const AAL2_COOKIE = "wlt_mfa";

// --- Session-clock defaults (production values; baked in, never weakened) ---
//
// These are the canonical defaults. Production ALWAYS uses them. Outside
// production (preview / dev / test) they can be compressed via env so an E2E
// run can drive the re-challenge + sliding-renewal paths in seconds instead of
// the wall-clock hour the defaults imply — see aal2TtlSeconds() below.

export const AAL2_TTL_SECONDS = 60 * 60; // 1h; re-challenge after.

/** When at most this many seconds of TTL remain, the guard slides the AAL2
 *  cookie forward (re-mints it) on the next request — a sliding session within
 *  the absolute Supabase session, without forcing a fresh passkey ceremony. */
export const AAL2_RENEWAL_WINDOW_SECONDS = 5 * 60; // 5m.

// --- Preview-gated overrides ---
//
// VERCEL_ENV === "production" (or NODE_ENV === "production" when VERCEL_ENV is
// absent, e.g. a self-hosted box) is the production boundary. Mirrors the
// isProd() gate in ./config so a single notion of "production" governs every
// security-relevant default. Production IGNORES the env vars entirely; a leaked
// AAL2_TTL_SECONDS in a prod environment must never be able to shorten the
// second-factor boundary. The override is honored ONLY outside production.

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** Parse a positive-integer env override, or null if absent/invalid. A zero,
 *  negative, or non-numeric value is treated as "not set" (fall back to the
 *  default) rather than silently producing a 0s / NaN TTL. */
function positiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Effective AAL2 TTL in seconds. Production: always {@link AAL2_TTL_SECONDS}.
 *  Outside production: AAL2_TTL_SECONDS env override if it's a positive int,
 *  else the default. */
export function aal2TtlSeconds(): number {
  if (isProd()) return AAL2_TTL_SECONDS;
  return positiveIntEnv("AAL2_TTL_SECONDS") ?? AAL2_TTL_SECONDS;
}

/** Effective AAL2 renewal window in seconds. Production: always
 *  {@link AAL2_RENEWAL_WINDOW_SECONDS}. Outside production: the
 *  AAL2_RENEWAL_WINDOW_SECONDS env override if it's a positive int, else the
 *  default — clamped to never exceed the effective TTL (a renewal window larger
 *  than the TTL would re-mint on every request / is nonsensical). */
export function aal2RenewalWindowSeconds(): number {
  const ttl = aal2TtlSeconds();
  if (isProd()) return Math.min(AAL2_RENEWAL_WINDOW_SECONDS, ttl);
  const override = positiveIntEnv("AAL2_RENEWAL_WINDOW_SECONDS");
  return Math.min(override ?? AAL2_RENEWAL_WINDOW_SECONDS, ttl);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export interface Aal2Claims {
  sub: string; // user id
  sid: string | null; // Supabase session id this AAL2 is bound to
}

interface Aal2Payload extends Aal2Claims {
  exp: number; // epoch seconds
}

/** Mint a signed AAL2 token for `userId`, bound to the Supabase session `sid`.
 *  `ttlSeconds` defaults to the effective (possibly preview-compressed) TTL. */
export function signAal2Token(
  userId: string,
  sid: string | null,
  secret: string,
  ttlSeconds: number = aal2TtlSeconds(),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: Aal2Payload = { sub: userId, sid, exp: nowSeconds + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verify an AAL2 token. Returns its claims (`sub`, `sid`) if the signature is
 * valid (timing-safe) and unexpired; otherwise null. Never throws. Callers must
 * still check `sub` against the signed-in user and `sid` against the live session.
 */
export function verifyAal2Token(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Aal2Claims | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Aal2Payload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < nowSeconds) return null;
    return { sub: payload.sub, sid: payload.sid ?? null };
  } catch {
    return null;
  }
}
