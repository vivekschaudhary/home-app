import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-22-1 — record that a user opened a category's line-item drill-down (the
// verification signal). Fired client-side on FIRST open per load so it counts
// once per category per page load — not on every data refetch/retry (AC6).
// AAL2-gated; best-effort + non-blocking.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await emitFunnel(FUNNEL_EVENTS.CATEGORY_DRILLDOWN_VIEWED, userId, {});
  return Response.json({ ok: true });
}
