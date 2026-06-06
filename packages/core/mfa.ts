import { createHmac, timingSafeEqual } from "node:crypto";

// AAL2 session marker (architecture ADR-001). After a passkey ceremony verifies
// server-side, we issue a short-lived HMAC-signed token in an httpOnly cookie.
// Middleware requires BOTH a valid Supabase (AAL1) session AND a valid AAL2
// token whose `sub` matches the signed-in user before granting app access.
//
// This is NOT a bearer credential for the API — it only attests "this session
// completed the second factor". Security Reviewer scrutiny per DRI Risk R5.

export const AAL2_COOKIE = "wlt_mfa";
export const AAL2_TTL_SECONDS = 60 * 60 * 12; // 12h; re-challenge after.

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

interface Aal2Payload {
  sub: string;
  exp: number; // epoch seconds
}

/** Mint a signed AAL2 token for `userId`, valid for `ttlSeconds`. */
export function signAal2Token(
  userId: string,
  secret: string,
  ttlSeconds: number = AAL2_TTL_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload: Aal2Payload = { sub: userId, exp: nowSeconds + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Verify an AAL2 token. Returns the `sub` (user id) if the signature is valid
 * (timing-safe) and unexpired; otherwise null. Never throws.
 */
export function verifyAal2Token(
  token: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
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
    return payload.sub;
  } catch {
    return null;
  }
}
