import { describe, expect, it } from "vitest";
import {
  type NetWorthSnapshot,
  type SpendingTxn,
  computeNetWorthMovement,
  computeSpendingComparison,
  computeTargetProgress,
  humanizeCategory,
  selectPromptedAction,
} from "./recap";

// WLT-16 — the recap's pure computations: movement (real or cold-start),
// progress toward target, and the ONE state-ranked action. No I/O.

function snap(capturedOn: string, netWorth: number): NetWorthSnapshot {
  return { capturedOn, netWorth };
}

describe("computeNetWorthMovement", () => {
  it("returns null at cold-start (< 2 snapshots) — never a fabricated number (AC2)", () => {
    expect(computeNetWorthMovement([])).toBeNull();
    expect(computeNetWorthMovement([snap("2026-06-13", 1000)])).toBeNull();
  });

  it("returns null when all samples share one date (no prior period yet)", () => {
    expect(computeNetWorthMovement([snap("2026-06-13", 1000), snap("2026-06-13", 1200)])).toBeNull();
  });

  it("reports UP with the absolute delta, latest vs the prior day", () => {
    const m = computeNetWorthMovement([snap("2026-06-06", 24180), snap("2026-06-13", 24600)]);
    expect(m).toEqual({ direction: "up", delta: 420 });
  });

  it("reports DOWN with a positive delta (magnitude, not sign)", () => {
    const m = computeNetWorthMovement([snap("2026-06-13", 23800), snap("2026-06-06", 24180)]);
    expect(m).toEqual({ direction: "down", delta: 380 });
  });

  it("reports FLAT with zero delta when unchanged", () => {
    const m = computeNetWorthMovement([snap("2026-06-06", 24180), snap("2026-06-13", 24180)]);
    expect(m).toEqual({ direction: "flat", delta: 0 });
  });

  it("uses the LATEST sample against the most recent strictly-older one (unordered input)", () => {
    // Three days; today shares no value with the immediately prior day.
    const m = computeNetWorthMovement([
      snap("2026-06-13", 25000),
      snap("2026-06-01", 20000),
      snap("2026-06-12", 24000),
    ]);
    expect(m).toEqual({ direction: "up", delta: 1000 }); // 25000 vs 24000 (the 12th), not the 1st
  });
});

describe("computeTargetProgress", () => {
  it("returns null when no target is set", () => {
    expect(computeTargetProgress(24600, null, null)).toBeNull();
    expect(computeTargetProgress(24600, undefined, null)).toBeNull();
    expect(computeTargetProgress(24600, 0, null)).toBeNull();
  });

  it("computes percent as current/target and is ON_TRACK when rising toward an unmet target", () => {
    const p = computeTargetProgress(24600, 36000, { direction: "up", delta: 420 });
    expect(p).toEqual({ current: 24600, target: 36000, percent: 68, status: "on_track" });
  });

  it("is AHEAD (percent may exceed 100) when current >= target", () => {
    const p = computeTargetProgress(40000, 36000, { direction: "down", delta: 100 });
    expect(p?.status).toBe("ahead"); // ahead wins even if movement dipped
    expect(p?.percent).toBe(111);
  });

  it("is BEHIND only when the unmet target's net worth FELL since last time", () => {
    const p = computeTargetProgress(24000, 36000, { direction: "down", delta: 600 });
    expect(p?.status).toBe("behind");
  });

  it("is ON_TRACK at cold-start (no movement) for an unmet target — never 'behind' without a signal", () => {
    const p = computeTargetProgress(24000, 36000, null);
    expect(p?.status).toBe("on_track");
  });
});

describe("selectPromptedAction", () => {
  it("returns null when there's no target (WorkflowCard owns onboarding)", () => {
    expect(selectPromptedAction(null)).toBeNull();
  });

  it("behind → adjust_target (recap_adjust_target)", () => {
    const a = selectPromptedAction({ current: 24000, target: 36000, percent: 67, status: "behind" });
    expect(a?.type).toBe("adjust_target");
    expect(a?.kind).toBe("recap_adjust_target");
    expect(a?.suggestedTarget).toBeGreaterThan(24000);
  });

  it("on_track → raise_target (a real forward choice, not a vanity tap)", () => {
    const a = selectPromptedAction({ current: 24600, target: 36000, percent: 68, status: "on_track" });
    expect(a?.type).toBe("raise_target");
    expect(a?.kind).toBe("recap_raise_target");
  });

  it("ahead → raise_target", () => {
    const a = selectPromptedAction({ current: 40000, target: 36000, percent: 111, status: "ahead" });
    expect(a?.type).toBe("raise_target");
  });
});

