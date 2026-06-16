import { getAal2UserId } from "@vc1023/passkey-2fa";
import { clearBudgetForUser, getBudgetView, saveBudgetForUser } from "@/app/lib/budget";

// The Budget & Spending data API (WLT-21-1). AAL2-gated + owner-scoped (RLS
// session inside the lib functions). GET = reconcile-on-mount; POST = set/update
// a category budget; DELETE = clear one.
export const runtime = "nodejs";

export async function GET() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const view = await getBudgetView(userId);
  return Response.json(view);
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { category?: unknown; limitAmount?: unknown; limitPercent?: unknown }
    | null;
  if (!body || typeof body.category !== "string") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const limitAmount = typeof body.limitAmount === "number" ? body.limitAmount : null;
  const limitPercent = typeof body.limitPercent === "number" ? body.limitPercent : null;

  const result = await saveBudgetForUser({ userId, category: body.category, limitAmount, limitPercent });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const category = new URL(req.url).searchParams.get("category");
  if (!category) return Response.json({ error: "invalid" }, { status: 400 });

  const result = await clearBudgetForUser({ userId, category });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid" ? 400 : 502 });
  }
  return Response.json({ ok: true });
}
