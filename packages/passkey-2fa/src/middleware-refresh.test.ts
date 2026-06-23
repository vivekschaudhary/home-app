// @vitest-environment node
//
// Regression #3 for "Forced logout every few hours."
//
// The first two regressions (aal2-renewal*.test.ts) fixed the AAL2 marker's
// sliding-TTL axis: an actively-browsing session now renews its 1h marker at the
// middleware seam, so it no longer expires mid-use. That is necessary but NOT
// sufficient — the symptom recurred.
//
// ROOT CAUSE (this regression): the middleware read the Supabase session TWICE
// on every request — once via `auth.getUser()` (validates AAL1 + rotates the
// refresh token when the access token is near expiry) and AGAIN via
// `auth.getSession()` purely to recover the `session_id` for AAL2 renewal. Each
// call is an independent refresh-token-rotation trigger. Supabase rotates the
// refresh token on use and REVOKES THE WHOLE SESSION on detected reuse of an
// already-rotated token (the "refresh token reuse" security response).
//
// The middleware runs on EVERY request, and Next.js fires multiple CONCURRENT
// middleware invocations per navigation (link prefetch + the RSC/data request).
// Doubling the per-request rotation surface (getUser THEN getSession) widens the
// window in which two in-flight requests both present the same refresh token
// outside the reuse interval → Supabase revokes the session → the user is
// bounced to /sign-in. For a continuously-active single user this fires
// stochastically — i.e. "every few hours", independent of the AAL2 TTL.
//
// THE FIX this test pins: the middleware must validate the session ONCE per
// request and derive the AAL2 `sid` from that SAME result — never a second
// token-mutating round-trip. `getUser()` (or any second refresh trigger) must
// not run on the renewal path.
//
// This is a UNIT pin of the rotation-surface invariant. The real
// concurrency/revocation behaviour is a Supabase-runtime contract; the
// auth→rotation→render vertical belongs to Automation (flagged in the PR).
//
// REVIEW RESPONSE (PR review BLOCKER#2 — "renewal must slide on every nav incl.
// read-only RSC AND fail-closed"): the suite below now pins, AT THE MIDDLEWARE
// SEAM (not just the underlying primitive):
//   • renewal is written on a NON-protected (read-only/browsing) path — the
//     seam is not gated behind `protectedPaths`, so plain navigation slides it;
//   • a TAMPERED marker (bad signature) writes NO renewal cookie — the seam
//     itself fails closed (the swallowed-write hole of PR #104 cannot re-emit a
//     forged marker);
//   • a marker bound to a DIFFERENT sid writes no renewal — binding fail-close.
// The remaining axis the Reviewer named — Set-Cookie actually landing on a real
// Next.js read-only RSC/prefetch transition under live concurrency — is a
// runtime contract that a unit mock cannot prove; it is the Automation E2E this
// PR is contingent on.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock next/server: NextResponse.next / .redirect + a cookie jar. --------
const redirectCalls: URL[] = [];

function makeResponse() {
  const jar = new Map<string, { value: string; options: unknown }>();
  return {
    cookies: {
      set(name: string, value: string, options?: unknown) {
        jar.set(name, { value, options });
      },
      get(name: string) {
        return jar.get(name);
      },
    },
    __jar: jar,
    __kind: "next" as const,
  };
}

vi.mock("next/server", () => ({
  NextResponse: {
    next: () => makeResponse(),
    redirect: (url: URL) => {
      redirectCalls.push(url);
      return { __kind: "redirect" as const, url };
    },
  },
}));

// ---- Mock env + config so the factory has stable inputs. --------------------
vi.mock("./env", () => ({
  SUPABASE_URL: () => "http://localhost:54321",
  SUPABASE_ANON_KEY: () => "anon-key",
}));
vi.mock("./config", () => ({ mfaSecret: () => "test-secret" }));

// ---- Spy-able Supabase auth surface the middleware uses. --------------------
// We count EVERY session-mutating call (getUser + getSession), because each is a
// refresh-token-rotation trigger. The fix must keep this at exactly one.
let getUserCalls = 0;
let getSessionCalls = 0;
// Toggle whether the mocked client has an authenticated session (drives the
// unauthenticated-redirect gate test).
let signedIn = true;

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const SID = "sess-abc";

