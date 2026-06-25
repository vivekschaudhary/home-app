import { getAal2UserId } from "@vc1023/passkey-2fa";
import { CONNECTION_REFRESH_EVENT, inngest } from "@wealth/jobs";
import { handlers } from "@/app/lib/aggregation";

// Triggers an incremental balance + transaction refresh for all active
// connections. Called by the accounts page on mount so displayed balances are
// always fresh (not just as-of the last webhook or 6-hour cron). Inngest
// debounces duplicate sends per connection (30 s window), collapsing rapid
// navigations into a single sync.
export const runtime = "nodejs";

export async function POST() {
  const userId = await getAal2UserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const connections = await handlers.connectionsList({ userId });
  const active = connections.filter((c) => c.healthStatus === "active");

  if (active.length === 0) return Response.json({ triggered: 0 });

  await inngest.send(
    active.map((c) => ({
      name: CONNECTION_REFRESH_EVENT,
      data: { connectionId: c.connectionId, userId },
    })),
  );

  return Response.json({ triggered: active.length });
}
