import { getAal2UserId } from "@vc1023/passkey-2fa";
import { completeAction } from "@/app/lib/workflow";

// Complete the workflow's one platform-prompted action (set the net-worth
// target) — writes the immutable WorkflowRun (the WAWU unit). AAL2-gated +
// owner-scoped (RLS session inside completeAction).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { workflowId?: unknown; target?: unknown } | null;
  if (!body || typeof body.workflowId !== "string" || typeof body.target !== "number") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const result = await completeAction({ userId, workflowId: body.workflowId, target: body.target });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true, target: result.target });
}
