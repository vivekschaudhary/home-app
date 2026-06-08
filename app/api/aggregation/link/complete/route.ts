import { getAal2UserId, tooManyRequests } from "@vc1023/passkey-2fa";
import { RateLimitError } from "@wealth/aggregation";
import { handlers } from "@/app/lib/aggregation";

// Exchange the client public artifact for the durable grant, vault it, persist
// the connection, and enqueue the backfill. AAL2-gated.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { publicToken?: unknown };
  try {
    body = (await req.json()) as { publicToken?: unknown };
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.publicToken !== "string" || !body.publicToken) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await handlers.linkComplete({ userId, publicToken: body.publicToken });
    return Response.json(result);
  } catch (e) {
    if (e instanceof RateLimitError) return tooManyRequests(e.retryAfterSeconds);
    return Response.json({ error: "link_complete_failed" }, { status: 502 });
  }
}
