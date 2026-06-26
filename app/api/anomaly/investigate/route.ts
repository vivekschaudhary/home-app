import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

// WLT-26-2 — record that a user clicked "See transactions" on a dashboard anomaly.
// AAL2-gated; best-effort + non-blocking (client fires with keepalive: true before
// navigating). Does NOT flip anomaly status — the panel anomaly stays surfaced until
// explicitly dismissed (architecture: Investigate is navigation + a funnel emit only).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { anomaly_kind?: unknown } | null;
  const anomalyKind = typeof body?.anomaly_kind === "string" ? body.anomaly_kind : "";
  await emitFunnel(FUNNEL_EVENTS.ANOMALY_INVESTIGATED, userId, { anomaly_kind: anomalyKind });
  return Response.json({ ok: true });
}
