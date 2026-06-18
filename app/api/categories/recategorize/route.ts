import { getAal2UserId } from "@vc1023/passkey-2fa";
import { recategorizeTransaction } from "@/app/lib/categories";

// WLT-22-2/3 — save the user's category for ONE transaction (the per-transaction
// override), or — with `applyToMerchant` (WLT-22-3) — "remember the merchant":
// create a rule + backfill all the user's matching transactions. AAL2-gated +
// owner-scoped (RLS session inside the lib; the composite FK guarantees the
// categoryId belongs to this user). transaction_recategorized / category_rule_created
// are emitted server-side inside the lib (once per deliberate write).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { dedupKey?: unknown; categoryId?: unknown; applyToMerchant?: unknown }
    | null;
  if (!body || typeof body.dedupKey !== "string" || typeof body.categoryId !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const applyToMerchant = body.applyToMerchant === true;

  const result = await recategorizeTransaction(userId, body.dedupKey, body.categoryId, applyToMerchant);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true, count: result.count });
}
