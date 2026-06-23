import { describe, expect, it } from "vitest";
import {
  AAL2_COOKIE,
  AAL2_TTL_SECONDS,
  renewedAal2Cookie,
  signAal2Token,
  verifyAal2Token,
} from "./aal2";

// Regression #2 for "Forced logout every few hours."
//
// PR #104 added a sliding-renewal HELPER (`shouldRenewAal2Token`) and called it
// from `getAal2UserId()`. But that renewal cookie WRITE is swallowed on the
// primary browsing path: `(app)/layout.tsx` → `requireAal2()` → `getAal2UserId()`
// runs during a SERVER COMPONENT RENDER, where Next.js forbids `cookies().set()`
// — the write throws and is caught by `catch {}`. So renewal only ever persists
// when the user hits a *mutating route handler* in the trailing window.
//
// A user who only READS pages (dashboard, transactions, budget — all RSC
// renders, no API write in the last 30 min of the hour) therefore NEVER
// persists a renewal, and is still bounced to /sign-in at the hard 1h boundary.
// The original regression test passed because it manually re-minted the token
// in its own loop — it never exercised a real persistence seam (the
// `mocked-auth-green` / `polished-but-broken` trap).
//
// These tests pin the ACTUAL fix: a SIDE-EFFECT-FREE renewal decision
// (`renewedAal2Cookie`) that the *middleware* (which runs on every request,
// including page navigations, and CAN set response cookies) applies — so a
// continuously-active browsing-only session slides forward without ever needing
// to hit a route handler.

const SECRET = "test-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const SID = "sess-abc";
const NOW = 1_700_000_000;

describe("AAL2 renewal — side-effect-free decision for the middleware seam", () => {
  it("returns a fresh cookie to set once a still-valid token enters its window", () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);

    // Early: no renewal yet.
    expect(renewedAal2Cookie(token, USER, SID, SECRET, NOW + 60)).toBeNull();

    // Deep in the window but still valid: renewal cookie must be produced.
    const deep = NOW + AAL2_TTL_SECONDS - 60;
    const cookie = renewedAal2Cookie(token, USER, SID, SECRET, deep);
    expect(cookie).not.toBeNull();
    expect(cookie?.name).toBe(AAL2_COOKIE);
    expect(cookie?.options.httpOnly).toBe(true);
    expect(cookie?.options.sameSite).toBe("strict");
    expect(cookie?.options.maxAge).toBe(AAL2_TTL_SECONDS);
    // The minted cookie is itself a valid, unexpired AAL2 token for this user.
    expect(verifyAal2Token(cookie!.value, SECRET, deep)).toEqual({ sub: USER, sid: SID });
  });

  it("returns null (no renewal) for expired / forged / mismatched tokens", () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    // Expired → re-challenge, never silently renew.
    expect(renewedAal2Cookie(token, USER, SID, SECRET, NOW + AAL2_TTL_SECONDS + 1)).toBeNull();
    // Forged / wrong secret.
    expect(renewedAal2Cookie("garbage", USER, SID, SECRET, NOW + 60)).toBeNull();
    expect(renewedAal2Cookie(token, USER, SID, "wrong", NOW + 60)).toBeNull();
    // sub mismatch (token for a different user) → fail closed, no renewal.
    expect(renewedAal2Cookie(token, "someone-else", SID, SECRET, NOW + AAL2_TTL_SECONDS - 60)).toBeNull();
    // sid mismatch (token bound to a different session) → fail closed.
    expect(renewedAal2Cookie(token, USER, "other-sid", SECRET, NOW + AAL2_TTL_SECONDS - 60)).toBeNull();
  });

  it("a browsing-only session (middleware renews, NO route-handler writes) survives 3h", () => {
    // Simulate the real read path: every request runs the middleware, which is
    // the seam that CAN persist a cookie. The user never POSTs to an API, so
    // `getAal2UserId()`'s swallowed RSC write contributes nothing. Renewal must
    // still slide the marker forward purely through the middleware.
    let stored = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);

    for (let t = NOW; t <= NOW + 3 * 60 * 60; t += 10 * 60) {
      // On every request the guard must still see a VALID marker (no logout).
      expect(verifyAal2Token(stored, SECRET, t)).not.toBeNull();
      // The middleware applies the side-effect-free decision: if it returns a
      // cookie, that becomes the new stored value (the response Set-Cookie).
      const renewal = renewedAal2Cookie(stored, USER, SID, SECRET, t);
      if (renewal) stored = renewal.value;
    }
  });

  it("an IDLE browsing session is still bounded — no renewal past expiry", () => {
    const stored = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    // User goes idle: the next request is 2h later. Marker already expired →
    // the middleware must NOT renew; the guard re-challenges.
    const idleReturn = NOW + 2 * 60 * 60;
    expect(verifyAal2Token(stored, SECRET, idleReturn)).toBeNull();
    expect(renewedAal2Cookie(stored, USER, SID, SECRET, idleReturn)).toBeNull();
  });
});
