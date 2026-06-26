import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-26-2 — fire-and-forget: the user clicked "See transactions" on a dashboard
// anomaly panel row (→ navigating to the filtered ledger). AAL2-gated. Called by
// AnomalyPanelClient on the investigate link click.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { anomaly_kind?: unknown } | null;
  await emitFunnel(FUNNEL_EVENTS.ANOMALY_INVESTIGATED, userId, {
    anomaly_kind: typeof body?.anomaly_kind === "string" ? body.anomaly_kind : "",
  });
  return Response.json({ ok: true });
}
