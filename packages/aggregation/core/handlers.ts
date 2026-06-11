// Request-tier factory — thin orchestration the route handlers delegate to
// (mirrors createPasskeyAuthHandlers). Does ONLY request-tier work: validate,
// re-derive ownership, vault put/get/delete, persist the connection row, and
// enqueue the heavy backfill (injected — core never imports @wealth/jobs). The
// 90-day fetch/ingest runs in Inngest, off the request path.

import {
  createServerSupabase,
  createServiceSupabase,
  inMemoryRateLimit,
  type RateLimiter,
} from "@vc1023/passkey-2fa";
import type { OnAggregationEvent } from "./events";
import type { ProviderRegistry } from "./registry";
import type { TokenVault } from "./vault";

/** Thrown when a per-user rate limit trips; routes map it to HTTP 429. */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate_limited");
    this.name = "RateLimitError";
  }
}

export interface AccountView {
  id: string;
  name: string;
  kind: string;
  mask: string | null;
  balanceCurrent: string | null;
  balanceAvailable: string | null;
  balanceUpdatedAt: string | null;
}

export interface ConnectionView {
  connectionId: string;
  provider: string;
  institutionName: string | null;
  healthStatus: string;
  lastSyncedAt: string | null;
  historySyncedAt: string | null;
  createdAt: string;
  accounts: AccountView[];
}

export interface AggregationHandlers {
  linkStart(input: { userId: string; redirectUri?: string }): Promise<{ clientToken: string; expiresAt: string }>;
  linkComplete(input: { userId: string; publicToken: string }): Promise<{ connectionId: string }>;
  connectionsList(input: { userId: string }): Promise<ConnectionView[]>;
  disconnect(input: { userId: string; connectionId: string }): Promise<{ ok: true }>;
}

export interface AggregationHandlerOptions {
  registry: ProviderRegistry;
  defaultProviderId: string;
  vault: TokenVault;
  /** Enqueue the durable backfill (app wires this to `inngest.send`). */
  enqueueBackfill: (input: { connectionId: string; userId: string }) => Promise<void>;
  onEvent?: OnAggregationEvent;
  /** Pluggable limiter (defaults to the in-memory one). Same seam as the passkey
   *  factory — inject a distributed limiter (Upstash) for multi-instance prod. */
  rateLimit?: RateLimiter;
}

// Coarse per-user throttle on the provider-facing flows (link/disconnect) — caps
// abuse/amplification against the upstream provider. Per-user (AAL2-gated, so the
// user is known); inject a distributed limiter for cross-instance enforcement.
const RL_LIMIT = 10;
const RL_WINDOW_MS = 5 * 60 * 1000;
async function throttle(limiter: RateLimiter, action: string, userId: string): Promise<void> {
  const res = await limiter(`agg:${action}:${userId}`, RL_LIMIT, RL_WINDOW_MS);
  if (!res.ok) throw new RateLimitError(res.retryAfterSeconds);
}

async function emit(onEvent: OnAggregationEvent | undefined, event: Parameters<OnAggregationEvent>[0]): Promise<void> {
  if (!onEvent) return;
  try {
    await onEvent(event);
  } catch {
    // best-effort — observability must never break the user path
  }
}

