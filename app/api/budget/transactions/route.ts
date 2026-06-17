import { getAal2UserId } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readCategoryTransactions } from "@/app/lib/budget";

// WLT-22-1 — the line items behind a category's "this month so far" number.
// AAL2-gated + owner-scoped (RLS session inside the read). `category` may be ""
// (the null-category "Other" bucket); a missing param is invalid.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category"); // null = absent; "" = Other
  const month = url.searchParams.get("month");
  if (category === null || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const result = await readCategoryTransactions(userId, category, month);
  await emitFunnel(FUNNEL_EVENTS.CATEGORY_DRILLDOWN_VIEWED, userId, {});
  return Response.json(result);
}
