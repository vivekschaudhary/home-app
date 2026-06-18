import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WLT-22-2 AC4 (load-bearing guard) — EVERY grouping reader must resolve the
// user's category through the ONE shared helper (saved ?? Plaid), never group by
// raw `transactions.category`. If a new reader is added that groups by category,
// it must route through the resolver too, or surfaces disagree (the brief's #1
// guardrail). This asserts the three readers reference the resolver + the shared
// assignment read.
const ROOT = join(__dirname, "..", "..");
const READERS = [
  "app/lib/budget.ts",
  "app/lib/recap.ts",
  "packages/jobs/recap/anomaly-scan.ts",
];

describe("category resolution guard (AC4)", () => {
  for (const rel of READERS) {
    it(`${rel} resolves through effectiveCategory + readCategoryAssignments`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} must call effectiveCategory`).toContain("effectiveCategory(");
      expect(src, `${rel} must read the shared assignment map`).toContain("readCategoryAssignments(");
    });
  }
});
