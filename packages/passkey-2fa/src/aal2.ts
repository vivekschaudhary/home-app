import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AAL2_COOKIE,
  AAL2_RENEW_AFTER_SECONDS,
  AAL2_TTL_SECONDS,
  aal2CookieOptions,
  type Aal2CookieOptions,
  type Aal2CookieToSet,
} from "./aal2-constants";

// AAL2 session marker. After a passkey ceremony verifies server-side, the app
// issues a short-lived HMAC-signed token in an httpOnly cookie. The guard
// requires BOTH a valid Supabase (AAL1) session AND a valid AAL2 token whose
// `sub` matches the user (and, when present, whose `sid` matches the live
// Supabase session) before granting app access. This is NOT an API bearer
// credential — it only attests "this session completed the second factor".
//
// The marker SLIDES while the session stays active, so the 1h figure is an
// INACTIVITY window, not an absolute cap on an active session. Without renewal a
// never-idle user was forced to re-authenticate ~1h after sign-in — the "forced
// logout every few hours" defect (contradicting WLT-6 AC2: sessions persist;
// WLT-7 AC1: AAL2 re-challenge is scoped to sensitive step-up actions, not a
// blanket hourly logout).
//
// RENEWAL SEAM (the #104 follow-up): the renewal must persist on the path a
// BROWSING user actually takes. `getAal2UserId()` runs during a Server Component
// render where Next.js forbids `cookies().set()` — so a read-only user's renewal
// write is swallowed and never lands. The authoritative renewal therefore runs
// in the MIDDLEWARE (every request, page navigations included, CAN set response
// cookies), driven by `renewedAal2CookieEdge` (./aal2-edge, WebCrypto). This
// Node module is the source of truth for the token FORMAT + decision; the Edge
// twin is kept byte-compatible by `aal2-edge.test.ts`.
//
// Constants + the cookie-option shape live in ./aal2-constants (crypto-free) so
// the Edge middleware can reference them without dragging node:crypto into the
// Edge bundle. Re-exported here for back-compat (the package barrel re-exports
// this module).

// Constants live in ./aal2-constants (crypto-free, Edge-safe); re-exported here
// for back-compat. The preview-gated session-clock overrides below
// (aal2TtlSeconds, fail-closed) make signAal2Token's default TTL E2E-compressible
// off-production; production always uses the baked-in AAL2_TTL_SECONDS.
export {
  AAL2_COOKIE,
  AAL2_TTL_SECONDS,
  AAL2_RENEW_AFTER_SECONDS,
  aal2CookieOptions,
  type Aal2CookieOptions,
  type Aal2CookieToSet,
};

/** When at most this many seconds of TTL remain, the guard slides the AAL2
 *  cookie forward (re-mints it) on the next request — a sliding session within
 *  the absolute Supabase session, without forcing a fresh passkey ceremony. */
export const AAL2_RENEWAL_WINDOW_SECONDS = 5 * 60; // 5m.

/** Upper bound for a preview/dev override. The override exists ONLY to COMPRESS
 *  the clock for E2E; it must never be able to LENGTHEN the AAL2 boundary past
 *  the production default. A value above the baked-in default (or any absurd
 *  value) is rejected → falls back to the default. */
const AAL2_TTL_MAX_SECONDS = AAL2_TTL_SECONDS;

// --- Preview-gated overrides (FAIL-CLOSED, allowlist) ---
//
// The override exists ONLY to let an E2E run on a Vercel *preview* deploy (or
// local dev/test) compress the AAL2 clock. It must be IMPOSSIBLE for it to fire
// in production.
//
// Why an explicit allowlist on VERCEL_ENV (and NOT `isProd()` from ./config):
//   ./config's isProd() ORs in `NODE_ENV === "production"`. That is the right
//   gate for the WebAuthn origin/secret checks (a self-hosted box must fail
//   loud). But it is WRONG for this seam for two reasons:
//     1. Vercel sets NODE_ENV=production for EVERY deploy, including preview.
//        An OR on NODE_ENV would therefore treat a preview deploy as prod and
//        kill the seam exactly where E2E needs it.
//     2. Next.js INLINES `process.env.NODE_ENV` as a build-time literal, so an
//        OR on it constant-folds the whole gate to `true` and DEAD-CODE-
//        ELIMINATES the override read in the production bundle — verified in
//        `.next/server/.../route.js` (`isProd()` minified to `...||!0`). Keying
//        off VERCEL_ENV (a runtime var Next does NOT inline) preserves a real
//        runtime branch.
//
// FAIL-CLOSED: the override is honored ONLY when the environment is on the
// explicit non-production allowlist below. ANYTHING else — VERCEL_ENV unset on
// a non-Vercel host, "", "staging", "prod", any unknown value, or production —
// is treated as production and returns the baked-in default. With no override
// var set, every path returns the default regardless of environment.

const NONPROD_VERCEL_ENVS = new Set(["preview", "development"]);
const NONPROD_NODE_ENVS = new Set(["development", "test"]);

/** True ONLY in an explicitly-recognized non-production environment where the
 *  session-clock override may be honored. Fail-closed: unknown/empty/unset →
 *  false (treated as production). */
function overrideAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  // On Vercel, VERCEL_ENV is the source of truth: only "preview"/"development".
  // "production" (and any other value) is NOT allowed.
  if (vercelEnv !== undefined && vercelEnv !== "") {
    return NONPROD_VERCEL_ENVS.has(vercelEnv);
  }
  // Off Vercel (VERCEL_ENV unset): allow ONLY explicit local dev/test. A box
  // that set neither var is treated as production (fail-closed), matching the
  // mfaSecret() posture in ./config.
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv !== undefined && NONPROD_NODE_ENVS.has(nodeEnv);
}

