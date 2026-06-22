import { describe, expect, it } from "vitest";
import {
  DETECT_MIN_CONFIDENCE,
  type MarkedTxn,
  detectSubscriptions,
  subscriptionMerchantKey,
  summarizeSubscriptions,
} from "./subscriptions";

describe("subscriptionMerchantKey (WLT-24-1 mark-the-merchant)", () => {
  it("prefers the stable entity id (robust to name drift)", () => {
    expect(subscriptionMerchantKey("NETFLIX.COM #123", "ent-netflix")).toBe("e:ent-netflix");
    expect(subscriptionMerchantKey("Netflix", "ent-netflix")).toBe("e:ent-netflix"); // same merchant despite a different name
  });
  it("falls back to the normalized name when there's no entity id", () => {
    expect(subscriptionMerchantKey("NETFLIX.COM #123", null)).toBe(subscriptionMerchantKey("Netflix", null));
    expect(subscriptionMerchantKey("Netflix", null)).toMatch(/^n:/);
  });
  it("is null when the merchant is unidentifiable (mark just the one charge)", () => {
    expect(subscriptionMerchantKey(null, null)).toBeNull();
    expect(subscriptionMerchantKey("", undefined)).toBeNull();
  });
});

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

// WLT-24-2 — the custom detector. Build N monthly-spaced charges for one merchant.
function monthly(
  merchant: string,
  amounts: number[],
  opts: { start?: string; entityId?: string | null; gap?: number } = {},
): MarkedTxn[] {
  const start = opts.start ?? "2026-01-01";
  const gap = opts.gap ?? 30;
  return amounts.map((amount, i) => ({
    dedupKey: `${merchant}-${i}`,
    merchant,
    merchantEntityId: opts.entityId ?? null,
    description: merchant,
    amount,
    occurredOn: addDays(start, i * gap),
  }));
}

describe("detectSubscriptions (WLT-24-2 — high-precision auto-detection)", () => {
  it("detects a regular, stable, frequent merchant (cadence + confidence + fan-out)", () => {
    const out = detectSubscriptions({ txns: monthly("Netflix", [9.99, 9.99, 9.99, 9.99]) });
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.cadence).toBe("monthly");
    expect(c.occurrences).toBe(4);
    expect(c.typicalAmount).toBe(9.99);
    expect(c.confidence).toBeGreaterThanOrEqual(DETECT_MIN_CONFIDENCE);
    expect(c.merchantKey).toBe("n:netflix");
    expect(c.dedupKeys).toHaveLength(4); // every charge of the merchant is flagged
  });

  it("groups by the stable entity id (name drift does not split a merchant)", () => {
    const txns = [
      ...monthly("NETFLIX.COM #1", [9.99], { entityId: "ent-nflx", start: "2026-01-01" }),
      ...monthly("Netflix", [9.99], { entityId: "ent-nflx", start: "2026-02-01" }),
      ...monthly("NETFLIX #823", [9.99], { entityId: "ent-nflx", start: "2026-03-03" }),
    ];
    const out = detectSubscriptions({ txns });
    expect(out).toHaveLength(1);
    expect(out[0].merchantKey).toBe("e:ent-nflx");
    expect(out[0].occurrences).toBe(3);
  });

  it("skips a merchant with too few occurrences (<3 — stricter than a human mark)", () => {
    expect(detectSubscriptions({ txns: monthly("Hulu", [12.99, 12.99]) })).toHaveLength(0);
  });

  it("skips an irregular cadence (no clean weekly/monthly/annual cycle)", () => {
    const erratic = [
      { dedupKey: "e0", merchant: "Odd", merchantEntityId: null, description: "Odd", amount: 5, occurredOn: "2026-01-01" },
      { dedupKey: "e1", merchant: "Odd", merchantEntityId: null, description: "Odd", amount: 5, occurredOn: "2026-01-04" },
      { dedupKey: "e2", merchant: "Odd", merchantEntityId: null, description: "Odd", amount: 5, occurredOn: "2026-01-20" },
    ];
    expect(detectSubscriptions({ txns: erratic })).toHaveLength(0);
  });

  it("skips an unstable amount (CV > 10% — a variable bill is not a subscription)", () => {
    expect(detectSubscriptions({ txns: monthly("Corner Store", [10, 10, 60, 12]) })).toHaveLength(0);
  });

  it("skips an unmatchable merchant (no name and no entity id)", () => {
    const anon = [0, 1, 2].map((i) => ({
      dedupKey: `x${i}`,
      merchant: null,
      merchantEntityId: null,
      description: "",
      amount: 7,
      occurredOn: addDays("2026-01-01", i * 30),
    }));
    expect(detectSubscriptions({ txns: anon })).toHaveLength(0);
  });

  it("confidence floor: a clean fixed-price 3× monthly clears it; a shaky-interval 3× does not", () => {
    // Clean: intervals [30,30], fixed amount → confidence well above the floor.
    const clean = detectSubscriptions({ txns: monthly("Spotify", [10.99, 10.99, 10.99]) });
    expect(clean).toHaveLength(1);
    expect(clean[0].confidence).toBeGreaterThanOrEqual(DETECT_MIN_CONFIDENCE);

    // Shaky: median interval still monthly (median of [26,35]=30.5) but the spread
    // drags regularity down → confidence dips below the floor → held back.
    const shaky: MarkedTxn[] = [
      { dedupKey: "s0", merchant: "Gym", merchantEntityId: null, description: "Gym", amount: 10.99, occurredOn: "2026-01-01" },
      { dedupKey: "s1", merchant: "Gym", merchantEntityId: null, description: "Gym", amount: 10.99, occurredOn: addDays("2026-01-01", 26) },
      { dedupKey: "s2", merchant: "Gym", merchantEntityId: null, description: "Gym", amount: 10.99, occurredOn: addDays(addDays("2026-01-01", 26), 35) },
    ];
    expect(detectSubscriptions({ txns: shaky })).toHaveLength(0);
  });

  it("detects multiple merchants in one pass, most-confident first", () => {
    const out = detectSubscriptions({
      txns: [
        ...monthly("Netflix", [15.99, 15.99, 15.99, 15.99, 15.99]),
        ...monthly("Audible", [14.95, 14.95, 14.95], { start: "2026-02-02" }),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].merchantKey).toBe("n:netflix"); // 5× steady outranks 3×
    expect(out[0].confidence).toBeGreaterThanOrEqual(out[1].confidence);
  });
});
