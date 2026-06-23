// Server-side AAL2 enforcement. Used by protected Server Components + the route
// handlers. Runs in the Node runtime (node:crypto via ./aal2).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AAL2_COOKIE,
  aal2CookieOptions,
  renewedAal2Cookie,
  signAal2Token,
  verifyAal2Token,
} from "./aal2";
import { mfaSecret } from "./config";
import { createServerSupabase } from "./supabase";

/** The current AAL1 (email+password) user, or null. */
export async function getSessionUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current Supabase session id (from the access-token `session_id` claim),
 *  or null. Stable across token refresh within a session. */
async function currentSessionId(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Write the AAL2 marker cookie for `userId` bound to `sid`. Shared by mint +
 *  sliding-renewal so the cookie options can't drift between them. */
async function writeAal2Cookie(userId: string, sid: string | null): Promise<void> {
  const store = await cookies();
  store.set(AAL2_COOKIE, signAal2Token(userId, sid, mfaSecret()), aal2CookieOptions());
}

/** User id IFF the session has AAL1 (Supabase) AND a valid AAL2 token whose
 *  `sub` matches the user AND whose bound `sid` matches the live session.
 *
 *  Sliding renewal: when the (still-valid) AAL2 token has entered its trailing
 *  window, re-mint it. The AUTHORITATIVE renewal seam is the middleware
 *  (`renewedAal2CookieEdge`) — it runs on every request, including the
 *  browsing/read-only path, and CAN persist a response cookie. This route-/
 *  action-side write is a secondary seam: it DOES persist when `getAal2UserId`
 *  is called from a route handler or Server Action, but it is SWALLOWED when
 *  called during a Server Component render (Next forbids `cookies().set()`
 *  there). Relying on this seam alone was the residual "forced logout every few
 *  hours" bug — the middleware now covers the read-only path. An idle session is
 *  never auto-renewed (expired → re-challenge). */
export async function getAal2UserId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const store = await cookies();
  const rawToken = store.get(AAL2_COOKIE)?.value;
  const secret = mfaSecret();
  const claims = verifyAal2Token(rawToken, secret);
  if (!claims || claims.sub !== user.id) return null;
  // Session binding is REQUIRED (fail-closed): the AAL2 token must carry a `sid`
  // and it must match the live Supabase session. A stolen AAL2 cookie therefore
  // can't elevate a different session, and a token minted without a binding is
  // rejected. Supabase access tokens always carry `session_id`, so this does not
  // lock out legitimate sessions.
  const sid = await currentSessionId();
  if (!claims.sid || !sid || claims.sid !== sid) return null;

  // Active session inside its renewal window → slide the marker forward (shared
  // decision with the middleware via `renewedAal2Cookie`, so the two seams can't
  // drift). Best-effort: a Server Component render forbids the write — that's
  // fine, the middleware already renewed (or will on the next request).
  const renewal = renewedAal2Cookie(rawToken, user.id, sid, secret);
  if (renewal) {
    try {
      store.set(renewal.name, renewal.value, renewal.options);
    } catch {
      // Called from a Server Component render — cookie writes are not allowed
      // there. Safe to ignore: the middleware is the authoritative renewal seam
      // for the read-only path, and route handlers / Server Actions persist this
      // write directly. The session stays valid until then (we only reach here
      // while the token is still valid).
    }
  }
  return user.id;
}

/** Redirect to `signInPath` unless the session is fully AAL2. Returns the user id. */
export async function requireAal2(signInPath = "/sign-in"): Promise<string> {
  const id = await getAal2UserId();
  if (!id) redirect(signInPath);
  return id;
}

/** Mint the AAL2 marker after a verified passkey ceremony, bound to the live
 *  Supabase session. Route-handler only. */
export async function setAal2Cookie(userId: string): Promise<void> {
  const sid = await currentSessionId();
  await writeAal2Cookie(userId, sid);
}

export async function clearAal2Cookie(): Promise<void> {
  const store = await cookies();
  store.delete(AAL2_COOKIE);
}
