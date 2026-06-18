import { getAal2UserId } from "@vc1023/passkey-2fa";
import { type CategoryKind, createCategory, readCategories } from "@/app/lib/categories";

// WLT-22-2 — the user's own categories. AAL2-gated + owner-scoped (RLS session
// inside the lib). GET = the set (seeded on first use from the user's distinct
// provider categories); POST = create a custom category. category_created is
// emitted server-side inside createCategory (once per create).
export const runtime = "nodejs";

export async function GET() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const categories = await readCategories(userId);
  return Response.json({ categories });
}

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; kind?: unknown } | null;
  if (!body || typeof body.name !== "string") return Response.json({ error: "invalid" }, { status: 400 });
  const kind: CategoryKind = body.kind === "essential" ? "essential" : "discretionary";

  const result = await createCategory(userId, body.name, kind);
  if (!result.ok) {
    const status = result.error === "save_failed" ? 502 : 400; // invalid / duplicate → 400
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ category: result.category });
}
