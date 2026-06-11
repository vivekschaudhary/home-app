// Plaid webhook verification — the trust boundary for the public webhook endpoint.
// Plaid signs each webhook with an ES256 JWT in the `Plaid-Verification` header.
// We verify: (1) the JWT signature against Plaid's JWK (fetched by `kid`, cached),
// (2) the body hash (`request_body_sha256` claim === sha256 of the raw body), and
// (3) freshness (`iat` within 5 min, anti-replay). Returns the parsed payload or
// null — the route rejects null with 401 and never acts on an unverified body.

import { createHash } from "node:crypto";
import { type JWK, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { plaidClient } from "./index";

const keyCache = new Map<string, JWK>();

export async function verifyPlaidWebhook(
  token: string | null,
  rawBody: string,
): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || !header.kid) return null;

    let jwk = keyCache.get(header.kid);
    if (!jwk) {
      const res = await plaidClient().webhookVerificationKeyGet({ key_id: header.kid });
      const k = res.data.key;
      jwk = k as unknown as JWK;
      // Only cache currently-valid keys (Plaid rotates + expires them).
      if (!k.expired_at) keyCache.set(header.kid, jwk);
    }

    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(token, key, { algorithms: ["ES256"] });

    // Freshness — reject stale/replayed webhooks (iat older than 5 min).
    if (typeof payload.iat !== "number" || Date.now() / 1000 - payload.iat > 300) return null;

    // Body integrity — the signed hash must match the actual raw body.
    const expected = createHash("sha256").update(rawBody).digest("hex");
    if (payload.request_body_sha256 !== expected) return null;

    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
