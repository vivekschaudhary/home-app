import { getAal2UserId } from "@vc1023/passkey-2fa";
import { completeRecapAction } from "@/app/lib/recap";

// Complete the recap's one prompted action (adjust/raise the net-worth target) —
// writes a REPEATABLE WorkflowRun (the WAWU unit), weekly-idempotent. AAL2-gated
// + owner-scoped (RLS session inside completeRecapAction). A re-submit in the
// same ISO week returns 200 with noop:true (idempotent), not an error.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { workflowId?: unknown; target?: unknown; kind?: unknown }
    | null;
  if (
    !body ||
    typeof body.workflowId !== "string" ||
    typeof body.target !== "number" ||
    typeof body.kind !== "string"
  ) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const result = await completeRecapAction({
    userId,
    workflowId: body.workflowId,
    target: body.target,
    kind: body.kind,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true, target: result.target, noop: result.noop });
}
