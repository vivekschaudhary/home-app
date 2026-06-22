import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WLT-24-1 AC5 (load-bearing guard) — a subscription is an OVERLAY orthogonal to
// category. The subscription read/compute must NEVER flow through the category
// resolver or the WLT-22-5 spending flag, or marking a subscription could leak
// into the budget/recap/anomaly numbers (a subscription is still real spend,
// counted there independently). This asserts the subscription path stays clean.
const ROOT = join(__dirname, "..", "..");
const SUBSCRIPTION_FILES = ["app/lib/subscriptions.ts", "packages/core/subscriptions.ts", "packages/db/subscriptions.ts"];
const FORBIDDEN = ["effectiveCategory", "readCategoryAssignments", "counts_as_spending", "countsAsSpending"];

describe("subscriptions orthogonality guard (AC5)", () => {
  for (const rel of SUBSCRIPTION_FILES) {
    it(`${rel} never touches the category/budget axis`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      for (const token of FORBIDDEN) {
        expect(src, `${rel} must not reference ${token} (orthogonality — AC5)`).not.toContain(token);
      }
    });
  }
});

// FIX-2026-06-22 (regression) — the Subscriptions view read MUST paginate the
// transactions, not build an `IN(dedup_keys)` over the flagged set: a large IN-list
// of long, URL-encoded dedup_keys overflows the request-URL limit and the query
// errors → the panel showed empty while the flags persisted. Pin the paged read.
describe("subscriptions view read stays paginated (FIX-2026-06-22 — empty-panel)", () => {
  const src = readFileSync(join(ROOT, "app/lib/subscriptions.ts"), "utf8");
  it("reads via readAllPaged, not an IN() over the flagged dedup_keys", () => {
    expect(src, "the marked-txn read must paginate (readAllPaged)").toContain("readAllPaged");
    expect(src, "must not read the marked txns via .in(dedup_key, …) — the URL overflows past enough marks").not.toContain('.in("dedup_key"');
  });
});

// WLT-24-2 — the detector lives in @wealth/core and MUST stay pure (no I/O): the DB
// write path (@wealth/db) reads + runs it, the app layer orchestrates. If the core
// detector reached into the DB it would couple the pure compute to a client and
// break unit-testability (and could smuggle the category axis back in). Pin purity.
describe("the core subscription detector stays pure (WLT-24-2)", () => {
  const src = readFileSync(join(ROOT, "packages/core/subscriptions.ts"), "utf8");
  it("packages/core/subscriptions.ts imports no DB / Supabase client", () => {
    expect(src, "the pure detector must not import @wealth/db").not.toContain("@wealth/db");
    expect(src, "the pure detector must not import a Supabase client").not.toContain("supabase");
  });
});
