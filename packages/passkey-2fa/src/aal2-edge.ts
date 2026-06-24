// Edge-safe AAL2 renewal — WebCrypto (crypto.subtle) HMAC, NO node:crypto.
//
// This mirrors the token format minted by ./aal2 (Node side) byte-for-byte
// (HMAC-SHA256 over the base64url body, "body.sig"), but uses WebCrypto so it
// can run in the Next.js Edge middleware. It exists for ONE reason: the
// renewal must persist on the path a *browsing* user takes. `getAal2UserId()`
// runs during a Server Component render where `cookies().set()` is forbidden
// (the write is swallowed), so a read-only session's marker was never renewed
// and the user was bounced at the hard 1h boundary — "forced logout every few
// hours" survived PR #104. The middleware runs on every request (page
// navigations included) and CAN set response cookies, so it is the authoritative
// renewal seam. It must NOT import node:crypto (the middleware is Edge), hence
// this module.
//
// The Node-side `renewedAal2Cookie` (./aal2) remains the source of truth for the
// decision + cookie options; this is its WebCrypto twin, kept format-compatible
// and covered by a cross-implementation parity test.

import {
  AAL2_COOKIE,
  aal2RenewAfterSeconds,
  aal2TtlSeconds,
  type Aal2CookieToSet,
} from "./aal2-constants";

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacB64url(body: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToB64url(new Uint8Array(mac));
}

/** Constant-time-ish compare on equal-length strings (Edge has no timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Payload {
  sub: string;
  sid: string | null;
  exp: number;
}

async function decodeVerified(
  token: string | undefined | null,
  secret: string,
): Promise<Payload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacB64url(body, secret);
  if (!safeEqual(sig, expected)) return null;
  try {
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const payload = JSON.parse(json) as Payload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

async function signToken(
  userId: string,
  sid: string | null,
  secret: string,
  nowSeconds: number,
): Promise<string> {
  // Effective (possibly preview-compressed) TTL — read the same source as the
  // Node mint so a compressed clock yields a compressed marker on BOTH seams.
  const body = strToB64url(JSON.stringify({ sub: userId, sid, exp: nowSeconds + aal2TtlSeconds() }));
  const sig = await hmacB64url(body, secret);
  return `${body}.${sig}`;
}

/**
 * Edge-safe twin of `renewedAal2Cookie` (./aal2). Returns a fresh AAL2 cookie to
 * set IFF the presented `token` is signature-valid, unexpired, in its trailing
 * renewal window, and binds to THIS `userId` + `sid`; otherwise null. Pure
 * (no I/O) beyond WebCrypto. The middleware applies the result to its response.
 */
export async function renewedAal2CookieEdge(
  token: string | undefined | null,
  userId: string,
  sid: string | null,
  secret: string,
  secure: boolean,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Aal2CookieToSet | null> {
  const payload = await decodeVerified(token, secret);
  if (!payload) return null;
  if (payload.exp < nowSeconds) return null; // expired → re-challenge, never renew
  // Fail closed on identity: only renew a marker already bound to this user +
  // live session (mirrors the Node guard's binding check; renewal never widens it).
  if (payload.sub !== userId) return null;
  const claimSid = payload.sid ?? null;
  if (!claimSid || !sid || claimSid !== sid) return null;
  // Renewal window: past the EFFECTIVE half-life and still valid. Derive issuance
  // from the effective TTL so a preview/dev clock-compression shrinks the trigger
  // in lockstep with the Node seam (otherwise this would stretch a compressed
  // marker back to a full hour — the Edge/Node drift Codex flagged on #104).
  const issuedAt = payload.exp - aal2TtlSeconds();
  if (nowSeconds - issuedAt < aal2RenewAfterSeconds()) return null;
  return {
    name: AAL2_COOKIE,
    value: await signToken(userId, sid, secret, nowSeconds),
    options: {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: aal2TtlSeconds(),
    },
  };
}
