"use server";

import { getAal2UserId } from "@vc1023/passkey-2fa";
import { cookies } from "next/headers";

// "I'm not sure yet" — a SESSION-scoped escape hatch (no maxAge → cleared when
// the browser session ends). Intent-first by design: an undeclared user is
// re-offered the front door on a fresh sign-in, but isn't re-prompted within the
// session (user-first). Declaring an intent is the permanent skip. Bound to the
// authenticated user so it can't suppress the front door for a DIFFERENT account
// on a shared browser (the gate only honors it when value === the current user).
export async function dismissIntentPrompt(): Promise<void> {
  const userId = await getAal2UserId();
  if (!userId) return;
  (await cookies()).set("intent_dismissed", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "strict",
  });
}
