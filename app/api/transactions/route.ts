import { getAal2UserId } from "@vc1023/passkey-2fa";
import { readTransactionsPage } from "@/app/lib/transactions";

// WLT-23-1 — the Transactions ledger data API. AAL2-gated + owner-scoped (RLS
// session inside the lib). GET = one keyset page; `cursor` (opaque, from a prior
// page) + `q` (free-text search) drive Load-more + search.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const result = await readTransactionsPage(userId, {
    cursor: params.get("cursor"),
    search: params.get("q"),
  });
  if (!result.ok) return Response.json({ error: "server" }, { status: 502 });
  return Response.json(result.page);
}
