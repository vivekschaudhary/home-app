import { type AggregationEvent, createAggregationHandlers, createProviderRegistry } from "@wealth/aggregation";
import { createPlaidProvider } from "@wealth/aggregation/plaid";
import { createSupabaseVault } from "@wealth/aggregation/vault";
import { AUDIT_ACTIONS, FUNNEL_EVENTS } from "@wealth/core";
import { emitAudit, emitFunnel } from "@wealth/db/emit";
import { CONNECTION_LINKED_EVENT, inngest } from "@wealth/jobs";

// App composition root for aggregation (mirrors app/lib/auth.ts). Picks the
// concrete impls behind each seam — Plaid provider, Supabase Vault, Inngest
// backfill — and maps the package's lifecycle events onto this app's audit +
// WLT-5 funnel contract. Swap any seam here with no ripple into the package.
async function onEvent(e: AggregationEvent): Promise<void> {
  switch (e.type) {
    case "connection_linked":
      await emitAudit(AUDIT_ACTIONS.AGGREGATION_CONNECT, e.userId, { provider: e.provider });
      await emitFunnel(FUNNEL_EVENTS.ACCOUNT_LINKED, e.userId);
      break;
    case "connection_removed":
      await emitAudit(AUDIT_ACTIONS.AGGREGATION_DISCONNECT, e.userId);
      await emitFunnel(FUNNEL_EVENTS.ACCOUNT_DISCONNECTED, e.userId);
      break;
    case "connection_error":
      await emitFunnel(FUNNEL_EVENTS.CONNECTION_ERROR, e.userId, { code: e.code });
      break;
    case "transactions_ingested":
    case "sync_completed":
      // sync_completed is emitted from the Inngest job (off the request path).
      break;
  }
}

export const handlers = createAggregationHandlers({
  registry: createProviderRegistry([createPlaidProvider()]),
  defaultProviderId: "plaid",
  vault: createSupabaseVault(),
  enqueueBackfill: async ({ connectionId, userId }) => {
    await inngest.send({ name: CONNECTION_LINKED_EVENT, data: { connectionId, userId } });
  },
  onEvent,
});
