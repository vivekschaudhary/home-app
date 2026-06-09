import { requireAal2 } from "@vc1023/passkey-2fa";
import { redirect } from "next/navigation";
import { hasDeclaredIntent } from "@/app/lib/intent";
import { IntentFrontDoor } from "./IntentFrontDoor";

export const dynamic = "force-dynamic";

// The intent-first front door — the first screen after sign-in (intent-first,
// user-first; before connecting a bank). A user who already declared an intent
// is routed onward (no re-prompt — AC7); server redirect, no flash.
export default async function IntentPage() {
  const userId = await requireAal2();
  if (await hasDeclaredIntent(userId)) redirect("/dashboard");
  return <IntentFrontDoor />;
}
