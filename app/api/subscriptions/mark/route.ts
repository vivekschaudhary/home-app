import { getAal2UserId } from "@vc1023/passkey-2fa";
import { markSubscription, unmarkSubscription, unmarkSubscriptionFromLedger } from "@/app/lib/subscriptions";

// WLT-24-1/3 — mark / unmark a transaction as a subscription. AAL2 + owner-scoped.
// POST { dedupKey } marks the whole MERCHANT; DELETE { dedupKeys[] } dismisses one
// PRICE SERIES (WLT-24-3 — a vendor can have several subscriptions, each removed
// independently). Discriminated responses; the funnel event is emitted server-side
// inside the lib, once per write.
export const runtime = "nodejs";

async function parseKey(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { dedupKey?: unknown } | null;
  return body && typeof body.dedupKey === "string" ? body.dedupKey : null;
}

async function parseKeys(req: Request): Promise<string[] | null> {
  const body = (await req.json().catch(() => null)) as { dedupKeys?: unknown } | null;
  if (!body || !Array.isArray(body.dedupKeys)) return null;
  const keys = body.dedupKeys.filter((k): k is string => typeof k === "string" && k.length > 0);
  return keys.length ? keys : null;
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const dedupKey = await parseKey(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await markSubscription(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  // The PANEL sends a series' `dedupKeys[]` (dismiss exactly those); the LEDGER sends
  // a single `dedupKey` (dismiss the series that charge belongs to, resolved server-side).
  const body = (await req.clone().json().catch(() => null)) as { dedupKey?: unknown; dedupKeys?: unknown } | null;
  if (body && Array.isArray(body.dedupKeys)) {
    const dedupKeys = await parseKeys(req);
    if (!dedupKeys) return Response.json({ error: "invalid" }, { status: 400 });
    const result = await unmarkSubscription(userId, dedupKeys);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
    return Response.json({ ok: true });
  }
  const dedupKey = await parseKey(req);
  if (!dedupKey) return Response.json({ error: "invalid" }, { status: 400 });
  const result = await unmarkSubscriptionFromLedger(userId, dedupKey);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  return Response.json({ ok: true });
}