describe("humanizeCategory", () => {
  it("null/empty → 'Other'", () => {
    expect(humanizeCategory(null)).toBe("Other");
    expect(humanizeCategory("")).toBe("Other");
    expect(humanizeCategory(undefined)).toBe("Other");
  });
  it("title-cases Plaid primary categories", () => {
    expect(humanizeCategory("FOOD_AND_DRINK")).toBe("Food And Drink");
    expect(humanizeCategory("GENERAL_MERCHANDISE")).toBe("General Merchandise");
    expect(humanizeCategory("groceries")).toBe("Groceries");
  });
});

describe("computeSpendingComparison", () => {
  const ASOF = "2026-06-15";
  // windows: this-week (2026-06-08, 06-15]; prior-week (2026-06-01, 06-08]
  function tx(occurredOn: string, amount: number, direction = "debit", category: string | null = "GROCERIES"): SpendingTxn {
    return { occurredOn, amount, direction, category, currency: "USD" };
  }

  it("returns null when nothing was spent this week (omit the section, AC3)", () => {
    expect(computeSpendingComparison([], ASOF)).toBeNull();
    // only credits this week → no spend
    expect(computeSpendingComparison([tx("2026-06-10", 500, "credit")], ASOF)).toBeNull();
    // only prior-week debits → nothing spent THIS week
    expect(computeSpendingComparison([tx("2026-06-03", 100)], ASOF)).toBeNull();
  });

  it("compares this week vs last when the prior week had activity", () => {
    const s = computeSpendingComparison(
      [
        tx("2026-06-10", 420, "debit", "GROCERIES"),
        tx("2026-06-12", 310, "debit", "FOOD_AND_DRINK"),
        tx("2026-06-03", 600, "debit", "GROCERIES"), // prior week
      ],
      ASOF,
    );
    expect(s?.thisWeek).toBe(730);
    expect(s?.comparable).toBe(true);
    expect(s?.delta).toEqual({ direction: "more", amount: 130 }); // 730 vs 600
    expect(s?.topCategories).toEqual([
      { category: "Groceries", amount: 420 },
      { category: "Food And Drink", amount: 310 },
    ]);
  });

  it("'less' when this week is below last week", () => {
    const s = computeSpendingComparison([tx("2026-06-10", 400), tx("2026-06-03", 600)], ASOF);
    expect(s?.delta).toEqual({ direction: "less", amount: 200 });
  });

  it("'same' when equal", () => {
    const s = computeSpendingComparison([tx("2026-06-10", 500), tx("2026-06-03", 500)], ASOF);
    expect(s?.delta).toEqual({ direction: "same", amount: 0 });
  });

  it("first-week (no prior-week activity) → comparable:false, this-week-only, no fabricated delta (AC3)", () => {
    const s = computeSpendingComparison([tx("2026-06-10", 420), tx("2026-06-13", 80)], ASOF);
    expect(s?.thisWeek).toBe(500);
    expect(s?.comparable).toBe(false);
    expect(s?.delta).toBeNull();
  });

  it("a quiet-but-present prior week (a credit, no debits) is a real comparison vs $0", () => {
    const s = computeSpendingComparison([tx("2026-06-10", 300), tx("2026-06-03", 900, "credit")], ASOF);
    expect(s?.comparable).toBe(true);
    expect(s?.delta).toEqual({ direction: "more", amount: 300 }); // 300 this week vs 0 debits last
  });

  it("rolls up + sorts top categories desc, capped at 3", () => {
    const s = computeSpendingComparison(
      [
        tx("2026-06-09", 50, "debit", "TRANSPORT"),
        tx("2026-06-10", 420, "debit", "GROCERIES"),
        tx("2026-06-11", 100, "debit", "GROCERIES"),
        tx("2026-06-12", 310, "debit", "FOOD_AND_DRINK"),
        tx("2026-06-13", 90, "debit", "ENTERTAINMENT"),
        tx("2026-06-03", 10, "debit"), // prior week → comparability
      ],
      ASOF,
    );
    expect(s?.topCategories).toEqual([
      { category: "Groceries", amount: 520 },
      { category: "Food And Drink", amount: 310 },
      { category: "Entertainment", amount: 90 },
    ]); // top 3 by amount desc; Transport (50) drops off
  });
});
