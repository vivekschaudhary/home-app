// Server-side AAL2 enforcement (architecture ADR-001; AC2 "MFA enforced
// server-side"). Used by protected Server Components + the WebAuthn route
// handlers. Runs in the Node runtime (node:crypto via @wealth/core/mfa).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AAL2_COOKIE,
  AAL2_TTL_SECONDS,
  signAal2Token,
  verifyAal2Token,
} from "@wealth/core/mfa";
import { createServerSupabase } from "@wealth/db/server";
import { mfaSecret } from "./auth-config";

/** The current AAL1 (email+password) user, or null. */
export async function getSessionUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** User id IFF the session has both AAL1 (Supabase) and a valid AAL2 token. */
export async function getAal2UserId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const store = await cookies();
  const sub = verifyAal2Token(store.get(AAL2_COOKIE)?.value, mfaSecret());
  return sub === user.id ? user.id : null;
}

/** Redirect to /sign-in unless the session is fully AAL2. Returns the user id. */
export async function requireAal2(): Promise<string> {
  const id = await getAal2UserId();
  if (!id) redirect("/sign-in");
  return id;
}

/** Mint the AAL2 marker after a verified passkey ceremony. Route-handler only. */
export async function setAal2Cookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(AAL2_COOKIE, signAal2Token(userId, mfaSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AAL2_TTL_SECONDS,
  });
}

export async function clearAal2Cookie(): Promise<void> {
  const store = await cookies();
  store.delete(AAL2_COOKIE);
}
