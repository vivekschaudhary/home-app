import { getAal2UserId } from "@vc1023/passkey-2fa";
import { flagFollowup, resolveFollowupFlag } from "@/app/lib/followups";

// WLT-25-1 — flag / resolve a transaction as a follow-up. AAL2 + owner-scoped.
// POST { dedupKey } flags ("Follow up"); DELETE { dedupKey } resolves ("Done" —
// soft-delete via dismissed_at). Per single charge (no merchant fan-out).
// Discriminated responses; the funnel event is emitted server-side inside the lib.
export const runtime = "nodejs";

async function parseKey(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { dedupKey?: unknown } | null;
  return body && typeof body.dedupKey === "string" ? body.dedupKey : null;
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dedupKey = await parseKey(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await flagFollowup(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dedupKey = await parseKey(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await resolveFollowupFlag(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}
