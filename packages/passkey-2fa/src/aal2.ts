import { createHmac, timingSafeEqual } from "node:crypto";

// AAL2 session marker. After a passkey ceremony verifies server-side, the app
// issues a short-lived HMAC-signed token in an httpOnly cookie. The guard
// requires BOTH a valid Supabase (AAL1) session AND a valid AAL2 token whose
// `sub` matches the user (and, when present, whose `sid` matches the live
// Supabase session) before granting app access. This is NOT an API bearer
// credential — it only attests "this session completed the second factor".

export const AAL2_COOKIE = "wlt_mfa";
export const AAL2_TTL_SECONDS = 60 * 60; // 1h; re-challenge after.

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

/** Mint a signed AAL2 token for `userId`, bound to the Supabase session `sid`. */
export function signAal2Token(
  userId: string,
  sid: string | null,
  secret: string,
  ttlSeconds: number = AAL2_TTL_SECONDS,
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
