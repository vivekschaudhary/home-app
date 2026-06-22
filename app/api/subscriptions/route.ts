import { getAal2UserId } from "@vc1023/passkey-2fa";
import { readSubscriptionsView } from "@/app/lib/subscriptions";

// WLT-24-1 — the Subscriptions view (reconcile-on-mark refresh for the client).
// AAL2 + owner-scoped (RLS inside the lib). The page RSC emits subscriptions_viewed
// on a fresh visit; this refresh route does not (it's reconcile, not a new view).
export const runtime = "nodejs";

export async function GET() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const view = await readSubscriptionsView(userId);
  return Response.json(view);
}
