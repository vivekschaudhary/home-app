import { getAal2UserId } from "@vc1023/passkey-2fa";
import { flagFollowup, reopenFollowupFlag, resolveFollowupFlag } from "@/app/lib/followups";

// WLT-25-1/2 — flag / resolve / re-open a transaction as a follow-up. AAL2 +
// owner-scoped. POST { dedupKey } flags ("Follow up"); POST { dedupKey, reopen:true }
// re-opens a resolved one (Done → Open); DELETE { dedupKey } resolves ("Done" —
// soft-delete via dismissed_at). Per single charge (no merchant fan-out).
// Discriminated responses; the funnel event is emitted server-side inside the lib.
export const runtime = "nodejs";

async function parseBody(req: Request): Promise<{ dedupKey: string; reopen: boolean } | null> {
  const body = (await req.json().catch(() => null)) as { dedupKey?: unknown; reopen?: unknown } | null;
  if (!body || typeof body.dedupKey !== "string") return null;
  return { dedupKey: body.dedupKey, reopen: body.reopen === true };
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseBody(req);
  if (!body) return Response.json({ error: "invalid" }, { status: 400 });
  const result = body.reopen ? await reopenFollowupFlag(userId, body.dedupKey) : await flagFollowup(userId, body.dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await parseBody(req);
  if (!body) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await resolveFollowupFlag(userId, body.dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}
