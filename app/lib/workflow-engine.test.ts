import { describe, expect, it, vi } from "vitest";
import type { AccountBalance } from "@wealth/core";
import {
  type EngineStore,
  type GoalRow,
  type WorkflowRow,
  createWorkflowEngine,
} from "./workflow-engine";

// ── fake store (in-memory) ──────────────────────────────────────────────────
function makeFakes(opts?: {
  goal?: GoalRow | null;
  balances?: AccountBalance[];
  insertConflict?: boolean;
  activateFails?: boolean;
  runResult?: "ok" | "duplicate" | "error";
  existingWorkflow?: WorkflowRow | null;
}) {
  const goal = opts?.goal === undefined ? { id: "g1", kind: "unified_view", status: "pending_workflow" } : opts.goal;
  let workflow: WorkflowRow | null = opts?.existingWorkflow ?? null;
  const runs: Array<{ kind: string; context: Record<string, unknown> }> = [];
  const emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];

  const store: EngineStore = {
    latestLiveGoal: vi.fn(async () => goal),
    liveWorkflowForGoal: vi.fn(async () => workflow),
    insertWorkflow: vi.fn(async (_u, goalId, archetype) => {
      if (opts?.insertConflict) {
        // the racing winner that the re-read should find
        workflow = { id: "wf-winner", goal_id: goalId, archetype, status: "pending_data", config: {} };
        return "conflict" as const;
      }
      workflow = { id: "wf1", goal_id: goalId, archetype, status: "pending_data", config: {} };
      return workflow;
    }),
    activateWorkflow: vi.fn(async (_id, config) => {
      if (opts?.activateFails) return false;
      workflow = workflow ? { ...workflow, status: "active", config: config as unknown as Record<string, unknown> } : null;
      return true;
    }),
    activateGoal: vi.fn(async () => {}),
    activeWorkflowOwned: vi.fn(async (_u, id) =>
      workflow && workflow.id === id && workflow.status === "active" ? { ...workflow, goalKind: goal?.kind ?? "" } : null,
    ),
    insertRun: vi.fn(async (_u, _w, kind, context) => {
      const result = opts?.runResult ?? "ok";
      if (result === "ok") runs.push({ kind, context });
      return result;
    }),
    saveConfig: vi.fn(async (_id, config) => {
      workflow = workflow ? { ...workflow, config } : null;
      return true;
    }),
  };
  const engine = createWorkflowEngine({
    store,
    readBalances: vi.fn(async () => opts?.balances ?? []),
    emit: vi.fn(async (event, _u, payload) => {
      emitted.push({ event, payload });
    }),
  });
  return { engine, store, emitted, runs, getWorkflow: () => workflow };
}

