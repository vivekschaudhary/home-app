import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { verifyPlaidWebhook } from "@wealth/aggregation/plaid/webhook";
import { CONNECTION_REFRESH_EVENT, inngest } from "@wealth/jobs";

// Plaid webhook receiver. UNauthenticated but VERIFIED (JWT/JWK + body-hash +
// replay). On a transactions update → enqueue an incremental refresh; on a
// login-required signal → mark the connection needs_reauth. Ownership is
// re-derived from the item id (we never trust the body for who/what to touch).
export const runtime = "nodejs";

const REFRESH_CODES = new Set([
  "SYNC_UPDATES_AVAILABLE",
  "HISTORICAL_UPDATE",
  "DEFAULT_UPDATE",
  "INITIAL_UPDATE",
]);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const body = await verifyPlaidWebhook(req.headers.get("plaid-verification"), rawBody);
  if (!body) return new Response(JSON.stringify({ error: "unverified" }), { status: 401 });

  const itemId = typeof body.item_id === "string" ? body.item_id : null;
  if (!itemId) return Response.json({ ok: true }); // ack non-item webhooks

  // Resolve item → our connection (re-derive ownership; ignore any body identifiers).
  const svc = createServiceSupabase();
  const { data: conn } = await svc
    .from("account_connections")
    .select("id, user_id")
    .eq("provider", "plaid")
    .eq("provider_connection_id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!conn) return Response.json({ ok: true }); // unknown/removed item — ack, do nothing
  const c = conn as { id: string; user_id: string };

  const type = String(body.webhook_type ?? "");
  const code = String(body.webhook_code ?? "");

  if (type === "TRANSACTIONS" && REFRESH_CODES.has(code)) {
    await inngest.send({ name: CONNECTION_REFRESH_EVENT, data: { connectionId: c.id, userId: c.user_id } });
  } else if (type === "ITEM") {
    const errorCode = (body.error as { error_code?: string } | undefined)?.error_code;
    if (errorCode === "ITEM_LOGIN_REQUIRED" || code === "PENDING_EXPIRATION") {
      await svc.from("account_connections").update({ health_status: "needs_reauth" }).eq("id", c.id);
    }
  }

  return Response.json({ ok: true });
}
