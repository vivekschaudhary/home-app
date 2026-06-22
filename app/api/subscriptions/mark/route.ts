import { getAal2UserId } from "@vc1023/passkey-2fa";
import { markSubscription, unmarkSubscription } from "@/app/lib/subscriptions";

// WLT-24-1 — mark / unmark a transaction as a subscription. AAL2 + owner-scoped.
// POST { dedupKey } marks; DELETE { dedupKey } unmarks (hard-delete). Mirrors the
// recategorize route shape (discriminated responses; subscription_marked emitted
// server-side inside the lib, once per write).
export const runtime = "nodejs";

async function parse(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { dedupKey?: unknown } | null;
  return body && typeof body.dedupKey === "string" ? body.dedupKey : null;
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dedupKey = await parse(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await markSubscription(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dedupKey = await parse(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await unmarkSubscription(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}
