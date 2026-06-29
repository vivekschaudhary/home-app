import { describe, expect, it } from "vitest";
import { contentHash, dedupKey } from "./dedup";
import type { NormalizedTransaction } from "./types";

const base: NormalizedTransaction = {
  providerTransactionId: "txn_1",
  providerAccountId: "acc_1" as string | null,
  amount: "12.34",
  direction: "debit",
  currency: "USD",
  description: "Coffee",
  merchant: "Cafe",
  category: "Food",
  kind: "spend",
  occurredOn: "2026-06-01",
  pending: false,
  source: "plaid",
};

describe("dedupKey", () => {
  it("is source:account:providerTxnId for provider rows", () => {
    expect(dedupKey(base)).toBe("plaid:acc_1:txn_1");
  });

  it("is STABLE across content revisions (same logical txn)", () => {
    // amount + description changed (a `modified` revision) — identity must hold.
    expect(dedupKey({ ...base, amount: "99.99", description: "changed" })).toBe(dedupKey(base));
  });

  it("synthesizes a deterministic content-based key when there is no provider id (CSV)", () => {
    const csv = { ...base, providerTransactionId: null, source: "csv" };
    const k = dedupKey(csv);
    expect(k.startsWith("csv:acc_1:")).toBe(true);
    expect(dedupKey({ ...csv })).toBe(k); // deterministic
    expect(dedupKey({ ...csv, amount: "0.01" })).not.toBe(k); // amount is part of identity for CSV
  });

  // WLT-27-3 regression: null providerAccountId → 'manual' segment, never 'null'.
  it("uses 'manual' as the account segment when providerAccountId is null (CSV/manual source)", () => {
    const csv = { ...base, providerTransactionId: null, providerAccountId: null, source: "csv" };
    const k = dedupKey(csv);
    expect(k.startsWith("csv:manual:")).toBe(true);
    expect(k).not.toContain(":null:");
    expect(dedupKey({ ...csv })).toBe(k); // deterministic across re-imports
  });

  // WLT-27-3 AC-13: Plaid rows with non-null providerAccountId are unchanged (fix is a no-op).
  it("WLT-27-3 Plaid regression: non-null providerAccountId still produces the original key (AC-13)", () => {
    // regression: true — before the fix, key was source:providerAccountId:providerTransactionId.
    // After the fix, ?? 'manual' never fires when providerAccountId is non-null.
    expect(dedupKey(base)).toBe("plaid:acc_1:txn_1");
  });
});

describe("contentHash", () => {
  it("is identical for an unchanged replay (⇒ ingest no-op)", () => {
    expect(contentHash({ ...base })).toBe(contentHash(base));
  });

  it("changes when any mutable field changes (⇒ a real revision row)", () => {
    expect(contentHash({ ...base, amount: "99.99" })).not.toBe(contentHash(base));
    expect(contentHash({ ...base, pending: true })).not.toBe(contentHash(base));
    expect(contentHash({ ...base, description: "x" })).not.toBe(contentHash(base));
    expect(contentHash({ ...base, merchant: null })).not.toBe(contentHash(base));
  });
});
