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
import { applyAllRulesForUser, autoAssignTransfersForUser } from "@wealth/db/categories";
import { emitFunnel } from "@wealth/db/emit";
import { inngest } from "../client";
import { settleHistory } from "./settle";

export const CONNECTION_LINKED_EVENT = "aggregation/connection.linked";
export const CONNECTION_REFRESH_EVENT = "aggregation/connection.refresh";

const registry = createProviderRegistry([createPlaidProvider()]);
const vault = createSupabaseVault();

/** Structural subset of the Inngest step API we use (avoids importing its type). */
type StepRunner = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (id: string, duration: string) => Promise<unknown>;
};

// The shared sync core. `useStoredCursor=false` → backfill from null; `true` →
// incremental refresh continuing from the connection's persisted cursor. Any
// connection whose `history_synced_at` is still null is treated as importing:
// after the drain we re-sync until activity STABILIZES (consecutive quiet passes)
// and only then stamp history_synced_at — the real "import done" signal the UI
// derives "Importing…" from (not a clock, not a single quiet pass).
async function syncConnection(
  input: { connectionId: string; userId: string; useStoredCursor: boolean },
  step: StepRunner,
): Promise<{ connectionId: string; accounts: number; transactions: number }> {
  const { connectionId, userId, useStoredCursor } = input;

  const conn = await step.run("load-connection", async () => {
    const svc = createServiceSupabase();
    const { data, error } = await svc
      .from("account_connections")
      .select("id, provider, vault_token_ref, sync_cursor, history_synced_at")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) throw new Error(`[sync] connection ${connectionId} not found`);
    return data as {
      provider: string;
      vault_token_ref: string;
      sync_cursor: string | null;
      history_synced_at: string | null;
    };
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

  // Stabilization gate: a connection stays "importing" until its history settles.
  // While history_synced_at is null, re-sync (with waits) until activity stays
  // quiet for CONSECUTIVE passes — real stabilization, not one transient quiet
  // pass — and only then stamp. Applies to the backfill AND any refresh on a
  // not-yet-settled connection (the backstop that settles one whose backfill
  // capped while Plaid was still streaming).
  if (conn.history_synced_at === null) {
    const stabilized = await settleHistory(
      async (s) => {
        const r: { inserted: number; nextCursor: string | null } = await step.run(`settle-sync-${s}`, async () => {
          const svc = createServiceSupabase();
          const secret = await vault.get({ ref: conn.vault_token_ref });
          const delta = await provider.fetchTransactions({ accessSecret: secret, cursor });
          const ingest = await ingestTransactions({ userId, page: delta, accountIdByProviderAccountId: accMap, svc });
          await svc
            .from("account_connections")
            .update({ sync_cursor: delta.nextCursor, last_synced_at: new Date().toISOString() })
            .eq("id", connectionId);
          return { inserted: ingest.inserted, nextCursor: delta.nextCursor };
        });
        cursor = r.nextCursor; // outside the step → replay-safe
        totalInserted += r.inserted;
        return r.inserted;
      },
      (s) => step.sleep(`settle-wait-${s}`, "45s"),
      6, // up to ~4.5 min of re-syncs
      2, // require 2 consecutive quiet passes (~90s stable) before settling
    );
    if (stabilized) {
      await step.run("mark-history-synced", async () => {
        const svc = createServiceSupabase();
        // Idempotent: stamp once, the first time activity genuinely stabilizes.
        await svc
          .from("account_connections")
          .update({ history_synced_at: new Date().toISOString() })
          .is("history_synced_at", null)
          .eq("id", connectionId);
      });
    }
  }

  // WLT-22-3 — apply the user's "remember the merchant" rules to the freshly-
  // synced transactions (the future half of past+future). Idempotent + a cheap
  // no-op for a user with no rules; runs once after the history is in.
  await step.run("apply-category-rules", async () => {
    const svc = createServiceSupabase();
    await applyAllRulesForUser(svc, userId);
  });

  // WLT-22-5 — route freshly-synced transfers/payments to the protected
  // "Transfers & Payments" category so they don't inflate spending. A no-op until
  // the user's protected category is seeded (first /budget load); never clobbers a
  // 'user'/'rule' assignment. Runs after rules so a merchant rule wins on overlap.
  await step.run("auto-assign-transfers", async () => {
    const svc = createServiceSupabase();
    await autoAssignTransfersForUser(svc, userId);
  });

  await step.run("emit-sync-completed", async () => {
    await emitFunnel(FUNNEL_EVENTS.TRANSACTIONS_SYNCED, userId, {
      connectionId,
      accounts: accounts.length,
      transactions: totalInserted,
    });
  });

  return { connectionId, accounts: accounts.length, transactions: totalInserted };
}

// Initial backfill (WLT-9 + WLT-10) — fires when a connection is linked. Settles
// the 24-month history then stamps history_synced_at. On final failure → error,
// so the connection doesn't sit "Importing…" forever.
export const aggregationBackfill = inngest.createFunction(
  {
    id: "aggregation-initial-backfill",
    retries: 3,
    onFailure: async ({ event, step }) => {
      const original = (event as { data: { event: { data: { connectionId: string; userId: string } } } }).data.event;
      const { connectionId, userId } = original.data;
      await step.run("mark-connection-error", async () => {
        const svc = createServiceSupabase();
        await svc.from("account_connections").update({ health_status: "error" }).eq("id", connectionId);
        await emitFunnel(FUNNEL_EVENTS.CONNECTION_ERROR, userId, { connectionId, reason: "backfill_failed" });
      });
    },
  },
  { event: CONNECTION_LINKED_EVENT },
  async ({ event, step }) => {
    const { connectionId, userId } = event.data as { connectionId: string; userId: string };
    return syncConnection({ connectionId, userId, useStoredCursor: false }, step as unknown as StepRunner);
  },
);

// Incremental refresh (WLT-10) — fires from the Plaid webhook + the cron. Resumes
// from the stored cursor, so the async historical pull + ongoing updates land.
// `debounce` collapses duplicate/replayed deliveries for the same connection into
// ONE effect (AC2/AC3). On final failure, the connection transitions to `error`
// with a funnel signal (AC9/AC10).
export const aggregationRefresh = inngest.createFunction(
  {
    id: "aggregation-refresh",
    retries: 3,
    debounce: { key: "event.data.connectionId", period: "30s" },
    onFailure: async ({ event, step }) => {
      const original = (event as { data: { event: { data: { connectionId: string; userId: string } } } }).data.event;
      const { connectionId, userId } = original.data;
      await step.run("mark-connection-error", async () => {
        const svc = createServiceSupabase();
        await svc.from("account_connections").update({ health_status: "error" }).eq("id", connectionId);
        await emitFunnel(FUNNEL_EVENTS.CONNECTION_ERROR, userId, { connectionId, reason: "refresh_failed" });
      });
    },
  },
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

// Quiescence settle-sweep (#39) — the backfill's stabilization loop is the
// PRIMARY path to history_synced_at, but it caps after ~4.5 min; a real
// multi-account import can keep streaming past that, stamp nothing, and then
// sit "Importing…" until a webhook (silent once settled) or the 6h refresh —
// hours of a false state. This frequent, provider-free sweep closes the gap: a
// connection that has SYNCED but seen ZERO new activity for QUIET_MINUTES has
// demonstrably settled (no data is arriving) → stamp it. Sustained inactivity
// IS a stabilization signal — it's measuring quiet, not a clock from creation.
const QUIET_MINUTES = 5;
export const aggregationSettleSweep = inngest.createFunction(
  { id: "aggregation-settle-sweep" },
  { cron: "*/10 * * * *" },
  async ({ step }) => {
    const stamped = await step.run("stamp-quiesced", async () => {
      const svc = createServiceSupabase();
      const cutoff = new Date(Date.now() - QUIET_MINUTES * 60 * 1000).toISOString();
      const { data } = await svc
        .from("account_connections")
        .update({ history_synced_at: new Date().toISOString() })
        .eq("health_status", "active") // not needs_reauth/error/disconnected
        .is("history_synced_at", null) // only the not-yet-settled
        .is("deleted_at", null)
        .not("last_synced_at", "is", null) // must have actually synced (not a never-ran backfill)
        .lt("last_synced_at", cutoff) // …and gone quiet for ≥ QUIET_MINUTES
        .select("id");
      return data?.length ?? 0;
    });
    return { stamped };
  },
);
