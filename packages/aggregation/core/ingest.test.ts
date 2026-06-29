import { describe, expect, it } from "vitest";
import { ingestTransactions } from "./ingest";
import type { FetchTransactionsPage } from "./provider";
import type { NormalizedTransaction } from "./types";

// Minimal fake of the supabase-js surface ingest touches: a unique-key-aware
// upsert (the DB's (user_id, dedup_key, content_hash) constraint, in memory) +
// thenable filter chains for the modified/removed paths.
function makeFakeSvc() {
  const seen = new Set<string>();
  function chain(result: unknown) {
    const c = {
      eq: () => c,
      neq: () => c,
      is: () => c,
      in: () => c,
      limit: () => c,
      order: () => c,
      select: () => c,
      maybeSingle: () => Promise.resolve({ data: result, error: null }),
      then: (res: (v: { data: unknown; error: null }) => void) => res({ data: result, error: null }),
    };
    return c;
  }
  return {
    from() {
      return {
        upsert(rows: Array<{ user_id: string; dedup_key: string; content_hash: string }>) {
          const inserted: Array<{ id: string }> = [];
          for (const r of rows) {
            const k = `${r.user_id}|${r.dedup_key}|${r.content_hash}`;
            if (!seen.has(k)) {
              seen.add(k);
              inserted.push({ id: `id_${seen.size}` });
            }
          }
          return { select: () => Promise.resolve({ data: inserted, error: null }) };
        },
        select: () => chain(null),
        update: () => chain(null),
      };
    },
  };
}

const txn = (id: string): NormalizedTransaction => ({
  providerTransactionId: id,
  providerAccountId: "acc_1",
  amount: "10.00",
  direction: "debit",
  currency: "USD",
  description: "x",
  merchant: null,
  category: null,
  kind: "spend",
  occurredOn: "2026-06-01",
  pending: false,
  source: "plaid",
});

const page = (added: NormalizedTransaction[]): FetchTransactionsPage => ({
  added,
  modified: [],
  removed: [],
  nextCursor: "c1",
  hasMore: false,
});

describe("ingestTransactions", () => {
  it("inserts new rows once; an identical replay is a no-op (idempotent)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = makeFakeSvc() as any;
    const accMap = new Map([["acc_1", "fa_1"]]);
    const p = page([txn("t1"), txn("t2")]);

    const first = await ingestTransactions({ userId: "u1", page: p, accountIdByProviderAccountId: accMap, svc });
    expect(first.inserted).toBe(2);

    const replay = await ingestTransactions({ userId: "u1", page: p, accountIdByProviderAccountId: accMap, svc });
    expect(replay.inserted).toBe(0);
  });

  it("skips transactions whose provider account isn't resolved", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = makeFakeSvc() as any;
    const res = await ingestTransactions({
      userId: "u1",
      page: page([txn("t1")]),
      accountIdByProviderAccountId: new Map(), // unresolved
      svc,
    });
    expect(res.inserted).toBe(0);
  });

  // WLT-27-3 AC-3: null providerAccountId (CSV rows) → looks up 'manual' in the map.
  it("routes CSV rows (providerAccountId=null) via the 'manual' map key (AC-3)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = makeFakeSvc() as any;
    const csvTxn: NormalizedTransaction = {
      providerTransactionId: null,
      providerAccountId: null,
      amount: "15.00",
      direction: "debit",
      currency: "USD",
      description: "Coffee Shop",
      merchant: null,
      category: "Food",
      kind: "spend",
      occurredOn: "2026-06-01",
      pending: false,
      source: "csv",
    };

    // Map key is 'manual' — the fix in ingest.ts (providerAccountId ?? 'manual').
    const res = await ingestTransactions({
      userId: "u1",
      page: page([csvTxn]),
      accountIdByProviderAccountId: new Map([["manual", "fa_csv_1"]]),
      svc,
    });
    expect(res.inserted).toBe(1);
  });

  // WLT-27-3 AC-3 regression: Plaid rows with non-null providerAccountId still
  // resolve correctly after the ?? 'manual' change (fix is a no-op for Plaid).
  it("WLT-27-3 Plaid regression: non-null providerAccountId still resolves via the existing map key (AC-3)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = makeFakeSvc() as any;
    const accMap = new Map([["acc_1", "fa_1"]]);
    const res = await ingestTransactions({
      userId: "u1",
      page: page([txn("t1")]),
      accountIdByProviderAccountId: accMap,
      svc,
    });
    expect(res.inserted).toBe(1);
  });
});
