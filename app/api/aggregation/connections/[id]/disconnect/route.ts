import { getAal2UserId } from "@vc1023/passkey-2fa";
import { handlers } from "@/app/lib/aggregation";

// Disconnect: revoke provider-side, destroy the vaulted token, soft-delete the
// connection + its history. Ownership is re-derived in the handler. AAL2-gated.
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await handlers.disconnect({ userId, connectionId: id });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "disconnect_failed" }, { status: 400 });
  }
}
