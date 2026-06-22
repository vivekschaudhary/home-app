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
