// Server-side AAL2 enforcement. Used by protected Server Components + the route
// handlers. Runs in the Node runtime (node:crypto via ./aal2).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AAL2_COOKIE, AAL2_TTL_SECONDS, signAal2Token, verifyAal2Token } from "./aal2";
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

/** User id IFF the session has AAL1 (Supabase) AND a valid AAL2 token whose
 *  `sub` matches the user AND whose bound `sid` matches the live session. */
export async function getAal2UserId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const store = await cookies();
  const claims = verifyAal2Token(store.get(AAL2_COOKIE)?.value, mfaSecret());
  if (!claims || claims.sub !== user.id) return null;
  if (claims.sid) {
    const sid = await currentSessionId();
    if (sid && claims.sid !== sid) return null;
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
  const store = await cookies();
  store.set(AAL2_COOKIE, signAal2Token(userId, sid, mfaSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: AAL2_TTL_SECONDS,
  });
}

export async function clearAal2Cookie(): Promise<void> {
  const store = await cookies();
  store.delete(AAL2_COOKIE);
}
