import { describe, expect, it } from "vitest";
import {
  type NetWorthSnapshot,
  computeNetWorthMovement,
  computeTargetProgress,
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
