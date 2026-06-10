import { getAal2UserId } from "@vc1023/passkey-2fa";
import { declareIntent } from "@/app/lib/intent";

// Declare an intent. AAL2-gated to match the app shell (the user is AAL2 after
// sign-in); the data is owner-scoped + low-sensitivity, but we keep one posture.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { cluster?: unknown; intentKey?: unknown } | null;
  if (!body || typeof body.cluster !== "string" || typeof body.intentKey !== "string") {
    return Response.json({ error: "invalid_intent" }, { status: 400 });
  }

  const result = await declareIntent({ userId, cluster: body.cluster, intentKey: body.intentKey });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.error === "invalid_intent" ? 400 : 502 });
  }
  return Response.json({ ok: true, goalId: result.goalId });
}
