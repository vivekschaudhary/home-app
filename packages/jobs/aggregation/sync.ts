// Durable aggregation sync — off the request path. Three triggers, one core:
//   • connection.linked  → initial backfill (cursor=null)            [WLT-9]
//   • connection.refresh → incremental from the stored cursor        [WLT-10]
//   • cron (every 6h)    → fan-out refresh over active connections   [WLT-10 fallback]
// Each provider call reads the access secret from the Vault INSIDE its step
// (never returned/logged). The cursor is persisted only AFTER a page ingests, so
// a mid-sync failure re-ingests (dedup-safe). Provider-neutral via the stored
// `account_connections.provider`.

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { createProviderRegistry, ingestTransactions } from "@wealth/aggregation";
import { createPlaidProvider } from "@wealth/aggregation/plaid";
import { createSupabaseVault } from "@wealth/aggregation/vault";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { inngest } from "../client";

export const CONNECTION_LINKED_EVENT = "aggregation/connection.linked";
export const CONNECTION_REFRESH_EVENT = "aggregation/connection.refresh";

const registry = createProviderRegistry([createPlaidProvider()]);
const vault = createSupabaseVault();

/** Structural subset of the Inngest step API we use (avoids importing its type). */
type StepRunner = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };

// The shared sync core. `useStoredCursor=false` → backfill from null; `true` →
// incremental refresh continuing from the connection's persisted cursor.
async function syncConnection(
  input: { connectionId: string; userId: string; useStoredCursor: boolean },
  step: StepRunner,
): Promise<{ connectionId: string; accounts: number; transactions: number }> {
  const { connectionId, userId, useStoredCursor } = input;

  const conn = await step.run("load-connection", async () => {
    const svc = createServiceSupabase();
    const { data, error } = await svc
      .from("account_connections")
      .select("id, provider, vault_token_ref, sync_cursor")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) throw new Error(`[sync] connection ${connectionId} not found`);
    return data as { provider: string; vault_token_ref: string; sync_cursor: string | null };
  });

  const provider = registry.get(conn.provider);

  // Accounts (+ fresh balances) — also gives the providerAccountId → our-id map.
  const accounts = await step.run("fetch-accounts", async () => {
    const svc = createServiceSupabase();
    const secret = await vault.get({ ref: conn.vault_token_ref });
    const accts = await provider.fetchAccounts({ accessSecret: secret });
    const rows = accts.map((a) => ({
      user_id: userId,
      connection_id: connectionId,
      provider_account_id: a.providerAccountId,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      balance_current: a.balanceCurrent,
      balance_available: a.balanceAvailable,
      balance_updated_at: new Date().toISOString(),
      mask: a.mask,
    }));
    if (rows.length) {
      const { error } = await svc
        .from("financial_accounts")
        .upsert(rows, { onConflict: "connection_id,provider_account_id" });
      if (error) throw new Error(`[sync] upsert accounts failed: ${error.message}`);
    }
    const { data: saved } = await svc
      .from("financial_accounts")
      .select("id, provider_account_id")
      .eq("connection_id", connectionId)
      .eq("user_id", userId);
    return (saved ?? []) as Array<{ id: string; provider_account_id: string }>;
  });

  const accMap = new Map(accounts.map((a) => [a.provider_account_id, a.id]));

  let cursor: string | null = useStoredCursor ? conn.sync_cursor : null;
  let hasMore = true;
  let page = 0;
  let totalInserted = 0;
  while (hasMore && page < 50) {
    page += 1;
    const result: { inserted: number; nextCursor: string | null; hasMore: boolean } = await step.run(
      `sync-page-${page}`,
      async () => {
        const svc = createServiceSupabase();
        const secret = await vault.get({ ref: conn.vault_token_ref });
        const delta = await provider.fetchTransactions({ accessSecret: secret, cursor });
        const ingest = await ingestTransactions({
          userId,
          page: delta,
          accountIdByProviderAccountId: accMap,
          svc,
        });
        // Persist the cursor AFTER the rows land (re-ingest on failure is dedup-safe).
        await svc
          .from("account_connections")
          .update({ sync_cursor: delta.nextCursor, last_synced_at: new Date().toISOString() })
          .eq("id", connectionId);
        return { inserted: ingest.inserted, nextCursor: delta.nextCursor, hasMore: delta.hasMore };
      },
    );
    cursor = result.nextCursor;
    hasMore = result.hasMore;
    totalInserted += result.inserted;
  }

  await step.run("emit-sync-completed", async () => {
    await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_SYNCED, userId, {
      connectionId,
      accounts: accounts.length,
      transactions: totalInserted,
    });
  });

  return { connectionId, accounts: accounts.length, transactions: totalInserted };
}

// Initial backfill (WLT-9) — fires when a connection is linked.
export const aggregationBackfill = inngest.createFunction(
  { id: "aggregation-initial-backfill", retries: 3 },
  { event: CONNECTION_LINKED_EVENT },
  async ({ event, step }) => {
    const { connectionId, userId } = event.data as { connectionId: string; userId: string };
    return syncConnection({ connectionId, userId, useStoredCursor: false }, step as unknown as StepRunner);
  },
);

// Incremental refresh (WLT-10) — fires from the Plaid webhook + the cron. Resumes
// from the stored cursor, so the async historical pull + ongoing updates land.
export const aggregationRefresh = inngest.createFunction(
  { id: "aggregation-refresh", retries: 3 },
  { event: CONNECTION_REFRESH_EVENT },
  async ({ event, step }) => {
    const { connectionId, userId } = event.data as { connectionId: string; userId: string };
    return syncConnection({ connectionId, userId, useStoredCursor: true }, step as unknown as StepRunner);
  },
);

// Polling fallback (WLT-10) — covers missed/late webhooks so the full history
// still completes + data stays fresh. Skips needs_reauth/error/soft-deleted.
export const aggregationScheduledRefresh = inngest.createFunction(
  { id: "aggregation-scheduled-refresh" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const conns = await step.run("list-active", async () => {
      const svc = createServiceSupabase();
      const { data } = await svc
        .from("account_connections")
        .select("id, user_id")
        .eq("health_status", "active")
        .is("deleted_at", null);
      return (data ?? []) as Array<{ id: string; user_id: string }>;
    });
    if (conns.length) {
      await step.sendEvent(
        "fan-out-refresh",
        conns.map((c) => ({
          name: CONNECTION_REFRESH_EVENT,
          data: { connectionId: c.id, userId: c.user_id },
        })),
      );
    }
    return { fannedOut: conns.length };
  },
);
