import { requireAal2 } from "@vc1023/passkey-2fa";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasDeclaredIntent } from "@/app/lib/intent";
import { IntentFrontDoor } from "./IntentFrontDoor";

export const dynamic = "force-dynamic";

// The intent-first front door — the first screen after sign-in (intent-first,
// user-first; before connecting a bank). Skip (route onward, no re-prompt) if the
// user already declared an intent (AC7) OR previously dismissed the prompt via
// "explore" (AC5 non-coercion) — server redirect, no flash.
export default async function IntentPage() {
  const userId = await requireAal2();
  // User-bound dismissal: only honor it for the account that set it (shared-browser safe).
  const dismissed = (await cookies()).get("intent_dismissed")?.value === userId;
  if (dismissed || (await hasDeclaredIntent(userId))) redirect("/dashboard");
  return <IntentFrontDoor />;
}
