import { describe, expect, it } from "vitest";
import {
  CLUSTER_MAX_RATIO,
  DETECT_MIN_CONFIDENCE,
  type MarkedTxn,
  clusterByPrice,
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

describe("clusterByPrice (WLT-24-3 — a vendor can bill several subscriptions)", () => {
  const at = (amount: number, i: number): MarkedTxn => ({
    dedupKey: `${amount}-${i}`,
    merchant: "Vendor",
    description: "Vendor",
    amount,
    occurredOn: addDays("2026-01-01", i * 30),
  });
  const ids = (txns: MarkedTxn[]) => [...clusterByPrice(txns).keys()].sort();

  it("splits genuinely distinct prices (Sony $13.99 vs $45 — 3.2x gap)", () => {
    expect(CLUSTER_MAX_RATIO).toBe(1.25);
    expect(ids([at(13.99, 0), at(13.99, 1), at(45, 2), at(45, 3)])).toEqual(["c:13.99", "c:45.00"]);
  });

  it("keeps a single sub's PRICE CREEP together (Netflix $15.49 → $16.99 → +10%)", () => {
    expect(ids([at(15.49, 0), at(16.49, 1), at(16.99, 2)])).toEqual(["c:15.49"]); // one cluster
  });

  it("a single fixed price is one cluster", () => {
    expect(ids([at(9.99, 0), at(9.99, 1), at(9.99, 2)])).toEqual(["c:9.99"]);
  });

  it("two distinct subs at the SAME price cannot be split (documented limitation)", () => {
    expect(ids([at(9.99, 0), at(9.99, 1), at(9.99, 2), at(9.99, 3)])).toEqual(["c:9.99"]); // one cluster
  });
});

describe("summarizeSubscriptions × clusters (WLT-24-3)", () => {
  it("shows a multi-sub vendor as TWO rows with correct amounts + a SUMMED headline", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "a1", occurredOn: "2026-01-01", amount: 13.99, merchant: "Sony PlayStation" }),
      tx({ dedupKey: "a2", occurredOn: "2026-02-01", amount: 13.99, merchant: "Sony PlayStation" }),
      tx({ dedupKey: "b1", occurredOn: "2026-01-15", amount: 45, merchant: "Sony PlayStation" }),
      tx({ dedupKey: "b2", occurredOn: "2026-02-15", amount: 45, merchant: "Sony PlayStation" }),
    ]);
    expect(out.subscriptions).toHaveLength(2); // the two series, no longer one blended irregular row
    expect(out.subscriptions.map((s) => s.typicalAmount).sort((a, b) => a - b)).toEqual([13.99, 45]);
    expect(new Set(out.subscriptions.map((s) => s.normKey)).size).toBe(2); // unique composite keys
    expect(out.monthlyTotal).toBe(round2(13.99 + 45)); // summed, not one excluded
  });

  it("a single-cluster vendor is unchanged (one row) — regression guard", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "n1", occurredOn: "2026-04-02", amount: 15.49, merchant: "Netflix" }),
      tx({ dedupKey: "n2", occurredOn: "2026-05-02", amount: 16.99, merchant: "Netflix" }), // +10% creep
      tx({ dedupKey: "n3", occurredOn: "2026-06-01", amount: 16.99, merchant: "Netflix" }),
    ]);
    expect(out.subscriptions).toHaveLength(1);
    expect(out.subscriptions[0].cadence).toBe("monthly");
  });
});

