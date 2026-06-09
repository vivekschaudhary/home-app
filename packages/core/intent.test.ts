import { describe, expect, it } from "vitest";
import { INTENT_CLUSTERS, deriveGoal, resolveIntent } from "./intent";

describe("intent taxonomy", () => {
  it("covers all 6 clusters with unique intent_keys", () => {
    const clusters = INTENT_CLUSTERS.map((c) => c.cluster);
    expect(new Set(clusters)).toEqual(new Set(["fear", "goal", "confusion", "control", "habit", "aspiration"]));
    const keys = INTENT_CLUSTERS.flatMap((c) => c.intents.map((i) => i.intentKey));
    expect(new Set(keys).size).toBe(keys.length); // all unique
    expect(keys.length).toBeGreaterThanOrEqual(13);
  });

  it("resolves a valid {cluster, intentKey}", () => {
    const r = resolveIntent("fear", "fear_overspending");
    expect(r?.intent.intentKey).toBe("fear_overspending");
    expect(r?.intent.goalKind).toBe("control_spending");
  });

  it("rejects an unknown intent_key", () => {
    expect(resolveIntent("fear", "fear_nope")).toBeNull();
  });

  it("rejects a cluster/key mismatch (no spoofing)", () => {
    // key exists, but under 'fear' — declaring it as 'goal' must fail
    expect(resolveIntent("goal", "fear_overspending")).toBeNull();
  });

  it("derives a Goal (kind from the intent, empty params)", () => {
    const r = resolveIntent("goal", "goal_save_specific");
    expect(r).not.toBeNull();
    expect(deriveGoal(r!.intent)).toEqual({ kind: "save_specific", params: {} });
  });
});
