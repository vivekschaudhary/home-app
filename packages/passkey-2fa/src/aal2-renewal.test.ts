import { describe, expect, it } from "vitest";
import {
  AAL2_TTL_SECONDS,
  shouldRenewAal2Token,
  signAal2Token,
  verifyAal2Token,
} from "./aal2";

// Regression: "Forced logout every few hours."
//
// Root cause (diagnosed): the AAL2 marker has a hard 1h absolute TTL and is
// minted ONLY at the second-factor ceremony — never renewed on the validated
// read path. So a CONTINUOUSLY ACTIVE session is bounced to /sign-in ~1h after
// sign-in, regardless of activity. This contradicts WLT-6 AC2 ("session
// persists across reload + restart") and WLT-7 AC1 (AAL2 re-challenge is scoped
// to sensitive step-up actions, not a blanket hourly logout).
//
// These tests pin the FIX: an active session's AAL2 marker slides forward as
// the user keeps using the app, so a never-idle user is not forced to
// re-authenticate at the 1h mark. The hard TTL still bounds an IDLE session.

const SECRET = "test-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const SID = "sess-abc";
const NOW = 1_700_000_000;

describe("AAL2 sliding renewal (forced-logout regression)", () => {
  it("flags renewal once a still-valid token enters its trailing window", () => {
    // Token minted with the full 1h TTL.
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);

    // Early in the session: still well inside TTL, no renewal needed.
    expect(shouldRenewAal2Token(token, SECRET, NOW + 60)).toBe(false);

    // Deep into the session (>50% elapsed) but BEFORE expiry: a request here
    // must renew so an active user never crosses the hard boundary mid-use.
    const deep = NOW + AAL2_TTL_SECONDS - 60; // 1 min before expiry, still valid
    expect(verifyAal2Token(token, SECRET, deep)).not.toBeNull(); // proves: still valid
    expect(shouldRenewAal2Token(token, SECRET, deep)).toBe(true); // BUG before fix: no renewal path existed
  });

  it("does NOT flag renewal for an already-expired token (idle session stays bounded)", () => {
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    const past = NOW + AAL2_TTL_SECONDS + 1; // expired
    expect(verifyAal2Token(token, SECRET, past)).toBeNull();
    expect(shouldRenewAal2Token(token, SECRET, past)).toBe(false);
  });

  it("does NOT flag renewal for an invalid/forged/absent token", () => {
    expect(shouldRenewAal2Token(undefined, SECRET, NOW)).toBe(false);
    expect(shouldRenewAal2Token("garbage", SECRET, NOW)).toBe(false);
    const token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    expect(shouldRenewAal2Token(token, "wrong-secret", NOW + 60)).toBe(false);
  });

  it("a continuously-active session never gets forced out at the 1h mark", () => {
    // Simulate a user active every 10 min for 3 hours, renewing whenever the
    // helper says to. Before the fix the marker expired at the first 1h
    // boundary and the user was bounced; after the fix it slides forward.
    let token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, NOW);
    for (let t = NOW; t <= NOW + 3 * 60 * 60; t += 10 * 60) {
      // On each request the session MUST still be valid (never forced out).
      expect(verifyAal2Token(token, SECRET, t)).not.toBeNull();
      if (shouldRenewAal2Token(token, SECRET, t)) {
        token = signAal2Token(USER, SID, SECRET, AAL2_TTL_SECONDS, t);
      }
    }
  });
});
