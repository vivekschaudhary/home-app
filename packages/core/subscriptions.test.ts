import { describe, expect, it } from "vitest";
import { type MarkedTxn, summarizeSubscriptions } from "./subscriptions";

const tx = (over: Partial<MarkedTxn> & { dedupKey: string; occurredOn: string; amount: number }): MarkedTxn => ({
  merchant: "Netflix",
  description: "NETFLIX.COM",
  ...over,
});

describe("summarizeSubscriptions (WLT-24-1)", () => {
  it("groups by normalized merchant; typical amount = median; infers MONTHLY from ~30-day intervals", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "n1", occurredOn: "2026-04-02", amount: 15.49, merchant: "NETFLIX.COM" }),
      tx({ dedupKey: "n2", occurredOn: "2026-05-02", amount: 15.49, merchant: "Netflix" }),
      tx({ dedupKey: "n3", occurredOn: "2026-06-01", amount: 16.99, merchant: "Netflix #123" }),
    ]);
    expect(out.subscriptions).toHaveLength(1); // the three variants merged
    const sub = out.subscriptions[0];
    expect(sub.cadence).toBe("monthly");
    expect(sub.occurrences).toBe(3);
    expect(sub.typicalAmount).toBe(15.49); // median of [15.49,15.49,16.99]
    expect(sub.monthlyEquivalent).toBe(15.49);
    expect(out.monthlyTotal).toBe(15.49);
    expect(out.annualTotal).toBe(15.49 * 12);
  });

  it("infers WEEKLY (×4.333) and ANNUAL (÷12) and normalizes both into the monthly total", () => {
    const weekly = summarizeSubscriptions([
      tx({ dedupKey: "w1", occurredOn: "2026-06-01", amount: 3, merchant: "Daily Coffee Club" }),
      tx({ dedupKey: "w2", occurredOn: "2026-06-08", amount: 3, merchant: "Daily Coffee Club" }),
      tx({ dedupKey: "w3", occurredOn: "2026-06-15", amount: 3, merchant: "Daily Coffee Club" }),
    ]);
    expect(weekly.subscriptions[0].cadence).toBe("weekly");
    expect(weekly.subscriptions[0].monthlyEquivalent).toBe(13); // 3 × 4.333 = 12.999 → 13.00

    const annual = summarizeSubscriptions([
      tx({ dedupKey: "a1", occurredOn: "2025-06-01", amount: 120, merchant: "Amazon Prime" }),
      tx({ dedupKey: "a2", occurredOn: "2026-06-01", amount: 120, merchant: "Amazon Prime" }),
    ]);
    expect(annual.subscriptions[0].cadence).toBe("annual");
    expect(annual.subscriptions[0].monthlyEquivalent).toBe(10); // 120 / 12
  });

  it("a single occurrence is PENDING — listed but excluded from the headline (the number stays honest)", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "once", occurredOn: "2026-06-01", amount: 99, merchant: "New Service" }),
      tx({ dedupKey: "m1", occurredOn: "2026-05-01", amount: 10, merchant: "Spotify" }),
      tx({ dedupKey: "m2", occurredOn: "2026-06-01", amount: 10, merchant: "Spotify" }),
    ]);
    const pending = out.subscriptions.find((s) => s.merchant === "New Service");
    expect(pending?.cadence).toBe("pending");
    expect(pending?.monthlyEquivalent).toBeNull();
    // only Spotify (monthly $10) counts toward the headline
    expect(out.monthlyTotal).toBe(10);
  });

  it("an erratic cycle is IRREGULAR — listed but not normalized into the headline", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "i1", occurredOn: "2026-01-01", amount: 5, merchant: "Odd Charge" }),
      tx({ dedupKey: "i2", occurredOn: "2026-01-04", amount: 5, merchant: "Odd Charge" }), // 3-day gap → not weekly/monthly/annual
    ]);
    expect(out.subscriptions[0].cadence).toBe("irregular");
    expect(out.subscriptions[0].monthlyEquivalent).toBeNull();
    expect(out.monthlyTotal).toBe(0);
  });

  it("cadence band boundaries (26 and 35 days are monthly; 25 and 36 are irregular)", () => {
    const at = (gapDays: number) =>
      summarizeSubscriptions([
        tx({ dedupKey: "b1", occurredOn: "2026-06-01", amount: 9, merchant: "Band Test" }),
        tx({ dedupKey: "b2", occurredOn: addDays("2026-06-01", gapDays), amount: 9, merchant: "Band Test" }),
      ]).subscriptions[0].cadence;
    expect(at(26)).toBe("monthly");
    expect(at(35)).toBe("monthly");
    expect(at(25)).toBe("irregular");
    expect(at(36)).toBe("irregular");
  });
});

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
