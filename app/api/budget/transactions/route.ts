import { getAal2UserId } from "@vc1023/passkey-2fa";
import { readCategoryTransactions } from "@/app/lib/budget";

// WLT-22-1 — the line items behind a category's "this month so far" number.
// AAL2-gated + owner-scoped (RLS session inside the read). `category` may be ""
// (the null-category "Other" bucket); a missing param is invalid. The
// `category_drilldown_viewed` funnel event is emitted client-side on FIRST open
// per load (POST /api/budget/drilldown-viewed) — NOT here, so retries/refetches
// of this data route don't double-count it (AC6).
export const runtime = "nodejs";

const ISO_4217_RE = /^[A-Z]{3}$/;

export async function GET(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get("category"); // null = absent; "" = Other
  const month = url.searchParams.get("month");
  if (category === null || !month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  // WLT-27-5: scope to the active region so the drill total reconciles to the
  // budget row (getBudgetView uses the same default).
  const currencyParam = url.searchParams.get("currency");
  const currency = currencyParam && ISO_4217_RE.test(currencyParam) ? currencyParam : "USD";

  const result = await readCategoryTransactions(userId, category, month, currency);
  if (!result.ok) return Response.json({ error: "server" }, { status: 500 }); // → client renders the inline error (AC3)
  return Response.json({ items: result.items, total: result.total });
}
