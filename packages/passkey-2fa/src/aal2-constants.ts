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
export const AAL2_RENEW_AFTER_SECONDS = AAL2_TTL_SECONDS / 2;

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
