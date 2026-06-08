import { describe, expect, it, vi } from "vitest";
import { type AggregationHandlerOptions, RateLimitError, createAggregationHandlers } from "./handlers";
import type { AggregationProvider } from "./provider";
import { createProviderRegistry } from "./registry";
import type { TokenVault } from "./vault";

// Stub the Supabase clients linkComplete uses (insert + the rollback delete).
vi.mock("@vc1023/passkey-2fa", () => ({
  createServiceSupabase: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "conn1" }, error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
  createServerSupabase: async () => ({}),
  inMemoryRateLimit: () => ({ ok: true, retryAfterSeconds: 0 }),
}));

// FakeProvider — proves the seam without Plaid (architecture test strategy).
const fakeProvider: AggregationProvider = {
  id: "fake",
  createLinkSession: async () => ({ clientToken: "tok", expiresAt: "2026-06-08T00:00:00Z" }),
  completeLink: async () => ({ providerConnectionId: "c1", accessSecret: "s", institution: { id: null, name: null } }),
  fetchAccounts: async () => [],
  fetchTransactions: async () => ({ added: [], modified: [], removed: [], nextCursor: null, hasMore: false }),
  getConnectionStatus: async () => "active",
  removeConnection: async () => {},
};

const fakeVault: TokenVault = {
  put: async () => ({ ref: "ref" }),
  get: async () => "secret",
  delete: async () => {},
};

function build(rateLimit: AggregationHandlerOptions["rateLimit"]) {
  return createAggregationHandlers({
    registry: createProviderRegistry([fakeProvider]),
    defaultProviderId: "fake",
    vault: fakeVault,
    enqueueBackfill: async () => {},
    rateLimit,
  });
}

describe("createAggregationHandlers", () => {
  it("linkStart returns the provider session through the seam (FakeProvider)", async () => {
    const handlers = build(() => ({ ok: true, retryAfterSeconds: 0 }));
    const res = await handlers.linkStart({ userId: "u1" });
    expect(res.clientToken).toBe("tok");
  });

  it("throws RateLimitError when the limiter denies (linkStart)", async () => {
    const handlers = build(() => ({ ok: false, retryAfterSeconds: 42 }));
    await expect(handlers.linkStart({ userId: "u1" })).rejects.toBeInstanceOf(RateLimitError);
  });

  it("linkComplete rolls back the connection + vault when the backfill enqueue fails", async () => {
    const vaultDelete = vi.fn(async () => {});
    const handlers = createAggregationHandlers({
      registry: createProviderRegistry([fakeProvider]),
      defaultProviderId: "fake",
      vault: { put: async () => ({ ref: "ref" }), get: async () => "s", delete: vaultDelete },
      enqueueBackfill: async () => {
        throw new Error("inngest down");
      },
      rateLimit: () => ({ ok: true, retryAfterSeconds: 0 }),
    });
    await expect(handlers.linkComplete({ userId: "u1", publicToken: "pt" })).rejects.toThrow(/rolled back/i);
    expect(vaultDelete).toHaveBeenCalledWith({ ref: "ref" }); // no orphaned token
  });
});