export function createAggregationHandlers(opts: AggregationHandlerOptions): AggregationHandlers {
  const { registry, defaultProviderId, vault, enqueueBackfill, onEvent } = opts;
  const limiter = opts.rateLimit ?? inMemoryRateLimit;

  return {
    async linkStart({ userId, redirectUri }) {
      await throttle(limiter, "link_start", userId);
      const provider = registry.get(defaultProviderId);
      const session = await provider.createLinkSession({ userId, redirectUri });
      return { clientToken: session.clientToken, expiresAt: session.expiresAt };
    },

    async linkComplete({ userId, publicToken }) {
      await throttle(limiter, "link_complete", userId);
      const provider = registry.get(defaultProviderId);
      const completion = await provider.completeLink({ publicToken, userId });
      // Token to Vault FIRST — only the opaque ref is ever persisted.
      const { ref } = await vault.put({ secret: completion.accessSecret });
      const svc = createServiceSupabase();
      const { data, error } = await svc
        .from("account_connections")
        .insert({
          user_id: userId,
          provider: provider.id,
          provider_connection_id: completion.providerConnectionId,
          vault_token_ref: ref,
          institution_id: completion.institution.id,
          institution_name: completion.institution.name,
          health_status: "active",
        })
        .select("id")
        .single();
      if (error || !data) {
        await vault.delete({ ref }).catch(() => {}); // no orphaned secret
        throw new Error(`[aggregation] linkComplete failed: ${error?.message ?? "no connection id"}`);
      }
      const connectionId = (data as { id: string }).id;
      // The backfill is the whole point — if it can't be enqueued (e.g. Inngest
      // misconfigured), roll the link back atomically rather than leaving an
      // orphaned, never-syncing connection (+ its vaulted token) behind.
      try {
        await enqueueBackfill({ connectionId, userId });
      } catch (e) {
        await svc.from("account_connections").delete().eq("id", connectionId).eq("user_id", userId);
        await vault.delete({ ref }).catch(() => {});
        throw new Error(`[aggregation] backfill enqueue failed (rolled back): ${(e as Error).message}`);
      }
      await emit(onEvent, { type: "connection_linked", userId, provider: provider.id });
      return { connectionId };
    },

    async connectionsList({ userId }) {
      // RLS-bound read: the owner-SELECT policy enforces tenant isolation by
      // default (defense-in-depth vs a service-role read with a manual filter).
      // The explicit user_id filter stays as belt-and-suspenders.
      const svc = await createServerSupabase();
      const [{ data: conns }, { data: accts }] = await Promise.all([
        svc
          .from("account_connections")
          .select("id, provider, institution_name, health_status, last_synced_at, history_synced_at, created_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        svc
          .from("financial_accounts")
          .select("id, connection_id, name, kind, mask, balance_current, balance_available, balance_updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null),
      ]);
      const byConn = new Map<string, AccountView[]>();
      for (const a of (accts ?? []) as Array<Record<string, unknown>>) {
        const cid = String(a.connection_id ?? "");
        const view: AccountView = {
          id: String(a.id),
          name: String(a.name),
          kind: String(a.kind),
          mask: (a.mask as string | null) ?? null,
          balanceCurrent: a.balance_current == null ? null : String(a.balance_current),
          balanceAvailable: a.balance_available == null ? null : String(a.balance_available),
          balanceUpdatedAt: (a.balance_updated_at as string | null) ?? null,
        };
        const list = byConn.get(cid) ?? [];
        list.push(view);
        byConn.set(cid, list);
      }
      return ((conns ?? []) as Array<Record<string, unknown>>).map((c) => ({
        connectionId: String(c.id),
        provider: String(c.provider),
        institutionName: (c.institution_name as string | null) ?? null,
        healthStatus: String(c.health_status),
        lastSyncedAt: (c.last_synced_at as string | null) ?? null,
        historySyncedAt: (c.history_synced_at as string | null) ?? null,
        createdAt: String(c.created_at),
        accounts: byConn.get(String(c.id)) ?? [],
      }));
    },

    async disconnect({ userId, connectionId }) {
      await throttle(limiter, "disconnect", userId);
      const svc = createServiceSupabase();
      // Ownership re-derivation: the row must belong to this user before any write.
      const { data: conn } = await svc
        .from("account_connections")
        .select("id, vault_token_ref, provider")
        .eq("id", connectionId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!conn) throw new Error("[aggregation] connection not found");
      const c = conn as { vault_token_ref: string; provider: string };

      // Revoke provider-side (best-effort), then destroy the token.
      try {
        const secret = await vault.get({ ref: c.vault_token_ref });
        await registry.get(c.provider).removeConnection({ accessSecret: secret });
      } catch {
        // already-revoked / unreachable provider — proceed to local teardown
      }
      await vault.delete({ ref: c.vault_token_ref }).catch(() => {});

      const now = new Date().toISOString();
      await svc.from("account_connections").update({ deleted_at: now, health_status: "disconnected" }).eq("id", connectionId).eq("user_id", userId);
      await svc.from("financial_accounts").update({ deleted_at: now }).eq("connection_id", connectionId).eq("user_id", userId);
      // Soft-delete this connection's transactions (audit trail preserved).
      const { data: accts } = await svc.from("financial_accounts").select("id").eq("connection_id", connectionId).eq("user_id", userId);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (accountIds.length) {
        await svc.from("transactions").update({ removed_at: now }).eq("user_id", userId).in("account_id", accountIds).is("removed_at", null);
      }
      await emit(onEvent, { type: "connection_removed", userId });
      return { ok: true };
    },
  };
}
