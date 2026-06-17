import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-21-2 — record that a user expanded a category's 12-month year-spread (an
// engagement signal). AAL2-gated; best-effort + non-blocking.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await emitFunnel(FUNNEL_EVENTS.BUDGET_SPREAD_VIEWED, userId, {});
  return Response.json({ ok: true });
}
