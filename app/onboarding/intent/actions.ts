"use server";

import { getAal2UserId } from "@vc1023/passkey-2fa";
import { cookies } from "next/headers";

// Persist "I'm not sure yet" dismissal — bound to the authenticated user so it
// can't suppress the front door for a DIFFERENT account on a shared browser
// (the gate only honors it when the cookie value === the current user's id).
export async function dismissIntentPrompt(): Promise<void> {
  const userId = await getAal2UserId();
  if (!userId) return;
  (await cookies()).set("intent_dismissed", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "strict",
  });
}
