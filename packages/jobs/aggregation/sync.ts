// Durable initial backfill — fires on `aggregation/connection.linked` (enqueued
// by the linkComplete handler). Off the request path. Each provider call reads
// the access secret from the Vault INSIDE its step (never returned/logged), then
// fetches accounts + pages transactions into the idempotent ingest. The cursor is
// persisted only AFTER a page ingests, so a mid-sync failure re-ingests
// (dedup-safe) rather than dropping rows. Provider-neutral: routes by the stored
// `account_connections.provider`.

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { createProviderRegistry, ingestTransactions } from "@wealth/aggregation";
import { createPlaidProvider } from "@wealth/aggregation/plaid";
import { createSupabaseVault } from "@wealth/aggregation/vault";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";
import { inngest } from "../client";

export const CONNECTION_LINKED_EVENT = "aggregation/connection.linked";

const registry = createProviderRegistry([createPlaidProvider()]);
const vault = createSupabaseVault();

export const aggregationBackfill = inngest.createFunction(
  { id: "aggregation-initial-backfill", retries: 3 },
  { event: CONNECTION_LINKED_EVENT },
  async ({ event, step }) => {
    const { connectionId, userId } = event.data as { connectionId: string; userId: string };

    const conn = await step.run("load-connection", async () => {
      const svc = createServiceSupabase();
      const { data, error } = await svc
        .from("account_connections")
        .select("id, provider, vault_token_ref")
        .eq("id", connectionId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) throw new Error(`[backfill] connection ${connectionId} not found`);
      return data as { provider: string; vault_token_ref: string };
    });

    const provider = registry.get(conn.provider);

    // Accounts first — backfill needs the providerAccountId → our id map.
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
        if (error) throw new Error(`[backfill] upsert accounts failed: ${error.message}`);
      }
      const { data: saved } = await svc
        .from("financial_accounts")
        .select("id, provider_account_id")
        .eq("connection_id", connectionId)
        .eq("user_id", userId);
      return (saved ?? []) as Array<{ id: string; provider_account_id: string }>;
    });

    const accMap = new Map(accounts.map((a) => [a.provider_account_id, a.id]));

    // Page the cursor delta until drained. Each page is its own retriable step.
    let cursor: string | null = null;
    let hasMore = true;
    let page = 0;
    let totalInserted = 0;
    while (hasMore && page < 50) {
      page += 1;
      const result: { inserted: number; nextCursor: string | null; hasMore: boolean } =
        await step.run(`sync-page-${page}`, async () => {
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
        });
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
  },
);
