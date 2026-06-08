import { describe, expect, it } from "vitest";
import { type AggregationHandlerOptions, RateLimitError, createAggregationHandlers } from "./handlers";
import type { AggregationProvider } from "./provider";
import { createProviderRegistry } from "./registry";
import type { TokenVault } from "./vault";

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
});
