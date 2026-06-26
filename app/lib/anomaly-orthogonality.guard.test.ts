import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// WLT-26-2 orthogonality guard — pinning the two-surface invariant:
//   recap (recap.ts)    → ONLY large_charge | recurring_due | low_balance
//   dashboard (anomaly.ts) → ONLY new_merchant | category_spike
//
// readTopAnomaly must filter by kind (RECAP_ANOMALY_KINDS) so the two new
// dashboard kinds never bleed into the weekly recap card. This test fails
// if someone removes the .in("kind", ...) guard from readTopAnomaly.
const ROOT = join(__dirname, "..", "..");

describe("anomaly-surface orthogonality guard (WLT-26-2)", () => {
  it("recap.ts contains the RECAP_ANOMALY_KINDS kind filter in readTopAnomaly", () => {
    const src = readFileSync(join(ROOT, "app/lib/recap.ts"), "utf8");
    expect(src, "recap.ts must filter anomalies by kind via RECAP_ANOMALY_KINDS").toContain(
      'in("kind", RECAP_ANOMALY_KINDS)',
    );
    expect(src, "recap.ts must declare RECAP_ANOMALY_KINDS with the original 3 kinds").toContain("large_charge");
    expect(src, "recap.ts must declare RECAP_ANOMALY_KINDS with the original 3 kinds").toContain("recurring_due");
    expect(src, "recap.ts must declare RECAP_ANOMALY_KINDS with the original 3 kinds").toContain("low_balance");
  });

  it("recap.ts never passes new_merchant or category_spike to the query builder", () => {
    const src = readFileSync(join(ROOT, "app/lib/recap.ts"), "utf8");
    // These strings should not appear in readTopAnomaly's query — they belong to the dashboard surface only.
    expect(src, "recap.ts must not query for new_merchant anomalies").not.toContain('"new_merchant"');
    expect(src, "recap.ts must not query for category_spike anomalies").not.toContain('"category_spike"');
  });

  it("dashboard anomaly reader (anomaly.ts) never queries recap-only kinds", () => {
    const src = readFileSync(join(ROOT, "app/lib/anomaly.ts"), "utf8");
    expect(src, "anomaly.ts must not query for large_charge anomalies").not.toContain('"large_charge"');
    expect(src, "anomaly.ts must not query for recurring_due anomalies").not.toContain('"recurring_due"');
    expect(src, "anomaly.ts must not query for low_balance anomalies").not.toContain('"low_balance"');
  });
});
