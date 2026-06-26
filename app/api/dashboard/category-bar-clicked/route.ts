import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-26-1 — fire-and-forget: the user clicked a category bar on the dashboard
// spend chart (→ navigating to the filtered ledger). AAL2-gated. Called by the
// CategorySpendChart client component on each bar link click.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { category?: unknown; month?: unknown } | null;
  await emitFunnel(FUNNEL_EVENTS.CATEGORY_BAR_CLICKED, userId, {
    category: typeof body?.category === "string" ? body.category : "",
    month: typeof body?.month === "string" ? body.month : "",
  });
  return Response.json({ ok: true });
}