/** Parse a strictly positive, base-10 integer env override within [1, max], or
 *  null if absent/invalid. Whitespace is trimmed. NaN, "", negative, zero,
 *  non-integer ("1.5"), scientific notation ("1e9"), and out-of-range values
 *  are all treated as "not set" (fall back to the secure default) rather than
 *  silently producing an unsafe 0s / NaN / unbounded TTL. */
function positiveIntEnv(name: string, max: number): number | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  // Only accept a plain run of decimal digits — this rejects "", " ", "1.5",
  // "1e9", "-5", "0x10", "  12abc", "+12", and similar before numeric coercion.
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) return null;
  return n;
}

/** Effective AAL2 TTL in seconds. Production (anything not on the non-prod
 *  allowlist): always {@link AAL2_TTL_SECONDS}. On the allowlist: the
 *  AAL2_TTL_SECONDS env override if it's a positive int in [1, AAL2_TTL_SECONDS],
 *  else the default. The override can only ever SHORTEN the TTL, never lengthen
 *  it. */
export function aal2TtlSeconds(): number {
  if (!overrideAllowed()) return AAL2_TTL_SECONDS;
  return positiveIntEnv("AAL2_TTL_SECONDS", AAL2_TTL_MAX_SECONDS) ?? AAL2_TTL_SECONDS;
}

/** Effective AAL2 renewal window in seconds. Production: always
 *  {@link AAL2_RENEWAL_WINDOW_SECONDS} (clamped to the TTL). On the non-prod
 *  allowlist: the AAL2_RENEWAL_WINDOW_SECONDS env override if it's a positive
 *  int, else the default — always clamped to NEVER EXCEED the effective TTL. A
 *  renewal window >= the TTL is nonsensical (it would re-mint on every request);
 *  we clamp to the TTL so the value is always a valid sliding-renewal threshold. */
export function aal2RenewalWindowSeconds(): number {
  const ttl = aal2TtlSeconds();
  if (!overrideAllowed()) return Math.min(AAL2_RENEWAL_WINDOW_SECONDS, ttl);
  const override = positiveIntEnv("AAL2_RENEWAL_WINDOW_SECONDS", AAL2_TTL_MAX_SECONDS);
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

/** Decode a token's payload IFF the signature is valid (timing-safe). Internal
 *  shared core for verify + renew so they can't diverge. Returns null on any
 *  signature / structural failure. Does NOT check expiry — callers decide. */
function decodeVerifiedPayload(
  token: string | undefined | null,
  secret: string,
): Aal2Payload | null {
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
    return payload;
  } catch {
    return null;
  }
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
  const payload = decodeVerifiedPayload(token, secret);
  if (!payload) return null;
  if (payload.exp < nowSeconds) return null;
  return { sub: payload.sub, sid: payload.sid ?? null };
}

/**
 * True IFF `token` is currently valid (signature + unexpired) AND has entered
 * its trailing renewal window — i.e. an ACTIVE session whose marker should be
 * re-minted now so it never expires mid-use. False for absent / forged /
 * expired tokens (an expired/idle session is NOT silently renewed — it must
 * re-challenge). The guard calls this on every validated read; renewing here
 * makes the TTL a sliding inactivity window rather than an absolute cap.
 */
export function shouldRenewAal2Token(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const payload = decodeVerifiedPayload(token, secret);
  if (!payload) return false;
  if (payload.exp < nowSeconds) return false; // expired → re-challenge, never auto-renew
  const issuedAt = payload.exp - AAL2_TTL_SECONDS;
  return nowSeconds - issuedAt >= AAL2_RENEW_AFTER_SECONDS;
}

/**
 * Side-effect-free renewal decision. Returns a fresh AAL2 cookie to set IFF the
 * presented `token`:
 *   - is signature-valid and unexpired,
 *   - is in its trailing renewal window,
 *   - binds to THIS `userId` (`sub` match) and THIS `sid` (session match).
 * Otherwise returns null (no renewal — the caller leaves the marker as-is; an
 * expired/idle session re-challenges, a forged or mismatched token is ignored).
 *
 * The Node-side renewal primitive (route handlers / Server Actions). The
 * MIDDLEWARE uses the byte-compatible Edge twin (`renewedAal2CookieEdge`); the
 * two are pinned identical by `aal2-edge.test.ts`. Pure → unit-testable without
 * Next's cookie store, which is exactly the coverage gap that let the original
 * defect survive PR #104.
 */
export function renewedAal2Cookie(
  token: string | undefined | null,
  userId: string,
  sid: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  secure: boolean = process.env.NODE_ENV === "production",
): Aal2CookieToSet | null {
  const claims = verifyAal2Token(token, secret, nowSeconds);
  if (!claims) return null;
  // Fail closed on identity: only renew a marker that already belongs to this
  // user AND this live session. (The guard enforces the same binding before
  // granting access; renewal must never widen it.)
  if (claims.sub !== userId) return null;
  if (!claims.sid || !sid || claims.sid !== sid) return null;
  if (!shouldRenewAal2Token(token, secret, nowSeconds)) return null;
  return {
    name: AAL2_COOKIE,
    value: signAal2Token(userId, sid, secret, AAL2_TTL_SECONDS, nowSeconds),
    options: aal2CookieOptions(secure),
  };
}
