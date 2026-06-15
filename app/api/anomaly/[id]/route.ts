import { getAal2UserId } from "@vc1023/passkey-2fa";
import { dismissAnomaly, reviewAnomaly } from "@/app/lib/recap";

// Resolve an anomaly (WLT-18). PATCH { status: 'acted' | 'dismissed', workflowId? }.
//   • 'acted'     → Review it: the WAWU action (writes a recap_review_anomaly run).
//   • 'dismissed' → Dismiss: a quiet status change (no run).
// AAL2-gated + owner-scoped (RLS inside the lib). Idempotent (200 with noop:true
// when the anomaly is already resolved).
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { status?: unknown; workflowId?: unknown } | null;
  if (!body || (body.status !== "acted" && body.status !== "dismissed")) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  if (body.status === "dismissed") {
    const result = await dismissAnomaly({ userId, anomalyId: id });
    if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ ok: true, noop: result.noop });
  }

  // acted → review (needs the running workflow to attach the WAWU run to).
  if (typeof body.workflowId !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const result = await reviewAnomaly({ userId, anomalyId: id, workflowId: body.workflowId });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true, noop: result.noop });
}