// ── getOrCreateWorkflow ─────────────────────────────────────────────────────
describe("engine.getOrCreateWorkflow (two-phase assembly)", () => {
  it("none when the user has no live goal", async () => {
    const { engine } = makeFakes({ goal: null });
    expect(await engine.getOrCreateWorkflow("u1")).toEqual({ state: "none" });
  });

  it("none for an unmapped goalKind — the WLT-11 placeholder stays (AC12)", async () => {
    const { engine, store } = makeFakes({ goal: { id: "g1", kind: "pay_off_debt", status: "pending_workflow" } });
    expect(await engine.getOrCreateWorkflow("u1")).toEqual({ state: "none" });
    expect(store.insertWorkflow).not.toHaveBeenCalled();
  });

  it("assembles pending_data and STAYS pending without real balances — never fake (AC3/AC4)", async () => {
    const { engine, emitted } = makeFakes({ balances: [] });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view.state).toBe("pending_data");
    expect(emitted).toHaveLength(0); // not assembled-active yet → no event
  });

  it("personalizes once balances exist: active view + goal flip + workflow_assembled {archetype, goal_kind} (AC3/AC8)", async () => {
    const { engine, store, emitted } = makeFakes({
      balances: [
        { kind: "depository", balanceCurrent: 31400 },
        { kind: "credit", balanceCurrent: 7220 },
      ],
    });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view).toMatchObject({ state: "active", config: { netWorth: 24180, assets: 31400, debts: 7220 } });
    expect(store.activateGoal).toHaveBeenCalledWith("g1");
    expect(emitted).toEqual([
      { event: "workflow_assembled", payload: { archetype: "networth_snapshot", goal_kind: "unified_view" } },
    ]);
  });

  it("idempotent under the unique-index race: conflict → re-reads the winner (AC3)", async () => {
    const { engine } = makeFakes({ insertConflict: true, balances: [] });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view).toMatchObject({ state: "pending_data", workflowId: "wf-winner" });
  });

  it("lost the activate race → stays pending this load; no event emitted", async () => {
    const { engine, emitted } = makeFakes({
      activateFails: true,
      balances: [{ kind: "depository", balanceCurrent: 100 }],
    });
    const view = await engine.getOrCreateWorkflow("u1");
    expect(view.state).toBe("pending_data");
    expect(emitted).toHaveLength(0);
  });

  it("a workflow with a set target reads as running (the persistent state)", async () => {
    const { engine } = makeFakes({
      existingWorkflow: {
        id: "wf1",
        goal_id: "g1",
        archetype: "networth_snapshot",
        status: "active",
        config: { netWorth: 100, assets: 100, debts: 0, suggestedTarget: 500, target: 1000 },
      },
    });
    expect(await engine.getOrCreateWorkflow("u1")).toMatchObject({ state: "running", target: 1000 });
  });
});

// ── completeAction ──────────────────────────────────────────────────────────
const ACTIVE: WorkflowRow = {
  id: "wf1",
  goal_id: "g1",
  archetype: "networth_snapshot",
  status: "active",
  config: { netWorth: 100, assets: 100, debts: 0, suggestedTarget: 500 },
};

describe("engine.completeAction (the WAWU unit — exactly once)", () => {
  it("records ONE immutable run + persists the target + emits action_completed {archetype, goal_kind} (AC5/AC8)", async () => {
    const { engine, emitted, runs, getWorkflow } = makeFakes({ existingWorkflow: { ...ACTIVE } });
    const res = await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 1234.567 });
    expect(res).toEqual({ ok: true, target: 1234.57 }); // cents-rounded
    expect(runs).toEqual([{ kind: "target_set", context: { target: 1234.57 } }]);
    expect((getWorkflow()?.config as { target?: number }).target).toBe(1234.57);
    // The WLT-5 funnel CONTRACT: same shape as workflow_assembled.
    expect(emitted).toEqual([
      { event: "action_completed", payload: { archetype: "networth_snapshot", goal_kind: "unified_view" } },
    ]);
  });

  it("rejects a non-finite target", async () => {
    const { engine } = makeFakes({ existingWorkflow: { ...ACTIVE } });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: Number.NaN })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("rejects when the workflow isn't the caller's active workflow", async () => {
    const { engine } = makeFakes({ existingWorkflow: null });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf-x", target: 100 })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("REPLAY (engine layer): a workflow whose target is already set is rejected — no run, no emit", async () => {
    const { engine, emitted, runs } = makeFakes({
      existingWorkflow: { ...ACTIVE, config: { ...ACTIVE.config, target: 1000 } },
    });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 2000 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(runs).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("REPLAY (DB layer): a duplicate run (unique workflow_id+kind) is rejected — never emits", async () => {
    const { engine, emitted } = makeFakes({ existingWorkflow: { ...ACTIVE }, runResult: "duplicate" });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 100 })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(emitted).toHaveLength(0);
  });

  it("a store error surfaces as save_failed (no emit)", async () => {
    const { engine, emitted } = makeFakes({ existingWorkflow: { ...ACTIVE }, runResult: "error" });
    expect(await engine.completeAction({ userId: "u1", workflowId: "wf1", target: 100 })).toEqual({
      ok: false,
      error: "save_failed",
    });
    expect(emitted).toHaveLength(0);
  });
});
