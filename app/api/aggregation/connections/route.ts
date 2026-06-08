import { getAal2UserId } from "@vc1023/passkey-2fa";
import { handlers } from "@/app/lib/aggregation";

// The user's connected accounts (institutions + accounts + sync status). AAL2-gated.
export const runtime = "nodejs";

export async function GET() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const connections = await handlers.connectionsList({ userId });
  return Response.json({ connections });
}
