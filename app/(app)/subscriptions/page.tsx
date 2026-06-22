import { requireAal2 } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { readSubscriptionsView } from "@/app/lib/subscriptions";
import { COPY } from "@/app/lib/copy";
import { SubscriptionsClient } from "./SubscriptionsClient";

// WLT-24-1 — Subscriptions, mounted live into the shell (nav flips to 'live').
// Reconcile-on-load (force-dynamic) — never stale props (#36). The COMPUTE is
// pure in @wealth/core; this RSC reads the marked transactions (owner-scoped) and
// emits subscriptions_viewed once per visit.
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const userId = await requireAal2();
  const view = await readSubscriptionsView(userId);
  await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTIONS_VIEWED, userId, {});

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">{COPY.subscriptions.title}</h1>
      <p className="mt-1 text-sm text-gray-600">{COPY.subscriptions.subtitle}</p>
      <SubscriptionsClient initial={view} />
    </div>
  );
}
