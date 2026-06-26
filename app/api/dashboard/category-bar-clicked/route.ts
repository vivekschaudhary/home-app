import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-26-1 — record that a user clicked a category spend bar (→ the filtered
// ledger). AAL2-gated; best-effort + non-blocking. The WAWU engagement signal
// for the dashboard category chart surface.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  await emitFunnel(FUNNEL_EVENTS.CATEGORY_BAR_CLICKED, userId, {});
  return Response.json({ ok: true });
}
