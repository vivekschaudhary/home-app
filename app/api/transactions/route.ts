import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readTransactionsPage } from "@/app/lib/transactions";

// WLT-23-1 — the Transactions ledger data API. AAL2-gated + owner-scoped (RLS
// session inside the lib). GET = one keyset page; `cursor` (opaque, from a prior
// page) + `q` (free-text search) drive Load-more + search.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const followupParam = params.get("followup");
  const followup = followupParam === "open" || followupParam === "done" ? followupParam : null;
  // WLT-25-1/2 — once per Follow-ups view (the first page, not each Load-more).
  if (followup && !params.get("cursor")) await emitFunnel(FUNNEL_EVENTS.FOLLOWUPS_VIEWED, userId, {});
  const result = await readTransactionsPage(userId, {
    cursor: params.get("cursor"),
    search: params.get("q"),
    accountId: params.get("account"),
    // null (absent) = all categories; "" (present) = the null-category "Other" bucket.
    category: params.get("category"),
    followup, // WLT-25-1 — the Follow-ups filter
    month: params.get("month"), // WLT-26-1 — 'YYYY-MM' month filter (validated in readTransactionsPage)
  });
  if (!result.ok) return Response.json({ error: "server" }, { status: 502 });
  return Response.json(result.page);
}
