// AAL2 marker constants + cookie-option shape. NO node:crypto, NO WebCrypto —
// pure data, so it is safe to import from BOTH the Node side (./aal2, ./guard)
// AND the Edge side (./aal2-edge, ./middleware). Keeping these here is what lets
// the Edge middleware reference the cookie name / TTL without dragging
// node:crypto into the Edge bundle (the build failure that the first cut of the
// middleware renewal hit).

export const AAL2_COOKIE = "wlt_mfa";
export const AAL2_TTL_SECONDS = 60 * 60; // 1h of INACTIVITY; slides while active.

// Renew once the token is past this fraction of its life and still valid, so an
// active session's marker is refreshed well before it can expire mid-use. Half
// the TTL gives every active user at least one renewal opportunity per window.
// (Baked-in default; the EFFECTIVE threshold scales with the configurable TTL —
// see aal2RenewAfterSeconds() below — so a preview clock-compression shrinks the
// renewal point too.)
export const AAL2_RENEW_AFTER_SECONDS = AAL2_TTL_SECONDS / 2;

// --- Preview-gated session-clock overrides (FAIL-CLOSED) -------------------
// Lives HERE (crypto-free) so BOTH the Node seam (./aal2, ./guard) AND the Edge
// seam (./aal2-edge, ./middleware) read the SAME effective TTL — otherwise a
// middleware renewal could stretch a preview-compressed marker back to a full
// hour (the Edge/Node drift). The override exists ONLY to let an E2E compress the
// AAL2 clock on a Vercel *preview* deploy (or local dev/test); it MUST be
// impossible to fire in production.
//
// Why an explicit VERCEL_ENV allowlist and NOT isProd()/NODE_ENV: (1) Vercel sets
// NODE_ENV=production for EVERY deploy incl. preview — an OR on it would kill the
// seam where E2E needs it; (2) Next.js INLINES process.env.NODE_ENV as a build
// literal, so an OR on it constant-folds the gate to `true` and dead-code-
// eliminates the override read in the prod bundle. VERCEL_ENV is a runtime var
// Next does NOT inline → a real runtime branch. Fail-closed: anything not on the
// allowlist (unset/"" off-Vercel, "staging", "production", unknown) → production.
const AAL2_TTL_MAX_SECONDS = AAL2_TTL_SECONDS;
const AAL2_RENEWAL_WINDOW_DEFAULT_SECONDS = 5 * 60; // 5m (the #107 renewal-window default)
const NONPROD_VERCEL_ENVS = new Set(["preview", "development"]);
const NONPROD_NODE_ENVS = new Set(["development", "test"]);

/** True ONLY in an explicitly-recognized non-production environment where the
 *  session-clock override may be honored. Fail-closed: unknown/empty/unset → false. */
function overrideAllowed(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv !== undefined && vercelEnv !== "") return NONPROD_VERCEL_ENVS.has(vercelEnv);
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv !== undefined && NONPROD_NODE_ENVS.has(nodeEnv);
}

/** Parse a strictly positive base-10 integer env override within [1, max], or null
 *  if absent/invalid. Rejects "", " ", "1.5", "1e9", "-5", "0x10", "+12", NaN,
 *  zero, and out-of-range → falls back to the secure default (never 0s / NaN). */
function positiveIntEnv(name: string, max: number): number | null {
  const raw = process.env[name];
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) return null;
  return n;
}

/** Effective AAL2 TTL (seconds). Production: always {@link AAL2_TTL_SECONDS}. On
 *  the non-prod allowlist: the AAL2_TTL_SECONDS override if a positive int in
 *  [1, default], else the default. The override can only SHORTEN, never lengthen. */
export function aal2TtlSeconds(): number {
  if (!overrideAllowed()) return AAL2_TTL_SECONDS;
  return positiveIntEnv("AAL2_TTL_SECONDS", AAL2_TTL_MAX_SECONDS) ?? AAL2_TTL_SECONDS;
}

/** Effective half-life renewal threshold (seconds): renew once the token is past
 *  this much of its life. Scales with the EFFECTIVE TTL so a compressed clock
 *  compresses the renewal point too (Node + Edge in lockstep). */
export function aal2RenewAfterSeconds(): number {
  return Math.floor(aal2TtlSeconds() / 2);
}

/** Effective AAL2 renewal WINDOW (seconds), clamped to the effective TTL. Retained
 *  from #107's configurable-window model; the active renewal trigger is the
 *  half-life {@link aal2RenewAfterSeconds}. */
export function aal2RenewalWindowSeconds(): number {
  const ttl = aal2TtlSeconds();
  if (!overrideAllowed()) return Math.min(AAL2_RENEWAL_WINDOW_DEFAULT_SECONDS, ttl);
  const override = positiveIntEnv("AAL2_RENEWAL_WINDOW_SECONDS", AAL2_TTL_MAX_SECONDS);
  return Math.min(override ?? AAL2_RENEWAL_WINDOW_DEFAULT_SECONDS, ttl);
}

/** @deprecated kept for back-compat with #107's tests; the renewal default is
 *  {@link AAL2_RENEW_AFTER_SECONDS}. */
export const AAL2_RENEWAL_WINDOW_SECONDS = AAL2_RENEWAL_WINDOW_DEFAULT_SECONDS;

/** Cookie attributes for the AAL2 marker. Single source so mint (guard),
 *  sliding-renewal (guard), and the middleware renewal can't drift. `secure`
 *  is resolved at write time (depends on NODE_ENV). */
export interface Aal2CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
  maxAge: number;
}

export function aal2CookieOptions(
  secure: boolean = process.env.NODE_ENV === "production",
  // WLT (#104+#107 integration) — the cookie's maxAge tracks the EFFECTIVE TTL, so a
  // preview/dev clock-compression (aal2TtlSeconds()) shrinks the cookie + token
  // together. Stays Edge-safe (no aal2TtlSeconds import here): the Node caller passes
  // it; the default is the baked-in production TTL.
  maxAgeSeconds: number = AAL2_TTL_SECONDS,
): Aal2CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** A cookie ready to be written to a response / cookie store. */
export interface Aal2CookieToSet {
  name: string;
  value: string;
  options: Aal2CookieOptions;
}
