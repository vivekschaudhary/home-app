import { describe, expect, it } from "vitest";
import { INTENT_CLUSTERS } from "./intent";
import {
  NETWORTH_SNAPSHOT,
  archetypeForGoalKind,
  personalizeNetWorth,
  suggestTarget,
} from "./workflow";

describe("archetype registry (WLT-12 — networth_snapshot)", () => {
  it("resolves all 5 of networth_snapshot's goalKinds (AC2)", () => {
    for (const kind of NETWORTH_SNAPSHOT.goalKinds) {
      expect(archetypeForGoalKind(kind)?.key).toBe("networth_snapshot");
    }
  });

  it("every networth goalKind actually exists in the WLT-3 taxonomy (no orphan mapping)", () => {
    const taxonomyKinds = new Set(INTENT_CLUSTERS.flatMap((c) => c.intents.map((i) => i.goalKind)));
    for (const kind of NETWORTH_SNAPSHOT.goalKinds) {
      expect(taxonomyKinds.has(kind)).toBe(true);
    }
  });

  it("unmapped goalKinds return null this story → WLT-11 placeholder (AC12; total coverage = bet exit gate)", () => {
    expect(archetypeForGoalKind("pay_off_debt")).toBeNull();
    expect(archetypeForGoalKind("savings_habit")).toBeNull();
    expect(archetypeForGoalKind("not_a_kind")).toBeNull();
  });
});

describe("personalizeNetWorth (real balances only — AC4)", () => {
  it("computes net worth = assets − debts (credit = debt)", () => {
    const cfg = personalizeNetWorth([
      { kind: "depository", balanceCurrent: 31400 },
      { kind: "credit", balanceCurrent: 7220 },
    ]);
    expect(cfg).toMatchObject({ netWorth: 24180, assets: 31400, debts: 7220 });
  });

  it("returns null with no reported balances — stay pending_data, never a fake figure", () => {
    expect(personalizeNetWorth([])).toBeNull();
    expect(personalizeNetWorth([{ kind: "depository", balanceCurrent: null }])).toBeNull();
  });

  it("ignores null-balance accounts but personalizes from the reported ones", () => {
    const cfg = personalizeNetWorth([
      { kind: "depository", balanceCurrent: 1000.555 },
      { kind: "credit", balanceCurrent: null },
    ]);
    expect(cfg?.assets).toBe(1000.56); // cents-rounded
    expect(cfg?.debts).toBe(0);
  });

  it("handles negative net worth (debts > assets) with a forward target", () => {
    const cfg = personalizeNetWorth([
      { kind: "depository", balanceCurrent: 500 },
      { kind: "credit", balanceCurrent: 4000 },
    ]);
    expect(cfg?.netWorth).toBe(-3500);
    expect(cfg!.suggestedTarget).toBeGreaterThan(-3500); // always ahead of today
  });

  it("suggestTarget is a friendly $500 step, always ≥ $500 ahead", () => {
    expect(suggestTarget(24180) % 500).toBe(0);
    expect(suggestTarget(24180)).toBeGreaterThanOrEqual(24680);
    expect(suggestTarget(0)).toBe(500);
    expect(suggestTarget(-3500)).toBeGreaterThanOrEqual(-3000);
  });
});