describe("longer cadences + last-charged + inactive (WLT-24-4)", () => {
  const seriesAt = (gapDays: number, amount = 9) =>
    summarizeSubscriptions([
      tx({ dedupKey: "g1", occurredOn: "2026-01-01", amount, merchant: "Band" }),
      tx({ dedupKey: "g2", occurredOn: addDays("2026-01-01", gapDays), amount, merchant: "Band" }),
    ]).subscriptions[0];

  it("infers the monthly-multiple cadences (every 2/3/6 months) at the band centers", () => {
    expect(seriesAt(61).cadence).toBe("bimonthly");
    expect(seriesAt(91).cadence).toBe("quarterly");
    expect(seriesAt(182).cadence).toBe("semiannual");
  });

  it("leaves the gaps between bands as irregular (no force-fit)", () => {
    expect(seriesAt(45).cadence).toBe("irregular"); // 36–49 gap
    expect(seriesAt(75).cadence).toBe("irregular"); // 71–79 gap
    expect(seriesAt(130).cadence).toBe("irregular"); // 106–159 gap
  });

  it("normalizes each longer cadence to a monthly figure", () => {
    expect(seriesAt(61, 20).monthlyEquivalent).toBe(10); // every 2 months → /2
    expect(seriesAt(91, 49.99).monthlyEquivalent).toBe(16.66); // every 3 months → /3
    expect(seriesAt(182, 60).monthlyEquivalent).toBe(10); // every 6 months → /6
  });

  it("detects the operator's real quarterly Sony $49.99 (91-day intervals → $16.66/mo)", () => {
    const sony: MarkedTxn[] = [
      { dedupKey: "s1", merchant: "Sony PlayStation", description: "Sony", amount: 49.99, occurredOn: "2025-12-01" },
      { dedupKey: "s2", merchant: "Sony PlayStation", description: "Sony", amount: 49.99, occurredOn: "2026-03-02" },
      { dedupKey: "s3", merchant: "Sony PlayStation", description: "Sony", amount: 49.99, occurredOn: "2026-06-01" },
    ];
    const detected = detectSubscriptions({ txns: sony });
    expect(detected).toHaveLength(1);
    expect(detected[0].cadence).toBe("quarterly"); // was `irregular` → dropped before WLT-24-4
    const summary = summarizeSubscriptions(sony, "2026-06-23");
    expect(summary.subscriptions[0].monthlyEquivalent).toBe(16.66);
    expect(summary.monthlyTotal).toBe(16.66);
  });

  it("surfaces the last-charged date", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "n1", occurredOn: "2026-04-02", amount: 10, merchant: "Netflix" }),
      tx({ dedupKey: "n2", occurredOn: "2026-05-02", amount: 10, merchant: "Netflix" }),
    ]);
    expect(out.subscriptions[0].lastChargedOn).toBe("2026-05-02");
  });

  it("flags a series overdue by a full cycle as inactive + drops it from the headline", () => {
    const txns = [
      tx({ dedupKey: "m1", occurredOn: "2026-01-01", amount: 10, merchant: "OldSub" }),
      tx({ dedupKey: "m2", occurredOn: "2026-02-01", amount: 10, merchant: "OldSub" }),
      tx({ dedupKey: "m3", occurredOn: "2026-03-01", amount: 10, merchant: "OldSub" }),
    ];
    // ~30d cadence, last charged Mar 1; asOf Jun 23 → 114d > 60d (2×) → inactive, not counted.
    const stale = summarizeSubscriptions(txns, "2026-06-23");
    expect(stale.subscriptions[0].inactive).toBe(true);
    expect(stale.monthlyTotal).toBe(0);
    // a recent asOf → active, counted.
    const active = summarizeSubscriptions(txns, "2026-03-20");
    expect(active.subscriptions[0].inactive).toBe(false);
    expect(active.monthlyTotal).toBe(10);
  });

  it("inactive boundary: exactly 2× the interval is still active; just over flips it", () => {
    const txns = [
      tx({ dedupKey: "b1", occurredOn: "2026-01-01", amount: 10, merchant: "B" }),
      tx({ dedupKey: "b2", occurredOn: "2026-01-31", amount: 10, merchant: "B" }), // 30d interval
    ];
    expect(summarizeSubscriptions(txns, addDays("2026-01-31", 60)).subscriptions[0].inactive).toBe(false); // 60 not > 60
    expect(summarizeSubscriptions(txns, addDays("2026-01-31", 61)).subscriptions[0].inactive).toBe(true); // 61 > 60
  });

  it("no asOf ⇒ never flags inactive (safe default)", () => {
    const out = summarizeSubscriptions([
      tx({ dedupKey: "z1", occurredOn: "2020-01-01", amount: 10, merchant: "Ancient" }),
      tx({ dedupKey: "z2", occurredOn: "2020-02-01", amount: 10, merchant: "Ancient" }),
    ]);
    expect(out.subscriptions[0].inactive).toBe(false);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  it("detects each price SERIES of a multi-sub vendor as its own candidate (the WLT-24-3 fix)", () => {
    // Two Sony subs ($13.99 + $45) on different days — interleaved they'd read as
    // irregular and BOTH vanish. Per-cluster, each is detected.
    const txns: MarkedTxn[] = [
      ...monthly("Sony PlayStation", [13.99, 13.99, 13.99], { start: "2026-01-01" }),
      ...monthly("Sony PlayStation", [45, 45, 45], { start: "2026-01-15" }),
    ];
    const out = detectSubscriptions({ txns });
    expect(out).toHaveLength(2);
    const amounts = out.map((c) => c.typicalAmount).sort((a, b) => a - b);
    expect(amounts).toEqual([13.99, 45]);
    expect(new Set(out.map((c) => c.compositeKey)).size).toBe(2); // distinct series keys
    expect(out.every((c) => c.cadence === "monthly")).toBe(true);
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
