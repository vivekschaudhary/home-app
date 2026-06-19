import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-23-2 — fire-and-forget: the user applied an account/category filter on the
// ledger. AAL2-gated; emits once per filter change (the client calls it on change,
// not on Load-more or search), so the event isn't over-counted by pagination.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_FILTERED, userId, {});
  return Response.json({ ok: true });
}
