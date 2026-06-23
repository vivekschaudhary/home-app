import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WLT-25-1 (orthogonality, the load-bearing invariant) — a follow-up is an OVERLAY
// orthogonal to BOTH category and subscription. The follow-up read/write must NEVER
// flow through the category resolver or the budget/spend flags, or flagging a charge
// could leak into the budget/recap numbers. This pins the follow-up path clean
// (mirrors subscriptions.guard.test.ts).
const ROOT = join(__dirname, "..", "..");
const FOLLOWUP_FILES = ["app/lib/followups.ts", "packages/db/followups.ts", "app/lib/followups-client.ts"];
const FORBIDDEN = ["effectiveCategory", "readCategoryAssignments", "counts_as_spending", "countsAsSpending"];

describe("followups orthogonality guard (WLT-25-1)", () => {
  for (const rel of FOLLOWUP_FILES) {
    it(`${rel} never touches the category/budget axis`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      for (const token of FORBIDDEN) {
        expect(src, `${rel} must not reference ${token} (orthogonality)`).not.toContain(token);
      }
    });
  }
});
