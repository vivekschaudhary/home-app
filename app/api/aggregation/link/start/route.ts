import { getAal2UserId, tooManyRequests } from "@vc1023/passkey-2fa";
import { RateLimitError } from "@wealth/aggregation";
import { handlers } from "@/app/lib/aggregation";

// Create a provider link session (Plaid link_token). AAL2-gated — connecting a
// bank requires a fully-authenticated (second-factor) session.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const session = await handlers.linkStart({ userId });
    return Response.json(session);
  } catch (e) {
    if (e instanceof RateLimitError) return tooManyRequests(e.retryAfterSeconds);
    return Response.json({ error: "link_start_failed" }, { status: 502 });
  }
}