// A Supabase access token whose payload carries session_id=SID (unsigned — the
// middleware reads the claim without verifying; the token came from a trusted
// client). header.payload.sig
function accessTokenWithSid(sid: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ session_id: sid, sub: USER.id })}.sig`;
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      async getUser() {
        getUserCalls += 1;
        return { data: { user: signedIn ? USER : null }, error: null };
      },
      async getSession() {
        getSessionCalls += 1;
        return {
          data: {
            session: signedIn
              ? { access_token: accessTokenWithSid(SID), user: USER }
              : null,
          },
          error: null,
        };
      },
    },
  }),
}));

// ---- A minimal NextRequest stub. --------------------------------------------
import { AAL2_COOKIE, AAL2_TTL_SECONDS } from "./aal2-constants";
import { signAal2Token } from "./aal2";

function makeRequest(pathname: string, cookies: Record<string, string>) {
  const map = new Map(Object.entries(cookies));
  return {
    nextUrl: {
      pathname,
      clone() {
        return { pathname, href: `http://localhost${pathname}` } as unknown as URL;
      },
    },
    cookies: {
      get(name: string) {
        const value = map.get(name);
        return value === undefined ? undefined : { name, value };
      },
      getAll() {
        return [...map.entries()].map(([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        map.set(name, value);
      },
    },
  } as unknown as import("next/server").NextRequest;
}

// A marker minted `ageSeconds` into the past (so it sits deep in its renewal
// window but is still valid), for `sid`.
function markerAged(sid: string, ageSeconds: number): string {
  const issuedAt = Math.floor(Date.now() / 1000) - ageSeconds;
  return signAal2Token(USER.id, sid, "test-secret", AAL2_TTL_SECONDS, issuedAt);
}

describe("middleware refresh-token rotation surface (forced-logout regression #3)", () => {
  beforeEach(() => {
    getUserCalls = 0;
    getSessionCalls = 0;
    redirectCalls.length = 0;
    signedIn = true;
  });

  it("validates the session ONCE per request — no redundant second token read on the renewal path", async () => {
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });

    // An active session with a still-valid AAL2 marker INSIDE its renewal window,
    // so the renewal path is exercised (the path that previously did the second
    // getSession() round-trip).
    const marker = markerAged(SID, AAL2_TTL_SECONDS - 60); // deep in the renewal window

    await mw(makeRequest("/dashboard", { [AAL2_COOKIE]: marker }));

    // The session must be validated exactly once. A second token-mutating call
    // (a second getSession or an additional getUser) is the rotation-doubling
    // defect that revokes the session under prefetch concurrency.
    const tokenReads = getUserCalls + getSessionCalls;
    expect(tokenReads).toBe(1);
  });

  it("still renews the AAL2 marker from that single session read (sid derived, not re-fetched)", async () => {
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });

    const marker = markerAged(SID, AAL2_TTL_SECONDS - 60); // in renewal window, still valid

    const res = (await mw(
      makeRequest("/dashboard", { [AAL2_COOKIE]: marker }),
    )) as unknown as { __jar: Map<string, { value: string }> };

    // The marker was renewed (a fresh AAL2 cookie was written to the response) —
    // proving the fix preserves sliding renewal WITHOUT the second rotation.
    const renewed = res.__jar.get(AAL2_COOKIE);
    expect(renewed).toBeDefined();
    expect(renewed!.value).not.toBe(marker); // re-minted, slid forward
  });

  // --- BLOCKER#2 response: the renewal seam slides on a NON-protected path. ---
  // The middleware matcher covers ALL routes (verified in the build manifest:
  // `/((?!_next/static|_next/image|...).*)`), including read-only browsing
  // routes that are NOT in `protectedPaths`. Renewal must NOT be gated behind
  // the protected-path check, or a browsing-only user on public-but-authed pages
  // would never slide their marker — exactly the PR #104 read-path hole.
  it("renews the marker on a NON-protected (read-only/browsing) path too", async () => {
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });

    const marker = markerAged(SID, AAL2_TTL_SECONDS - 60);

    // `/account` is NOT a protected path — a plain browsing navigation. The
    // marker must still slide (the seam runs on every request, not just gated
    // ones), and we must NOT redirect.
    const res = (await mw(
      makeRequest("/account", { [AAL2_COOKIE]: marker }),
    )) as unknown as { __jar: Map<string, { value: string }> };

    expect(redirectCalls).toHaveLength(0);
    const renewed = res.__jar.get(AAL2_COOKIE);
    expect(renewed).toBeDefined();
    expect(renewed!.value).not.toBe(marker);
    // Still a single session read on the non-protected path.
    expect(getUserCalls + getSessionCalls).toBe(1);
  });

  // --- BLOCKER#2 response: fail-closed AT THE SEAM on a tampered marker. ------
  // The negative test the Reviewer asked for. A forged/tampered marker (valid
  // structure, bad signature) must produce NO renewal cookie — the middleware
  // cannot be coaxed into re-emitting an attacker-supplied marker. (The request
  // is not redirected here because the AAL2 GRANT is enforced server-side by the
  // Node guard; the middleware is the coarse AAL1 gate + renewal seam only.)
  it("writes NO renewal cookie for a TAMPERED marker (seam fails closed)", async () => {
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });

    const valid = markerAged(SID, AAL2_TTL_SECONDS - 60);
    // Flip the signature → signature-invalid but structurally a token.
    const tampered = `${valid.split(".")[0]}.deadbeefdeadbeefdeadbeef`;

    const res = (await mw(
      makeRequest("/dashboard", { [AAL2_COOKIE]: tampered }),
    )) as unknown as { __jar: Map<string, { value: string }> };

    expect(res.__jar.get(AAL2_COOKIE)).toBeUndefined(); // no renewal re-emitted
  });

  // --- BLOCKER#2 response: fail-closed on session-binding mismatch. -----------
  // A marker bound to a DIFFERENT Supabase session (sid) than the live one must
  // not renew — a stolen marker can't be slid forward against another session.
  it("writes NO renewal cookie when the marker's sid does not match the live session", async () => {
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"] });

    // Live session is SID (from the mocked access token); marker is bound to a
    // DIFFERENT session.
    const otherSessionMarker = markerAged("sess-OTHER", AAL2_TTL_SECONDS - 60);

    const res = (await mw(
      makeRequest("/dashboard", { [AAL2_COOKIE]: otherSessionMarker }),
    )) as unknown as { __jar: Map<string, { value: string }> };

    expect(res.__jar.get(AAL2_COOKIE)).toBeUndefined(); // binding fail-closed
  });

  it("the coarse gate still redirects an unauthenticated hit on a protected path (single read)", async () => {
    signedIn = false;
    const { createPasskeyMiddleware } = await import("./middleware");
    const mw = createPasskeyMiddleware({ protectedPaths: ["/dashboard"], signInPath: "/sign-in" });

    await mw(makeRequest("/dashboard", {}));

    // Redirected to sign-in AND still only one session read (no rotation storm
    // for signed-out users either).
    expect(redirectCalls).toHaveLength(1);
    expect(redirectCalls[0].pathname).toBe("/sign-in");
    expect(getUserCalls + getSessionCalls).toBe(1);
  });
});
